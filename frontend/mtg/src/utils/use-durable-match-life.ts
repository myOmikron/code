import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Api } from "src/api/api";
import type { MatchLifeHistoryResponse } from "src/api/generated";
import { fromMatchLifeHistory } from "src/utils/durable-match-life";
import { ResponseError } from "src/api/generated";
import { SESSION_STORE } from "src/api/session";
import { useAccount } from "src/context/account";
import { isFormError } from "src/utils/error";
import type { LifeHistory } from "src/utils/life-history";
import { MatchLifeRecording } from "src/utils/match-life-recording";
import type { OfflineMatchContext } from "src/utils/match-life-recording";
import {
    OFFLINE_MATCH_SCOPE_CHANGED,
    OFFLINE_MATCH_SCOPE_KEY,
    readOfflineMatchScope,
    setOfflineMatchAccount,
} from "src/utils/offline-match-scope";

/** Distinguishes local persistence, pending uploads and server acknowledgement. */
export type MatchLifeSaveState =
    "loading" | "local" | "pending" | "saving" | "saved" | "failed" | "conflict" | "invalid" | "storage" | "auth";

/**
 * Restores and synchronizes the existing Match history through one durable upload controller.
 *
 * @param tournament Tournament identity
 * @param played Match identity
 * @param storageKey previous local history key
 * @param context last authorized Match and timer offset
 * @returns restored counter state and explicit recording actions
 */
