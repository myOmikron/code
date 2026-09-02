import { createContext, useContext, useEffect, useRef } from "react";

/** One line of the shortcut help */
export type ShortcutRow = { keys: string; description: string };

/** What the menu hands the pages about the global keyboard-shortcut help */
export type ShortcutHelp = {
    /** Whether the help currently covers the page */
    open: boolean;
    /** Opens the help */
    show: () => void;
    /** Hands the menu the rows of the current page, `null` to fall back to its own list */
    register: (rows: Array<ShortcutRow> | null) => void;
};

const ShortcutHelpContext = createContext<ShortcutHelp>({
    open: false,
    show: () => undefined,
    register: () => undefined,
});

export const ShortcutHelpProvider = ShortcutHelpContext.Provider;

/** @returns whether the global shortcut dialog is open */
export function useShortcutHelpOpen(): boolean {
    return useContext(ShortcutHelpContext).open;
}

/** @returns a function opening the global shortcut dialog */
export function useShowShortcutHelp(): () => void {
    return useContext(ShortcutHelpContext).show;
}

/**
 * Lists a page's shortcuts in the global help for as long as the page is mounted.
 *
 * The rows are compared by content rather than by identity, so a page may build
 * them fresh on every render without re-registering them each time.
 *
 * @param rows the keys and what they do
 */
export function usePageShortcuts(rows: Array<ShortcutRow>): void {
    const { register } = useContext(ShortcutHelpContext);
    const latest = useRef(rows);
    latest.current = rows;
    const signature = rows.map((row) => `${row.keys}\t${row.description}`).join("\n");
    useEffect(() => {
        register(latest.current);
        return () => register(null);
    }, [register, signature]);
}
