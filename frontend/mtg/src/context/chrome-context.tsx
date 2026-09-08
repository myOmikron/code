import { createContext, useContext, useEffect } from "react";

/** What the menu hands the pages about its own chrome */
export type Chrome = {
    /** Whether the chrome is hidden right now */
    bare: boolean;
    /** Asks the menu to hide its navigation, or to show it again */
    setBare: (bare: boolean) => void;
};

const ChromeContext = createContext<Chrome>({ bare: false, setBare: () => undefined });

export const ChromeProvider = ChromeContext.Provider;

/** @returns whether a page has asked for the chrome to be hidden */
export function useChromeBare(): boolean {
    return useContext(ChromeContext).bare;
}

/**
 * Hides the app's navigation for as long as a page asks for it.
 *
 * For a page that is a table rather than a screen: on a phone lying between
 * the cards, a menu bar is only lost room.
 *
 * @param bare whether the navigation should be hidden right now
 */
export function useBareChrome(bare: boolean): void {
    const { setBare } = useContext(ChromeContext);
    useEffect(() => {
        setBare(bare);
        return () => setBare(false);
    }, [setBare, bare]);
}
