/**
 * The Release notes this build ships, and the unread dot on the "What's new" menu entry.
 *
 * The fragments are bundled at build time, so every build knows exactly the
 * notes up to its own version. What a player has seen is remembered per browser
 * in localStorage; storage that is unavailable means no dot.
 */

import { useEffect, useSyncExternalStore } from "react";
import { displayedReleases, parseReleaseNotes, seenReleaseNotes, unreadReleaseNotes } from "src/utils/release-notes";
import type { Release, Unread } from "src/utils/release-notes";

const FILES = import.meta.glob<string>("/release-notes/*/*.yaml", { query: "?raw", import: "default", eager: true });

/** The Releases the "What's new" page shows, newest first */
export const RELEASES: Array<Release> = displayedReleases(parseReleaseNotes(FILES).releases, import.meta.env.DEV);

const STORAGE_KEY = "release-notes.last-seen";

const listeners = new Set<() => void>();
let unread: Unread | null = null;

/**
 * The unread decision for this page load, read from storage once
 *
 * @returns whether the dot shows and what is still to be remembered
 */
function readUnread(): Unread {
    if (unread === null) {
        try {
            unread = unreadReleaseNotes(localStorage.getItem(STORAGE_KEY), RELEASES, __APP_VERSION__);
        } catch {
            unread = { dot: false, store: null };
        }
    }
    return unread;
}

/**
 * Remembers a Release as the last one seen, tolerating unavailable storage
 *
 * @param release the Release to remember
 */
function remember(release: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, release);
    } catch {
        return;
    }
}

/**
 * Registers a listener for changes of the dot
 *
 * @param listener called when the dot changes
 *
 * @returns the unsubscribe function
 */
function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Remembers every displayed Release note as seen and puts the dot away */
export function markReleaseNotesSeen(): void {
    remember(seenReleaseNotes(RELEASES, __APP_VERSION__));
    unread = { dot: false, store: null };
    for (const listener of listeners) listener();
}

/**
 * Whether the "What's new" menu entry carries the unread dot. On a first
 * visit it silently remembers the running Release.
 *
 * @returns `true` when there are Release notes this browser has not seen
 */
export function useUnreadReleaseNotes(): boolean {
    const decision = useSyncExternalStore(subscribe, readUnread);

    useEffect(() => {
        if (decision.store !== null) remember(decision.store);
    }, [decision]);

    return decision.dot;
}
