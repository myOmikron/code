import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadCardIndex } from "../scanClient";
import type { IndexedSet } from "../setFamilies";

/** Load state of the all-card index. Owned here rather than by the scan route so switching tabs
 *  mid-load does not restart it — decoding ~110k routes is the app's most expensive startup step. */
type CardIndexValue = {
  status: "loading" | "ready" | "error";
  /** Human-readable decoding progress, shown while `status` is "loading". */
  progress: string;
  cardCount: number;
  setCount: number;
  sets: IndexedSet[];
};

const CardIndexContext = createContext<CardIndexValue | null>(null);

export function CardIndexProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CardIndexValue["status"]>("loading");
  const [progress, setProgress] = useState("Index laden");
  const [cardCount, setCardCount] = useState(0);
  const [setCount, setSetCount] = useState(0);
  const [sets, setSets] = useState<IndexedSet[]>([]);

  useEffect(() => {
    let active = true;
    void loadCardIndex((done, total) => {
      if (active) setProgress(`${done.toLocaleString("de-DE")}/${total.toLocaleString("de-DE")} Routing`);
    })
      .then((summary) => {
        if (!active) return;
        setCardCount(summary.cardCount);
        setSetCount(summary.setCount);
        setSets(summary.sets);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({ status, progress, cardCount, setCount, sets }),
    [status, progress, cardCount, setCount, sets],
  );
  return <CardIndexContext value={value}>{children}</CardIndexContext>;
}

export function useCardIndex(): CardIndexValue {
  const value = useContext(CardIndexContext);
  if (!value) throw new Error("useCardIndex muss innerhalb von CardIndexProvider verwendet werden.");
  return value;
}