export function useDurableMatchLife(
    tournament: string,
    played: string,
    storageKey: string,
    context?: OfflineMatchContext,
) {
    const { account, loading, unavailable } = useAccount();
    const [scope, setScope] = useState(readOfflineMatchScope);
    const [, render] = useState(0);
    const [state, setState] = useState<MatchLifeSaveState>("loading");
    const identity =
        scope && !loading && (account?.uuid === scope.account || (account === null && unavailable))
            ? scope.account
            : null;
    const controller = useMemo(
        () => (identity ? new MatchLifeRecording({ account: identity, tournament, match: played }) : null),
        [identity, tournament, played],
    );
    const active = useRef(controller);
    active.current = controller;
    const flush = useRef<(observe?: boolean) => Promise<void>>(async () => undefined);

    useEffect(() => {
        const changed = () => setScope(readOfflineMatchScope());
        const stored = (event: StorageEvent) => {
            if (event.key === OFFLINE_MATCH_SCOPE_KEY) changed();
        };
        window.addEventListener(OFFLINE_MATCH_SCOPE_CHANGED, changed);
        window.addEventListener("storage", stored);
        changed();
        return () => {
            window.removeEventListener(OFFLINE_MATCH_SCOPE_CHANGED, changed);
            window.removeEventListener("storage", stored);
        };
    }, []);

    useEffect(() => {
        if (controller && context) controller.rememberContext(context);
    }, [controller, context]);

    useEffect(() => {
        if (!controller) return;
        let disposed = false;
        let runningHere = false;
        const allowed = () =>
            !disposed && active.current === controller && readOfflineMatchScope()?.account === identity;
        const display = (next?: MatchLifeSaveState) => {
            if (!allowed()) return;
            const record = controller.snapshot();
            setState(
                controller.storageFailed
                    ? "storage"
                    : (record.blocked ??
                          next ??
                          (record.dirty ? "pending" : record.remote?.history ? "saved" : "local")),
            );
            render((version) => version + 1);
        };
        const synchronize = async (observe = true) => {
            if (runningHere || !allowed()) return;
            runningHere = true;
            try {
                if (observe) {
                    const remote = await Api.tournaments.lifeHistory.get(tournament, played);
                    if (!allowed()) return;
                    controller.observe(remote);
                }
                let record = controller.snapshot();
                if (record.claim && !record.claimAccepted && !record.blocked) {
                    display("saving");
                    const response = await (
                        record.ownershipKind === "takeover"
                            ? Api.tournaments.lifeHistory.takeover
                            : Api.tournaments.lifeHistory.claim
                    )(tournament, played, record.claim);
                    if (!allowed()) return;
                    if (isFormError(response)) controller.reject("conflict");
                    else controller.acceptClaim(response);
                }
                while (allowed() && controller.canUpload()) {
                    const request = controller.prepareUpload();
                    if (!request) break;
                    display("saving");
                    const response = await Api.tournaments.lifeHistory.save(tournament, played, request);
                    if (isFormError(response))
                        controller.reject(response.error.invalid_history ? "invalid" : "conflict");
                    else controller.acceptUpload(response);
                    if (!allowed()) return;
                    if (controller.snapshot().blocked) break;
                }
                if (allowed() && controller.snapshot().transfer && !controller.snapshot().blocked) {
                    const release = controller.prepareRelease();
                    if (release) {
                        display("saving");
                        const response = await Api.tournaments.lifeHistory.release(tournament, played, release);
                        if (!allowed()) return;
                        if (isFormError(response)) controller.reject("conflict");
                        else controller.acceptRelease(response);
                    }
                }
                if (allowed() && controller.snapshot().blocked === "conflict") {
                    const fresh = await Api.tournaments.lifeHistory.get(tournament, played);
                    if (!allowed()) return;
                    controller.observe(fresh);
                    const conflict = controller.prepareConflict();
                    if (conflict) {
                        const response = await Api.tournaments.lifeHistory.captureConflict(
                            tournament,
                            played,
                            conflict,
                        );
                        if (!allowed()) return;
                        if (!isFormError(response))
                            controller.acceptConflict(response.accepted_request, response.conflict.id);
                    }
                }
                record = controller.snapshot();
                display(record.blocked ?? (record.dirty ? "pending" : record.remote?.history ? "saved" : "local"));
            } catch (error) {
                if (error instanceof ResponseError && [401, 403, 404].includes(error.response.status)) {
                    controller.reject("auth");
                    if (error.response.status === 401) {
                        setOfflineMatchAccount(null);
                        SESSION_STORE.expired();
                    }
                    display("auth");
                } else display("failed");
            } finally {
                runningHere = false;
            }
        };
        flush.current = synchronize;
        void synchronize();
        const retry = () => {
            if (document.visibilityState === "visible") void synchronize();
        };
        window.addEventListener("online", retry);
        window.addEventListener("focus", retry);
        document.addEventListener("visibilitychange", retry);
        const interval = window.setInterval(retry, 30_000);
        return () => {
            disposed = true;
            flush.current = async () => undefined;
            window.clearInterval(interval);
            window.removeEventListener("online", retry);
            window.removeEventListener("focus", retry);
            document.removeEventListener("visibilitychange", retry);
        };
    }, [controller, identity, tournament, played]);

    const changed = useCallback(
        (next: LifeHistory, configured: boolean) => {
            if (!controller?.writer()) return;
            const before = controller.snapshot();
            controller.change(next, configured);
            if (before !== controller.snapshot()) {
                render((version) => version + 1);
                setState(controller.storageFailed ? "storage" : configured ? "pending" : "local");
            }
        },
        [controller],
    );
    const record = controller?.snapshot();
    useEffect(() => {
        if (!record?.dirty || record.blocked || !controller?.canUpload()) return;
        const timer = window.setTimeout(() => void flush.current(false), 500);
        return () => window.clearTimeout(timer);
    }, [controller, record]);

    const claim = useCallback(async () => {
        if (!controller || !account || !controller.snapshot().remote) return;
        controller.prepareClaim();
        if (controller.storageFailed) {
            setState("storage");
            return;
        }
        await flush.current(false);
    }, [controller, account]);

    return {
        remote: record?.remote ?? null,
        canRequest: account !== null,
        history:
            record?.blocked === "auth"
                ? null
                : record?.blocked === "conflict"
                  ? record.remote?.history
                      ? fromMatchLifeHistory(record.remote.history)
                      : null
                  : (record?.local ?? null),
        conflictLocal:
            record?.blocked === "conflict" && (record.dirty || record.inFlight || record.capturedConflict)
                ? record.local
                : null,
        capturedConflict: record?.capturedConflict,
        transferring: record?.transfer ?? false,
        writer: controller?.writer() ?? false,
        configured: record?.configured ?? false,
        identity,
        recording: controller,
        state:
            identity === null
                ? loading
                    ? ("loading" as const)
                    : account !== null
                      ? ("storage" as const)
                      : ("auth" as const)
                : state,
        claim,
        transfer: async () => {
            if (!controller?.writer() || !account) return;
            controller.freezeTransfer();
            render((value) => value + 1);
            if (controller.storageFailed) {
                setState("storage");
                return;
            }
            await flush.current(false);
        },
        cancelTransfer: () => {
            controller?.cancelTransfer();
            render((value) => value + 1);
        },
        savedState: async () => {
            if (!controller || !account) return null;
            try {
                const response = await Api.tournaments.lifeHistory.get(tournament, played);
                if (active.current !== controller) return null;
                controller.observe(response);
                render((value) => value + 1);
                return response;
            } catch {
                setState("failed");
                return null;
            }
        },
        takeover: async (confirmed: MatchLifeHistoryResponse) => {
            if (!controller || !account || !controller.prepareTakeover(confirmed)) return;
            render((value) => value + 1);
            await flush.current(false);
        },
        changed,
        retry: () => void flush.current(),
        storageKey: `${storageKey}.${identity ?? "unavailable"}`,
    };
}
