import { LineEntry } from "src/api/graph-generated";
import { LineFamily } from "src/utils/line-families";

/** One plotted card, real or a near-miss's ghosted absence */
export type DiagramNode = {
    /** The card's name, and the diagram's node id */
    name: string;
    /** Centre x, in the family's own local coordinate space */
    x: number;
    /** Centre y, in the family's own local coordinate space */
    y: number;
    /** Whether this card is missing from the deck — drawn faded and dashed */
    ghost: boolean;
    /** Tutors reaching a near-miss line this ghost would complete, name-sorted; empty for a real node */
    tutors: Array<string>;
};

/** One drawn connection between two nodes of the same family */
export type DiagramEdge = {
    /** The source node's name */
    from: string;
    /** The target node's name */
    to: string;
    /** Whether this edge represents a missing piece rather than a real co-occurrence */
    dashed: boolean;
};

/** One family's whole plotted diagram, sized to its own node count */
export type DiagramFamily = {
    /** The family's key, from {@link LineFamily} */
    key: string;
    /** The family's hub card name, used as the cluster's heading */
    hub: string;
    /** How many complete lines this family holds */
    completeCount: number;
    /** The local canvas size this family needs */
    width: number;
    height: number;
    /** Every plotted node, real and ghosted */
    nodes: Array<DiagramNode>;
    /** Every drawn edge */
    edges: Array<DiagramEdge>;
};

const NODE_SIZE = 44;
// Circumference each node gets, which sets the ring's radius. A card is
// `NODE_SIZE` wide, so anything below that packs the ring tighter than the
// cards themselves are — at 16 nodes, 34 apiece drew them overlapping in a
// spiral of stacked artwork. This is a card's width plus a gap; the names
// under them are wider still and can still overlap at high counts, which is
// why the diagram is pannable and zoomable rather than a fixed picture.
const NODE_RADIUS_PER_NODE = NODE_SIZE + 12;
const MIN_RING_RADIUS = 58;
const PADDING = 28;
// What `DeckAdvisorLines` actually draws at each point, which is what the
// canvas has to be big enough to hold: a card centred on the point, as tall
// as a card is (`NODE_ASPECT`), with its name a gap below it. The name sits
// *under* the card, so a ring needs half a card above its topmost node and a
// whole card plus a label below its bottom one — the asymmetry a single
// label allowance added to the top used to get backwards, clipping every
// bottom label in half. The name is also wider than the card it belongs to,
// truncated to about `LABEL_WIDTH` — without room for it, the leftmost and
// rightmost nodes' names ran off the canvas.
const NODE_ASPECT = 1.4;
const LABEL_GAP = 12;
const LABEL_HEIGHT = 14;
const LABEL_WIDTH = 84;

/**
 * Lays a family's cards out on a circle — one solid edge per pair of cards
 * that share a complete line, one dashed edge per near-miss line's missing
 * piece back to whichever of that line's real cards sit in this family.
 *
 * A circle rather than a hand-tuned scatter (the mockup's own approach,
 * `MOCKUP-NOTES.md`: "hand-laid-out for exactly Kess's 9 complete + 1
 * featured near-miss lines") because it is the one layout that never
 * collides and needs no packing algorithm, whatever a family's card count —
 * the property the mockup's author flagged as untested for a busier deck.
 *
 * @param family the family to lay out
 * @param nearMisses every near-miss line in the report — only those with
 *   exactly one missing card and at least one real card already in this
 *   family's node set are drawn as a ghost; the rest stay strips-only, where
 *   every near-miss line is shown regardless
 *
 * @returns the family's plotted nodes and edges, local to its own canvas
 */
