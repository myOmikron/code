import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadSetFilter, saveSetFilter } from "../utils/setFilterStorage";

/** Which sets the scanner searches. Chosen on /scan before the camera opens, and shared with the
 *  scanner route from here rather than through the URL: a release expands to a handful of set
 *  codes, which would make for an unreadable link, and the choice is meant to outlive the session
 *  anyway (sorting one box takes several). */
type ScanScopeValue = {
  /** Selected set codes. Empty means every set. */
  codes: string[];
  /** Cards reachable under the current selection, given the full set list. */
  choose: (codes: string[]) => void;
};

const ScanScopeContext = createContext<ScanScopeValue | null>(null);

export function ScanScopeProvider({ children }: { children: ReactNode }) {
  const [codes, setCodes] = useState<string[]>(loadSetFilter);

  const choose = useCallback((next: string[]) => {
    setCodes(next);
    saveSetFilter(next);
  }, []);

  const value = useMemo(() => ({ codes, choose }), [codes, choose]);
  return <ScanScopeContext value={value}>{children}</ScanScopeContext>;
}

export function useScanScope(): ScanScopeValue {
  const value = useContext(ScanScopeContext);
  if (!value) throw new Error("useScanScope muss innerhalb von ScanScopeProvider verwendet werden.");
  return value;
}
