/**
 * How many columns a CSS grid currently renders.
 *
 * Read from the resolved style at the moment it is needed rather than cached:
 * the browser has already solved the auto-fill layout, and a resize between
 * two keypresses must not leave a stale count steering the highlight.
 *
 * @param list the grid element
 *
 * @returns the number of columns, at least 1
 */
export function gridColumns(list: HTMLElement): number {
    const tracks = getComputedStyle(list).gridTemplateColumns;
    return tracks === "none" ? 1 : tracks.split(" ").length;
}

/** Keys the highlight answers to */
export type NavKey = "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight";

/**
 * The next highlight position for a key, or `null` for "released".
 *
 * Pure on purpose — this is the whole reachability logic, and a unit test can
 * walk a 3-wide grid of 8 items without a DOM. Down engages at 0 and then
 * steps a row at a time, clamped to the last item so the bottom row is
 * reachable even when partial; Up walks back out of the top row to release
 * the highlight, returning the arrow keys to the text caret.
 *
 * @param active the current highlight, `null` when not engaged
 * @param key which arrow was pressed
 * @param columns how many results share a row
 * @param length how many results there are
 *
 * @returns the next highlight, `null` when released or nothing to highlight
 */
export function stepHighlight(active: number | null, key: NavKey, columns: number, length: number): number | null {
    if (length <= 0) return null;
    const last = length - 1;
    if (active === null) return key === "ArrowDown" ? 0 : null;
    const current = Math.min(active, last);
    switch (key) {
        case "ArrowDown":
            return Math.min(current + columns, last);
        case "ArrowUp": {
            const next = current - columns;
            return next < 0 ? null : next;
        }
        case "ArrowRight":
            return Math.min(current + 1, last);
        case "ArrowLeft":
            return Math.max(current - 1, 0);
    }
}
