import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { loadCardIndex } from "src/utils/scan-client";
import type { IndexedSet } from "src/utils/set-families";

/**
 * Load state of the all-card index. Mounted on the scan layout route (`routes/scan.tsx`), not on
 * the root, so only the scan path pays for the ~110k-route decode.
 */
type CardIndexValue = {
    status: "loading" | "ready" | "error";
    /** Human-readable decoding progress, shown while `status` is "loading". */
    progress: string;
    cardCount: number;
    setCount: number;
    sets: IndexedSet[];
};

const CardIndexContext = createContext<CardIndexValue | null>(null);

/**
 * The properties for {@link CardIndexProvider}
 */
export type CardIndexProviderProps = {
    children: ReactNode;
};

/**
 * Loads the all-card index once and shares its state with the subtree below it
 *
 * @returns the provider
 */
export function CardIndexProvider({ children }: CardIndexProviderProps) {
    const [tg] = useTranslation();
    const [status, setStatus] = useState<CardIndexValue["status"]>("loading");
    // Kept as raw counts rather than a formatted string: the label has to re-render on a language
    // switch, and the load effect must not depend on `tg` or it would restart the decode.
    const [decoded, setDecoded] = useState<{ done: number; total: number } | null>(null);
    const [cardCount, setCardCount] = useState(0);
    const [setCount, setSetCount] = useState(0);
    const [sets, setSets] = useState<IndexedSet[]>([]);

    useEffect(() => {
        let active = true;
        // Ask the browser to protect this origin's storage from eviction: the index lives in
        // IndexedDB (see index-file-store) and losing hundreds of megabytes to storage pressure
        // means re-downloading them. Best effort — a denial simply leaves the storage evictable.
        void navigator.storage?.persist?.().catch(() => undefined);
        void loadCardIndex((done, total) => {
            if (active) setDecoded({ done, total });
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

    const progress = decoded
        ? tg("label.routing-progress", {
              done: decoded.done.toLocaleString("de-DE"),
              total: decoded.total.toLocaleString("de-DE"),
          })
        : tg("label.loading-index");

    const value = useMemo(
        () => ({ status, progress, cardCount, setCount, sets }),
        [status, progress, cardCount, setCount, sets],
    );
    return <CardIndexContext value={value}>{children}</CardIndexContext>;
}

/**
 * Access the shared all-card index state
 *
 * @returns the index state
 */
export function useCardIndex(): CardIndexValue {
    const value = useContext(CardIndexContext);
    if (!value) throw new Error("useCardIndex must be used inside a CardIndexProvider");
    return value;
}
