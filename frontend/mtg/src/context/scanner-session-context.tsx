import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Api } from "src/api/api";
import type { UUID } from "src/api/api";
import type {
    CardFinish,
    CreateScannerSessionRequest,
    ScannerSessionEntryResponse,
    ScannerSessionResponse,
    UpdateScannerSessionEntryRequest,
    UpdateScannerSessionRequest,
} from "src/api/generated";
import { useAccount } from "src/context/account";
import { usePendingScans } from "src/context/pending-scans-context";
import i18n from "src/i18n";
import { groupPendingScans } from "src/utils/pending-scans";
import { activeSessionUuid, rememberActiveSession } from "src/utils/scan-session";

/**
 * The staging areas and the one being filled
 */
type ScannerSessionsValue = {
    /** Every session this account has, newest first */
    sessions: ScannerSessionResponse[];
    /** The one being filled, `null` before the first load or while signed out */
    active: ScannerSessionResponse | null;
    /** What is staged in it */
    entries: ScannerSessionEntryResponse[];
    /** Copies still sitting in the device's own buffer because the server has not taken them */
    unsynced: number;
    /** Whether the first load is still running */
    loading: boolean;
    /** Reads the session list and the open session again */
    reload: () => Promise<void>;
    /** Fills a different session from now on */
    choose: (session: UUID) => Promise<void>;
    /** Opens a new session and switches to it */
    create: (draft: CreateScannerSessionRequest) => Promise<ScannerSessionResponse | null>;
    /** Renames a session or changes its marker and its collection */
    update: (session: UUID, draft: UpdateScannerSessionRequest) => Promise<void>;
    /** Throws a session and its staging area away */
    remove: (session: UUID) => Promise<void>;
    /** Changes one staged stack */
    updateEntry: (entry: UUID, patch: UpdateScannerSessionEntryRequest) => Promise<void>;
    /** Takes one staged stack out */
    deleteEntry: (entry: UUID) => Promise<void>;
    /** Points the open session at a collection, opening one when there is none */
    aimAt: (collection: UUID, name: string) => Promise<void>;
    /** Files everything staged into a collection and empties the session */
    file: (collection: UUID | null) => Promise<{ copies: number; stacks: number } | null>;
};

const ScannerSessionsContext = createContext<ScannerSessionsValue | null>(null);

/**
 * What a session is called when nobody was asked what to call it.
 *
 * Named after the day it was opened, because that is what tells two of them apart on a shelf: a
 * box is sorted in a sitting, and "Scans" three times over says nothing about which is which.
 * Renaming it is one click away on the session itself.
 *
 * @returns the draft a session is made from when it is opened without ceremony
 */
export function defaultDraft(): CreateScannerSessionRequest {
    return {
        // Read off i18next directly rather than through a hook: this is called from a provider
        // that sits above the app and must not suspend the whole tree waiting for a namespace.
        name: i18n.t("label.session-default", {
            date: new Date().toLocaleDateString(i18n.language, { day: "numeric", month: "long" }),
        }),
        color: "blue",
        icon: "cards",
        collection: null,
    };
}

/**
 * The scanner's staging areas, kept on the server.
 *
 * Scanning happens where there is no signal — a shop's back room, a table at an event — so a
 * recognised card is never handed straight to the network. It lands in the device's own buffer
 * (see {@link usePendingScans}) and is pushed from there into the open session as soon as the
 * server answers. That is the whole reason both exist: the buffer is what makes scanning work at
 * all, and the session is what makes it survive the phone and show up on a desk.
 *
 * Nobody has to know any of that. Someone who never opens the session list gets one session, made
 * the first time they scan anything, and every screen simply says "staged".
 *
 * @returns the provider
 */
