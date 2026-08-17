/**
 * Single-key shortcuts for a page.
 *
 * Written here rather than pulled in: the app's dependencies are pinned in the
 * workspace catalog, and a keydown listener that ignores text fields is twenty
 * lines. Chords are deliberately absent — a deck builder wants `a` to add a
 * card, not a modifier dance.
 */

import { useEffect } from "react";

/** What a key does, keyed by the key itself */
export type Shortcuts = Record<string, () => void>;

/**
 * Run a handler when its key is pressed
 *
 * Keys pressed while typing are left alone: a search field is where most of the
 * building happens, and swallowing the `a` of "Arcane" would be worse than
 * having no shortcuts at all. Modifiers are ignored for the same reason — those
 * belong to the browser.
 *
 * @param shortcuts what each key does
 * @param enabled whether the keys are live, e.g. `false` while a dialog is open
 */
export function useShortcuts(shortcuts: Shortcuts, enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        /**
         * Runs the handler for a pressed key
         *
         * @param event the keydown
         */
        function onKeyDown(event: KeyboardEvent) {
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            const target = event.target;
            if (target instanceof HTMLElement) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
            }

            const handler = shortcuts[event.key.toLowerCase()] ?? shortcuts[event.key];
            if (handler === undefined) return;

            event.preventDefault();
            handler();
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // Rebuilt every render, which is fine: the listener is swapped with it.
    }, [shortcuts, enabled]);
}
