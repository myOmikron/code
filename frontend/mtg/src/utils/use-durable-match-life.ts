import { useCallback, useEffect, useRef, useState } from "react";
import { Api } from "src/api/api";
import type { ClaimMatchLifeRequest, MatchLifeHistoryResponse, SaveMatchLifeRequest } from "src/api/generated";
import { useAccount } from "src/context/account";
import { fromMatchLifeHistory, toMatchLifeHistory } from "src/utils/durable-match-life";
import { isFormError } from "src/utils/error";
import { loadLifeHistory } from "src/utils/life-history";
import type { LifeHistory } from "src/utils/life-history";

/** Device-local recording credential, never read from public server state. */
type RecordingCredential = {
    device: string;
    writer_token: string;
    request_id: string;
    generation: number;
    expected_revision: number;
};
/** Distinguishes local counting from a completed server save. */
export type MatchLifeSaveState = "loading" | "local" | "saving" | "saved" | "failed" | "conflict" | "invalid";

/**
 * Load an explicit local recording capability without letting storage failure break viewing.
 *
 * @param key Account- and Match-scoped private storage key
 * @returns the previously prepared recording claim
 */
function loadCredential(key: string): RecordingCredential | null {
    try {
        const value = JSON.parse(localStorage.getItem(key) ?? "null") as RecordingCredential | null;
        return value !== null &&
            typeof value.device === "string" &&
            typeof value.writer_token === "string" &&
            typeof value.request_id === "string" &&
            Number.isSafeInteger(value.generation) &&
            Number.isSafeInteger(value.expected_revision)
            ? value
            : null;
    } catch {
        return null;
    }
}

/**
 * Observe durable history and save online counting only after a deliberate recording claim.
 *
 * @param tournament Tournament identity
 * @param played Match identity
 * @param storageKey local history key
 * @returns uploaded state, explicit claim and configured-history callbacks
 */
export function useDurableMatchLife(tournament: string, played: string, storageKey: string) {
    const { account } = useAccount();
    const credentialKey = `${storageKey}.writer.${account?.uuid ?? "anonymous"}`;
    const [credential, setCredential] = useState(() => loadCredential(credentialKey));
    const [loadedKey, setLoadedKey] = useState(credentialKey);
    const [remote, setRemote] = useState<MatchLifeHistoryResponse | null>(null);
    const [state, setState] = useState<MatchLifeSaveState>("loading");
    const [history, setHistory] = useState<LifeHistory | null>(() => loadLifeHistory(storageKey));
    const [configured, setConfigured] = useState(false);
    const [retry, setRetry] = useState(0);
    const saving = useRef(false);
    const latestHistory = useRef(history);
    latestHistory.current = history;
    const pending = useRef<SaveMatchLifeRequest | null>(null);
    const acknowledged = useRef<string | null>(null);
    const writer =
        account !== null &&
        loadedKey === credentialKey &&
        remote !== null &&
        credential !== null &&
        remote.writer === credential.device &&
        remote.generation === credential.generation + 1;

    useEffect(() => {
        let current = true;
        const storedCredential = loadCredential(credentialKey);
        setLoadedKey(credentialKey);
        setCredential(storedCredential);
        setRemote(null);
        setState("loading");
        pending.current = null;
        acknowledged.current = null;
        if (account === null) return;
        Api.tournaments.lifeHistory
            .get(tournament, played)
            .then((loaded) => {
                if (!current) return;
                setRemote(loaded);
                const owns =
                    storedCredential !== null &&
                    loaded.writer === storedCredential.device &&
                    loaded.generation === storedCredential.generation + 1;
                if (loaded.history && (!owns || loadLifeHistory(storageKey) === null))
                    setHistory(fromMatchLifeHistory(loaded.history));
                acknowledged.current = loaded.history
                    ? JSON.stringify(toMatchLifeHistory(fromMatchLifeHistory(loaded.history)))
                    : null;
                setState(loaded.history ? "saved" : "local");
            })
            .catch(() => {
                if (current) setState("failed");
            });
        return () => {
            current = false;
        };
    }, [tournament, played, credentialKey, account?.uuid]);

    const claim = useCallback(async () => {
        if (remote === null || account === null) return;
        const prepared: ClaimMatchLifeRequest = credential ??
            loadCredential(credentialKey) ?? {
                device: crypto.randomUUID(),
                writer_token: crypto.randomUUID(),
                request_id: crypto.randomUUID(),
                generation: remote.generation,
                expected_revision: remote.revision,
            };
        try {
            localStorage.setItem(credentialKey, JSON.stringify(prepared));
            setCredential(prepared);
            setState("saving");
            const result = await Api.tournaments.lifeHistory.claim(tournament, played, prepared);
            if (isFormError(result)) {
                setState("conflict");
                return;
            }
            setRemote(result);
            setState(result.history ? "saved" : "local");
        } catch {
            setState("failed");
        }
    }, [remote, account, credential, credentialKey, tournament, played]);

    const changed = useCallback(
        (next: LifeHistory, started: boolean) => {
            latestHistory.current = next;
            setHistory(next);
            setConfigured(started);
            if (writer && started && JSON.stringify(toMatchLifeHistory(next)) !== acknowledged.current) {
                setState((current) => (current === "conflict" ? current : "local"));
            }
        },
        [writer],
    );

    useEffect(() => {
        if (!writer || !configured || !history || !remote || !credential || state === "conflict" || saving.current)
            return;
        const serialized = JSON.stringify(toMatchLifeHistory(history));
        if (serialized === acknowledged.current) return;
        const timer = window.setTimeout(() => {
            saving.current = true;
            const request = pending.current ?? {
                device: credential.device,
                writer_token: credential.writer_token,
                generation: remote.generation,
                expected_revision: remote.revision,
                request_id: crypto.randomUUID(),
                history: toMatchLifeHistory(history),
            };
            pending.current = request;
            setState("saving");
            Api.tournaments.lifeHistory
                .save(tournament, played, request)
                .then((result) => {
                    if (isFormError(result)) {
                        setState(result.error.invalid_history ? "invalid" : "conflict");
                        return;
                    }
                    acknowledged.current = JSON.stringify(toMatchLifeHistory(fromMatchLifeHistory(request.history)));
                    pending.current = null;
                    setRemote(result);
                    setState(
                        latestHistory.current &&
                            JSON.stringify(toMatchLifeHistory(latestHistory.current)) !== acknowledged.current
                            ? "local"
                            : "saved",
                    );
                })
                .catch(() => setState("failed"))
                .finally(() => {
                    saving.current = false;
                });
        }, 500);
        return () => window.clearTimeout(timer);
    }, [writer, configured, history, remote, credential, tournament, played, retry]);

    return {
        remote,
        history,
        writer,
        state,
        claim,
        changed,
        retry: () => {
            if (remote === null) window.location.reload();
            else if (!writer && remote.writer == null) void claim();
            else setRetry((value) => value + 1);
        },
    };
}
