import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
    addEntry as addSessionEntry,
    createScanEntry,
    createScanSession,
    loadScanSessions,
    removeEntries as removeSessionEntries,
    removeEntry as removeSessionEntry,
    removeSession,
    replaceEntryCard as replaceSessionEntryCard,
    saveScanSessions,
    setSessionTarget,
    updateEntry as updateSessionEntry,
} from "src/utils/scan-sessions";
import type { ScanEntry, ScanSession, ScanTarget } from "src/utils/scan-sessions";
import type { CardRecord } from "src/types";

/** The scan sessions, shared by the scanner, the overview and the review screens. */
type ScanSessionsValue = {
    sessions: ScanSession[];
    /** Open a fresh session; returns it so the caller can navigate into it. */
    createSession: (target?: ScanTarget | null) => ScanSession;
    deleteSession: (sessionId: string) => void;
    /** Point a session at the collection it will be transferred into. */
    setTarget: (sessionId: string, target: ScanTarget | null) => void;
    /**
     * Stage a freshly recognised card; returns the entry so the caller can undo exactly it.
     *  `alternatives` are the scan's runners-up, kept so a wrong pick stays correctable.
     */
    addEntry: (sessionId: string, card: CardRecord, foil: boolean, alternatives?: CardRecord[]) => ScanEntry;
    /** Correct an entry's editable fields. */
    updateEntry: (
        sessionId: string,
        entryId: string,
        patch: Partial<Pick<ScanEntry, "quantity" | "finish" | "condition" | "purchasePriceCents" | "acquiredAt">>,
    ) => void;
    /** Correct an entry to one of its alternatives. */
    replaceEntryCard: (sessionId: string, entryId: string, card: CardRecord) => void;
    removeEntry: (sessionId: string, entryId: string) => void;
    /** Drop the entries a transfer has taken. */
    removeEntries: (sessionId: string, entryIds: readonly string[]) => void;
};

const ScanSessionsContext = createContext<ScanSessionsValue | null>(null);

/**
 * Shares the scan sessions with the whole collect flow
 */
export function ScanSessionsProvider({ children }: { children: ReactNode }) {
    const [sessions, setSessions] = useState<ScanSession[]>(loadScanSessions);

    useEffect(() => saveScanSessions(sessions), [sessions]);

    const createSession = useCallback((target: ScanTarget | null = null) => {
        const session = createScanSession(target);
        setSessions((current) => [session, ...current]);
        return session;
    }, []);

    const deleteSession = useCallback((sessionId: string) => {
        setSessions((current) => removeSession(current, sessionId));
    }, []);

    const setTarget = useCallback((sessionId: string, target: ScanTarget | null) => {
        setSessions((current) => setSessionTarget(current, sessionId, target));
    }, []);

    const addEntry = useCallback((sessionId: string, card: CardRecord, foil: boolean, alternatives?: CardRecord[]) => {
        const entry = createScanEntry(card, foil, alternatives);
        setSessions((current) => addSessionEntry(current, sessionId, entry));
        return entry;
    }, []);

    const updateEntry = useCallback(
        (
            sessionId: string,
            entryId: string,
            patch: Partial<Pick<ScanEntry, "quantity" | "finish" | "condition" | "purchasePriceCents" | "acquiredAt">>,
        ) => {
            setSessions((current) => updateSessionEntry(current, sessionId, entryId, patch));
        },
        [],
    );

    const replaceEntryCard = useCallback((sessionId: string, entryId: string, card: CardRecord) => {
        setSessions((current) => replaceSessionEntryCard(current, sessionId, entryId, card));
    }, []);

    const removeEntry = useCallback((sessionId: string, entryId: string) => {
        setSessions((current) => removeSessionEntry(current, sessionId, entryId));
    }, []);

    const removeEntries = useCallback((sessionId: string, entryIds: readonly string[]) => {
        setSessions((current) => removeSessionEntries(current, sessionId, entryIds));
    }, []);

    const value = useMemo(
        () => ({
            sessions,
            createSession,
            deleteSession,
            setTarget,
            addEntry,
            updateEntry,
            replaceEntryCard,
            removeEntry,
            removeEntries,
        }),
        [
            sessions,
            createSession,
            deleteSession,
            setTarget,
            addEntry,
            updateEntry,
            replaceEntryCard,
            removeEntry,
            removeEntries,
        ],
    );
    return <ScanSessionsContext value={value}>{children}</ScanSessionsContext>;
}

/**
 * Access the shared scan sessions
 *
 * @returns the sessions and their operations
 */
export function useScanSessions(): ScanSessionsValue {
    const value = useContext(ScanSessionsContext);
    if (!value) throw new Error("useScanSessions must be used inside a ScanSessionsProvider");
    return value;
}
