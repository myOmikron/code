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

const NODE_RADIUS_PER_NODE = 34;
const MIN_RING_RADIUS = 58;
const NODE_SIZE = 44;
const LABEL_HEIGHT = 30;
const PADDING = 28;

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
    const size = radius * 2 + NODE_SIZE + PADDING;
    const cx = size / 2;
    const cy = LABEL_HEIGHT + size / 2;

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
        width: size,
        height: LABEL_HEIGHT + size,
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
