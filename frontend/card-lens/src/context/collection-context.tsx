import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { addCard, loadCollection, removeCard, saveCollection } from "../collectionStore";
import type { CardRecord, CollectionEntry } from "../types";

/** The on-device collection, shared by every route. Persisted to localStorage on change. */
type CollectionValue = {
  entries: CollectionEntry[];
  add: (card: CardRecord, foil: boolean) => void;
  remove: (cardId: string, foil: boolean) => void;
};

const CollectionContext = createContext<CollectionValue | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CollectionEntry[]>(loadCollection);

  useEffect(() => saveCollection(entries), [entries]);

  const add = useCallback((card: CardRecord, foil: boolean) => {
    setEntries((current) => addCard(current, card, foil));
  }, []);

  const remove = useCallback((cardId: string, foil: boolean) => {
    setEntries((current) => removeCard(current, cardId, foil));
  }, []);

  const value = useMemo(() => ({ entries, add, remove }), [entries, add, remove]);
  return <CollectionContext value={value}>{children}</CollectionContext>;
}

export function useCollection(): CollectionValue {
  const value = useContext(CollectionContext);
  if (!value) throw new Error("useCollection muss innerhalb von CollectionProvider verwendet werden.");
  return value;
}
