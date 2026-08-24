/**
 * Which way round the screen the table is played on lies.
 *
 * The life tracker seats its players differently on a wide screen than on a
 * tall one, so it has to know which it is on and notice when that changes: a
 * phone turned sideways mid-game reseats the pod, and so does a browser window
 * dragged narrow on the desk.
 *
 * Read off the viewport rather than measured on the tiles: the `orientation`
 * media feature compares exactly the two lengths the seating cares about, and
 * asking the browser is cheaper and steadier than watching an element resize
 * while the tiles inside it are still settling.
 */

import { useEffect, useState } from "react";
import type { TableOrientation } from "src/utils/life-tracker";

/** The query that is true exactly while the viewport is taller than it is wide */
const PORTRAIT = "(orientation: portrait)";

/**
 * Reads the current orientation, defaulting to landscape where there is nothing
 * to ask.
 *
 * @returns the orientation the viewport is in
 */
function current(): TableOrientation {
    if (typeof window.matchMedia !== "function") return "landscape";
    return window.matchMedia(PORTRAIT).matches ? "portrait" : "landscape";
}

/**
 * Follows the viewport's orientation.
 *
 * @returns `"portrait"` while the viewport is taller than it is wide,
 *   `"landscape"` otherwise
 */
export function useTableOrientation(): TableOrientation {
    const [orientation, setOrientation] = useState<TableOrientation>(current);

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;

        const query = window.matchMedia(PORTRAIT);
        const follow = () => setOrientation(query.matches ? "portrait" : "landscape");
        // Turning the device fires the query, but so does a resize that crosses
        // the square: reading it once here catches whatever happened between
        // the first render and this effect.
        follow();
        query.addEventListener("change", follow);
        return () => query.removeEventListener("change", follow);
    }, []);

    return orientation;
}
