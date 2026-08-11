/**
 * Which page numbers a pager offers.
 *
 * An imported collection runs to a few hundred pages, so the pager cannot list
 * them all. It shows the ends, a window around where the reader is, and marks
 * what it left out.
 */

/**
 * The pages to offer around the current one, with `null` where pages are hidden
 *
 * Pages are counted from one, the way the pager labels them.
 *
 * @param current the page being shown
 * @param total how many pages there are
 * @param radius how many pages to offer on either side of the current one
 *
 * @returns page numbers in ascending order, `null` standing for a run of hidden pages
 */
export function pageWindow(current: number, total: number, radius = 1): Array<number | null> {
    if (total < 1) return [];

    // A page number out of range still has to produce a usable pager — it comes
    // from the url and the reader may have typed it.
    const clamped = Math.min(Math.max(current, 1), total);

    // The ends are always reachable: "back to the start" and "how far does this
    // go" are the two things a pager is asked most.
    const shown = new Set<number>([1, total]);
    for (let page = clamped - radius; page <= clamped + radius; page += 1) {
        if (page >= 1 && page <= total) shown.add(page);
    }

    const sorted = [...shown].sort((left, right) => left - right);

    const window: Array<number | null> = [];
    for (const [index, page] of sorted.entries()) {
        const previous = index > 0 ? sorted[index - 1] : undefined;
        if (previous !== undefined) {
            // An ellipsis standing for a single page is a worse deal than that
            // page: it costs the same room and cannot be clicked.
            if (page - previous === 2) window.push(previous + 1);
            else if (page - previous > 2) window.push(null);
        }
        window.push(page);
    }
    return window;
}
