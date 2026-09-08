import { useEffect, useState } from "react";

/**
 * Whether a media query matches, kept current as the window changes
 *
 * @param query the media query
 *
 * @returns whether it matches
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(
        () =>
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia(query).matches,
    );

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const list = window.matchMedia(query);
        const follow = () => setMatches(list.matches);
        follow();
        list.addEventListener("change", follow);
        return () => list.removeEventListener("change", follow);
    }, [query]);

    return matches;
}
