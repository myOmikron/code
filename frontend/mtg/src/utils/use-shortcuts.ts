/**
 * Keyboard shortcuts for a page.
 *
 * Written here rather than pulled in: the app's dependencies are pinned in the
 * workspace catalog, and a keydown listener that ignores text fields is small.
 * Ordinary keys are written as themselves; platform find-style chords use the
 * `mod+` prefix, which accepts Control on Windows/Linux and Command on macOS.
 */

import { useEffect } from "react";

/** What a key does, keyed by the key itself or a chord such as `mod+f` */
export type Shortcuts = Record<string, () => void>;

/** What answers to `Enter` and `Space` on its own */
const INTERACTIVE = "a[href],button,summary,[role='button'],[role='link'],[role='menuitem'],[role='option']";

/** What steers itself with the keyboard while it is open */
const NAVIGATED = "[role='listbox'],[role='menu'],[role='combobox'],[role='tablist']";

/**
 * Run a handler when its key is pressed
 *
 * Plain keys pressed while typing are left alone: a search field is where most
 * of the building happens, and swallowing the `a` of "Arcane" would be worse
 * than having no shortcuts at all. Registered `mod+` chords remain available
 * in fields so they can return focus to a page's search.
 *
 * Two more things keep their keys: `Enter` and `Space` belong to whatever is
 * focused, so a page that binds `Enter` does not stop a focused button or link
 * from being pressed, and an open listbox or menu keeps the arrows and letters
 * it navigates itself with.
 *
 * @param shortcuts what each key does
 * @param enabled whether the keys are live, e.g. `false` while a dialog is open
 * @param insideDialogs whether plain keys also fire while a dialog holds the
 *        focus, for the page that put the dialog there — off by default, so a
 *        parent route's keys cannot act on what a dialog covers
 */
export function useShortcuts(shortcuts: Shortcuts, enabled = true, insideDialogs = false) {
    useEffect(() => {
        if (!enabled) return;

        /**
         * Runs the handler for a pressed key
         *
         * @param event the keydown
         */
        function onKeyDown(event: KeyboardEvent) {
            if (event.altKey) return;

            const key = event.key.toLowerCase();
            const modified = event.ctrlKey || event.metaKey;
            const handler = modified ? shortcuts[`mod+${key}`] : (shortcuts[event.key] ?? shortcuts[key]);
            if (handler === undefined) return;

            const target = event.target;
            if (!modified && target instanceof HTMLElement) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
                if ((key === "enter" || key === " ") && target.closest(INTERACTIVE) !== null) return;
                if (target.closest(NAVIGATED) !== null) return;
                if (!insideDialogs && target.closest("[role='dialog'],[role='alertdialog']") !== null) return;
            }

            event.preventDefault();
            handler();
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // Rebuilt every render, which is fine: the listener is swapped with it.
    }, [shortcuts, enabled, insideDialogs]);
}
