import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadSetFilter, saveSetFilter } from "src/utils/set-filter-storage";

/**
 * Which sets the scanner searches. Chosen on /scan before the camera opens, and shared with the
 *  scanner route from here rather than through the URL: a release expands to a handful of set
 *  codes, which would make for an unreadable link, and the choice is meant to outlive the session
 *  anyway (sorting one box takes several).
 */
type ScanScopeValue = {
    /** Selected set codes. Empty means every set. */
    codes: string[];
    /** Cards reachable under the current selection, given the full set list. */
    choose: (codes: string[]) => void;
};

const ScanScopeContext = createContext<ScanScopeValue | null>(null);

/**
 * Shares the chosen scan scope with the whole app
 */
export function ScanScopeProvider({ children }: { children: ReactNode }) {
    const [codes, setCodes] = useState<string[]>(loadSetFilter);

    const choose = useCallback((next: string[]) => {
        setCodes(next);
        saveSetFilter(next);
    }, []);

    const value = useMemo(() => ({ codes, choose }), [codes, choose]);
    return <ScanScopeContext value={value}>{children}</ScanScopeContext>;
}

/**
 * Access the chosen scan scope
 *
 * @returns the chosen set codes and the setter
 */
export function useScanScope(): ScanScopeValue {
    const value = useContext(ScanScopeContext);
    if (!value) throw new Error("useScanScope must be used inside a ScanScopeProvider");
    return value;
}