export function layoutLineDiagramFamily(family: LineFamily, nearMisses: ReadonlyArray<LineEntry>): DiagramFamily {
    const realNames = new Set<string>();
    for (const line of family.lines) {
        for (const card of line.cards) realNames.add(card.name);
    }

    // Ghost candidates: a near-miss line with exactly one missing card and at
    // least one anchor already in this family. Multiple near-miss lines can
    // point at the same missing card (three different lines all one
    // Reiterate away, in the mockup's fixture) — they collapse onto one
    // ghost node with one dashed edge per distinct anchor.
    const ghostEdgesByName = new Map<string, Set<string>>();
    for (const line of nearMisses) {
        if (line.missing.length !== 1) continue;
        const [missing] = line.missing;
        if (realNames.has(missing)) continue; // already a real node elsewhere in this family
        const anchors = line.cards.filter((card) => card.in_deck && realNames.has(card.name)).map((c) => c.name);
        if (anchors.length === 0) continue;
        const held = ghostEdgesByName.get(missing) ?? new Set<string>();
        for (const anchor of anchors) held.add(anchor);
        ghostEdgesByName.set(missing, held);
    }

    const names = [...realNames, ...ghostEdgesByName.keys()];
    const count = Math.max(names.length, 1);
    const radius = Math.max(MIN_RING_RADIUS, (NODE_RADIUS_PER_NODE * count) / (2 * Math.PI));
    const above = radius + NODE_SIZE / 2;
    const below = radius + NODE_SIZE * NODE_ASPECT - NODE_SIZE / 2 + LABEL_GAP + LABEL_HEIGHT;
    const cx = radius + Math.max(NODE_SIZE, LABEL_WIDTH) / 2 + PADDING / 2;
    const cy = above + PADDING / 2;

    const nodes: Array<DiagramNode> = names.map((name, index) => {
        const angle = (2 * Math.PI * index) / count - Math.PI / 2;
        const ghost = ghostEdgesByName.has(name);
        return {
            name,
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
            ghost,
            tutors: [],
        };
    });

    const edges: Array<DiagramEdge> = [];
    const solidSeen = new Set<string>();
    for (const line of family.lines) {
        const cardNames = line.cards.map((c) => c.name);
        for (let i = 0; i < cardNames.length; i++) {
            for (let j = i + 1; j < cardNames.length; j++) {
                const key = [cardNames[i], cardNames[j]].sort().join("|");
                if (solidSeen.has(key)) continue;
                solidSeen.add(key);
                edges.push({ from: cardNames[i], to: cardNames[j], dashed: false });
            }
        }
    }
    for (const [ghost, anchors] of ghostEdgesByName) {
        for (const anchor of anchors) edges.push({ from: ghost, to: anchor, dashed: true });
    }

    return {
        key: family.key,
        hub: family.hub,
        completeCount: family.lines.length,
        width: cx * 2,
        height: cy + below + PADDING / 2,
        nodes,
        edges,
    };
}

/**
 * Lays out every family for the diagram variant, tutor reach folded onto
 * each ghost node.
 *
 * @param families the report's complete-line families ({@link lineFamilies})
 * @param lines every line in the report, complete and near-miss
 * @param tutorsByLine tutor names reaching each line id, from `tutor_map`
 *
 * @returns one laid-out diagram per family, in the families' own order
 */
export function layoutLineDiagram(
    families: ReadonlyArray<LineFamily>,
    lines: ReadonlyArray<LineEntry>,
    tutorsByLine: ReadonlyMap<string, Array<string>>,
): Array<DiagramFamily> {
    const nearMisses = lines.filter((line) => !line.complete);
    return families.map((family) => {
        const laid = layoutLineDiagramFamily(family, nearMisses);
        const tutorsByGhost = new Map<string, Set<string>>();
        for (const line of nearMisses) {
            if (line.missing.length !== 1) continue;
            const [missing] = line.missing;
            if (!laid.nodes.some((node) => node.name === missing && node.ghost)) continue;
            const held = tutorsByGhost.get(missing) ?? new Set<string>();
            for (const tutor of tutorsByLine.get(line.id) ?? []) held.add(tutor);
            tutorsByGhost.set(missing, held);
        }
        return {
            ...laid,
            nodes: laid.nodes.map((node) =>
                node.ghost ? { ...node, tutors: [...(tutorsByGhost.get(node.name) ?? [])].sort() } : node,
            ),
        };
    });
}