export function ScannerSessionsProvider({ children }: { children: ReactNode }) {
    const account = useAccount();
    const { scans, removeMany } = usePendingScans();
    const [sessions, setSessions] = useState<ScannerSessionResponse[]>([]);
    const [active, setActive] = useState<ScannerSessionResponse | null>(null);
    const [entries, setEntries] = useState<ScannerSessionEntryResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const flushing = useRef(false);
    // Not while the session check is still running: asking for sessions as a stranger answers
    // 401, which logs the reader out of a page they are already on.
    const signedIn = !account.loading && account.account !== null;

    /**
     * Reads one session's staging area
     *
     * @param session the session to open
     */
    const open = useCallback(async (session: UUID) => {
        const detail = await Api.scannerSessions.quiet.get(session).catch(() => null);
        if (!detail) return;
        setActive(detail.session);
        setEntries(detail.entries);
        rememberActiveSession(detail.session.uuid);
    }, []);

    const reload = useCallback(async () => {
        if (!signedIn) {
            setSessions([]);
            setActive(null);
            setEntries([]);
            setLoading(false);
            return;
        }
        const answer = await Api.scannerSessions.quiet.list().catch(() => null);
        if (!answer) {
            setLoading(false);
            return;
        }
        setSessions(answer.sessions);
        // The remembered one, or the newest — a session that was deleted elsewhere must not leave
        // the scanner pointing at nothing.
        const remembered = activeSessionUuid();
        const wanted = answer.sessions.find((session) => session.uuid === remembered) ?? answer.sessions[0] ?? null;
        if (wanted) await open(wanted.uuid);
        else {
            setActive(null);
            setEntries([]);
        }
        setLoading(false);
    }, [signedIn, open]);

    useEffect(() => {
        void reload();
    }, [reload]);

    // The buffer empties itself into the open session, opening one if there is none. Scans arrive
    // one card at a time, so this runs whenever the buffer is not empty and stops the moment the
    // server refuses — the cards stay in the buffer and the next scan tries again.
    useEffect(() => {
        if (!signedIn || scans.length === 0 || flushing.current) return;
        flushing.current = true;
        void (async () => {
            try {
                let opened = active;
                if (!opened) {
                    const answer = await Api.scannerSessions.quiet.list().catch(() => null);
                    opened =
                        answer?.sessions[0] ??
                        (await Api.scannerSessions.quiet.create(defaultDraft()).catch(() => null));
                    if (!opened) return;
                    const made = opened;
                    rememberActiveSession(made.uuid);
                    setActive(made);
                    setSessions((current) =>
                        current.some((held) => held.uuid === made.uuid) ? current : [made, ...current],
                    );
                }
                const session = opened;

                // Everything the buffer holds, as stacks. A stack that is already staged in the
                // same shape is counted up rather than laid down beside itself, which is what the
                // staging area is for — one row per card, not one per press of the shutter.
                let staged = entries;
                for (const group of groupPendingScans(scans)) {
                    const finish: CardFinish = group.foil ? "Foil" : "Nonfoil";
                    const held = staged.find(
                        (entry) =>
                            entry.printing === group.card.id &&
                            entry.finish === finish &&
                            !entry.signed &&
                            entry.purchase_price_cents == null,
                    );
                    const written = held
                        ? await Api.scannerSessions.quiet
                              .updateEntry(session.uuid, held.uuid, { quantity: held.quantity + group.ids.length })
                              .catch(() => null)
                        : await Api.scannerSessions.quiet
                              .addEntry(session.uuid, {
                                  printing: group.card.id,
                                  quantity: group.ids.length,
                                  finish,
                                  signed: false,
                                  purchase_price_cents: null,
                              })
                              .catch(() => null);
                    if (!written) return;
                    staged = held
                        ? staged.map((entry) => (entry.uuid === written.uuid ? written : entry))
                        : [written, ...staged];
                    setEntries(staged);
                    // Dropped only once the server has them, one stack at a time: a connection
                    // that dies halfway leaves the rest of the buffer where it is.
                    removeMany(group.ids);
                }
            } finally {
                flushing.current = false;
            }
        })();
    }, [signedIn, scans, active, entries, removeMany]);

    const choose = useCallback(
        async (session: UUID) => {
            rememberActiveSession(session);
            await open(session);
        },
        [open],
    );

    const create = useCallback(async (draft: CreateScannerSessionRequest) => {
        const session = await Api.scannerSessions.create(draft);
        setSessions((current) => [session, ...current]);
        setActive(session);
        setEntries([]);
        rememberActiveSession(session.uuid);
        return session;
    }, []);

    const update = useCallback(
        async (session: UUID, draft: UpdateScannerSessionRequest) => {
            await Api.scannerSessions.update(session, draft);
            const answer = await Api.scannerSessions.quiet.list().catch(() => null);
            if (answer) setSessions(answer.sessions);
            if (active?.uuid === session) await open(session);
        },
        [active, open],
    );

    const remove = useCallback(
        async (session: UUID) => {
            await Api.scannerSessions.delete(session);
            const left = sessions.filter((held) => held.uuid !== session);
            setSessions(left);
            if (active?.uuid === session) {
                setActive(null);
                setEntries([]);
                rememberActiveSession(left[0]?.uuid ?? null);
                if (left[0]) await open(left[0].uuid);
            }
        },
        [sessions, active, open],
    );

    const updateEntry = useCallback(
        async (entry: UUID, patch: UpdateScannerSessionEntryRequest) => {
            if (!active) return;
            const written = await Api.scannerSessions.entries.update(active.uuid, entry, patch);
            setEntries((current) => current.map((held) => (held.uuid === entry ? written : held)));
        },
        [active],
    );

    const deleteEntry = useCallback(
        async (entry: UUID) => {
            if (!active) return;
            await Api.scannerSessions.entries.delete(active.uuid, entry);
            setEntries((current) => current.filter((held) => held.uuid !== entry));
        },
        [active],
    );

    /**
     * Points the open session at a collection, opening one when there is none.
     *
     * What "scan into this box" means: the cards go on being staged, and the button that files
     * them already knows where. A session that was aimed somewhere else is re-aimed rather than
     * duplicated — the destination is a preference, and the banner says what it is.
     *
     * @param collection the collection to file into
     * @param name what to call a session that has to be opened for it
     */
    const aimAt = useCallback(
        async (collection: UUID, name: string) => {
            if (active) {
                await update(active.uuid, {
                    name: active.name,
                    color: active.color,
                    icon: active.icon,
                    collection,
                });
                return;
            }
            await create({ ...defaultDraft(), name, collection });
        },
        [active, create, update],
    );

    const file = useCallback(
        async (collection: UUID | null) => {
            if (!active) return null;
            const filed = await Api.scannerSessions.file(active.uuid, collection);
            setEntries([]);
            await open(active.uuid);
            return { copies: filed.copies, stacks: filed.stacks };
        },
        [active, open],
    );

    const value = useMemo(
        () => ({
            sessions,
            active,
            entries,
            unsynced: scans.length,
            loading,
            reload,
            choose,
            create,
            update,
            remove,
            updateEntry,
            deleteEntry,
            aimAt,
            file,
        }),
        [
            sessions,
            active,
            entries,
            scans.length,
            loading,
            reload,
            choose,
            create,
            update,
            remove,
            updateEntry,
            deleteEntry,
            aimAt,
            file,
        ],
    );
    return <ScannerSessionsContext value={value}>{children}</ScannerSessionsContext>;
}

/**
 * Access the scanner's staging areas
 *
 * @returns the sessions and everything that changes them
 */
export function useScannerSessions(): ScannerSessionsValue {
    const value = useContext(ScannerSessionsContext);
    if (!value) throw new Error("useScannerSessions must be used inside a ScannerSessionsProvider");
    return value;
}
