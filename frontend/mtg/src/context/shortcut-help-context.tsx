import { createContext, useContext } from "react";

/** Whether the global keyboard-shortcut help currently covers the page. */
const ShortcutHelpContext = createContext(false);

export const ShortcutHelpProvider = ShortcutHelpContext.Provider;

/** @returns whether the global shortcut dialog is open */
export function useShortcutHelpOpen(): boolean {
    return useContext(ShortcutHelpContext);
}
