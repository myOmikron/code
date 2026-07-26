import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  addPendingScan,
  createPendingScan,
  loadPendingScans,
  removePendingScan,
  removePendingScans,
  replacePendingScanCard,
  savePendingScans,
} from "../pendingScans";
import type { PendingScan } from "../pendingScans";
import type { CardRecord } from "../types";

/** The staging list of recognised cards, shared by the scanner and the review screen. */
type PendingScansValue = {
  scans: PendingScan[];
  /** Stage a freshly recognised card; returns the entry so the caller can undo exactly it.
   *  `alternatives` are the scan's runners-up, kept so a wrong pick stays correctable. */
  add: (card: CardRecord, foil: boolean, alternatives?: CardRecord[]) => PendingScan;
  /** Correct an entry to one of its alternatives. */
  replaceCard: (id: string, card: CardRecord) => void;
  remove: (id: string) => void;
  /** Drop the entries a backend has taken. */
  removeMany: (ids: readonly string[]) => void;
  clear: () => void;
};

const PendingScansContext = createContext<PendingScansValue | null>(null);

export function PendingScansProvider({ children }: { children: ReactNode }) {
  const [scans, setScans] = useState<PendingScan[]>(loadPendingScans);

  useEffect(() => savePendingScans(scans), [scans]);

  const add = useCallback((card: CardRecord, foil: boolean, alternatives: CardRecord[] = []) => {
    const scan = createPendingScan(card, foil, alternatives);
    setScans((current) => addPendingScan(current, scan));
    return scan;
  }, []);

  const replaceCard = useCallback((id: string, card: CardRecord) => {
    setScans((current) => replacePendingScanCard(current, id, card));
  }, []);

  const remove = useCallback((id: string) => setScans((current) => removePendingScan(current, id)), []);
  const removeMany = useCallback((ids: readonly string[]) => setScans((current) => removePendingScans(current, ids)), []);
  const clear = useCallback(() => setScans([]), []);

  const value = useMemo(
    () => ({ scans, add, replaceCard, remove, removeMany, clear }),
    [scans, add, replaceCard, remove, removeMany, clear],
  );
  return <PendingScansContext value={value}>{children}</PendingScansContext>;
}

export function usePendingScans(): PendingScansValue {
  const value = useContext(PendingScansContext);
  if (!value) throw new Error("usePendingScans muss innerhalb von PendingScansProvider verwendet werden.");
  return value;
}
