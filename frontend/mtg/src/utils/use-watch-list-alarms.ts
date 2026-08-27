import { useEffect, useState } from "react";
import { Api } from "src/api/api";

/**
 * How many price alarms the reader has not seen yet.
 *
 * Read for the navigation badge, which is drawn on every page, so it is
 * deliberately not fetched on every navigation. The number only moves at two
 * moments: a catalog sync arms or disarms alarms, which happens far more rarely
 * than a page view, and the reader ticks one off, which can only happen on a
 * watch list page. So it is read once on mount and again on the way out of the
 * watch lists, and nowhere else.
 *
 * @param enabled whether there is an account to ask about
 * @param path the pathname the router is currently on
 *
 * @returns the unread count, zero while nothing has been read yet
 */
export function useWatchListAlarms(enabled: boolean, path: string): number {
    const [unread, setUnread] = useState(0);
    const inside = path.startsWith("/watch-lists");

    useEffect(() => {
        if (!enabled) {
            setUnread(0);
            return;
        }
        if (inside) return;

        let cancelled = false;
        void Api.watchLists
            .alarms()
            .then((answer) => {
                if (!cancelled) setUnread(answer.unread);
            })
            // A badge is not worth a page-wide failure: without an answer there
            // is simply nothing to mark.
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [enabled, inside]);

    return unread;
}
