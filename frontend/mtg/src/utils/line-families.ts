import { LineEntry, SharedPieceWithLines } from "src/api/graph-generated";

/**
 * One cluster of complete lines that share at least one piece, generalising
 * the cEDH-cockpit mockup's hand-grouped "Underworld Breach — storm combo" /
 * "Narset's Reversal — copy loop" families (`MOCKUP-NOTES.md`, "Family
 * grouping is hand-derived, not a server field") into something that holds
 * for any deck's line report, not just Kess's.
 */
export type LineFamily = {
    /** A stable key for the family — the id of its first line */
    key: string;
    /** The piece shared by the most lines in this family, standing in for the mockup's hand-picked title */
    hub: string;
    /** The family's complete lines, most-played first */
    lines: Array<LineEntry>;
};

/**
 * Groups complete lines into families by connected components over
 * `redundancy.shared_pieces` — two lines belong together the moment they
 * name a shared piece, transitively, so a three-line chain (A–B shares X,
 * B–C shares Y) lands in one family even though A and C share nothing
 * directly. Exactly what the mockup did by hand for Kess's three families;
 * this is that read, generalised.
 *
 * A line that shares no piece with any other complete line still gets a
 * family of its own — a lone line is not an error, it is a family of one.
 *
 * The family's `hub` is the piece appearing in the most of its own member
 * lines: on the mockup's fixture this reproduces exactly the card its author
 * picked by hand ("Underworld Breach", "Narset's Reversal", "Echocasting
 * Symposium" are each the highest-connectivity piece of their own cluster),
 * without inventing the flavour subtitle ("— Sturm-Combo") that came with
 * it — that half was explicitly editorial, not a read of the data.
 *
 * Near-miss (incomplete) lines are not grouped into families — the mockup
 * keeps them in one flat, dimmed list below the families, and this function
 * mirrors that by only ever looking at `complete` lines in the first place.
 *
 * @param lines every line in the report
 * @param sharedPieces `LineReportResponse.redundancy.shared_pieces`
 *
 * @returns the complete lines' families, largest (most lines) first, ties
 *   broken by the family's most-played line
 */
export function lineFamilies(
    lines: ReadonlyArray<LineEntry>,
    sharedPieces: ReadonlyArray<SharedPieceWithLines>,
): Array<LineFamily> {
    const complete = lines.filter((line) => line.complete);
    const parent = new Map<string, string>(complete.map((line) => [line.id, line.id]));

    /**
     * The union-find root a line id currently belongs to, path-compressing on the way
     *
     * @param id the line id to look up
     *
     * @returns its family's root id
     */
    function find(id: string): string {
        let root = id;
        while (parent.get(root) !== root) {
            const next = parent.get(root);
            if (next === undefined) return root;
            root = next;
        }
        // Path-compress every node walked, so a later find() on the same
        // chain is O(1) instead of retracing it — cheap here (a handful of
        // lines), kept anyway since it costs nothing to do right.
        let cursor = id;
        while (cursor !== root) {
            const next = parent.get(cursor);
            if (next === undefined) break;
            parent.set(cursor, root);
            cursor = next;
        }
        return root;
    }

    /**
     * Merges two lines' families into one
     *
     * @param a a line id in the first family
     * @param b a line id in the second family
     */
    function union(a: string, b: string): void {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }

    for (const piece of sharedPieces) {
        const members = piece.line_ids.filter((id) => parent.has(id));
        for (let i = 1; i < members.length; i++) union(members[0], members[i]);
    }

    const grouped = new Map<string, Array<LineEntry>>();
    for (const line of complete) {
        const root = find(line.id);
        const held = grouped.get(root);
        if (held === undefined) grouped.set(root, [line]);
        else held.push(line);
    }

    const families = [...grouped.values()].map((members): LineFamily => {
        const ids = new Set(members.map((line) => line.id));
        let hub = members[0].cards[0]?.name ?? members[0].id;
        let hubReach = 0;
        for (const piece of sharedPieces) {
            const reach = piece.line_ids.filter((id) => ids.has(id)).length;
            if (reach > hubReach) {
                hubReach = reach;
                hub = piece.name;
            }
        }
        return {
            key: members[0].id,
            hub,
            lines: [...members].sort((a, b) => b.popularity - a.popularity),
        };
    });

    return families.sort((a, b) => b.lines.length - a.lines.length || b.lines[0].popularity - a.lines[0].popularity);
}
