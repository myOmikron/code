import type { ClaimMatchLifeRequest, MatchLifeHistoryResponse, SaveMatchLifeRequest } from "src/api/generated";
import { fromMatchLifeHistory, toMatchLifeHistory } from "src/utils/durable-match-life";
import { loadLifeHistory } from "src/utils/life-history";
import type { LifeHistory, LifeStorage } from "src/utils/life-history";

/** Account and Match identity owning a private local recording. */
export type RecordingScope = { account: string; tournament: string; match: string };
/** Last authorized Match context, including the original server clock offset. */
export type OfflineMatchContext = {
    tournament: import("src/api/generated").TournamentResponse;
    play: import("src/api/generated").MatchPlayResponse;
    skewMs: number;
};
/** One atomic recording record, retaining at most one immutable upload and the latest local history. */
export type RecordingEnvelope = RecordingScope & {
    version: 1;
    claim?: ClaimMatchLifeRequest;
    claimAccepted: boolean;
    remote: MatchLifeHistoryResponse | null;
    local: LifeHistory | null;
    configured: boolean;
    dirty: boolean;
    inFlight?: SaveMatchLifeRequest;
    blocked?: "conflict" | "invalid" | "auth";
    context?: OfflineMatchContext;
};

/**
 * Isolates credentials and pending history by Account and Match.
 *
 * @param scope owner and Match
 * @returns the atomic storage key
 */
export function recordingKey(scope: RecordingScope): string {
    return `cardlens.match-recording.v1.${scope.account}.${scope.tournament}.${scope.match}`;
}

/**
 * Persists counting and immutable upload intentions through interruption and reload.
 *
 * @remarks Network calls belong to the existing durable Match hook.
 */
export class MatchLifeRecording {
    private value: RecordingEnvelope;
    /** Whether the most recent local write failed; counting remains available in memory. */
    storageFailed = false;

    /**
     * Restores the private atomic record for exactly one Account and Match.
     *
     * @param scope Account and Match identity
     * @param storage browser persistence boundary
     */
    constructor(
        private scope: RecordingScope,
        private storage: LifeStorage = {
            getItem: (key) => localStorage.getItem(key),
            setItem: (key, value) => localStorage.setItem(key, value),
        },
    ) {
        this.value = {
            ...scope,
            version: 1,
            claimAccepted: false,
            remote: null,
            local: null,
            configured: false,
            dirty: false,
        };
        try {
            const stored = JSON.parse(storage.getItem(recordingKey(scope)) ?? "null") as RecordingEnvelope | null;
            if (
                stored?.version === 1 &&
                stored.account === scope.account &&
                stored.tournament === scope.tournament &&
                stored.match === scope.match &&
                typeof stored.dirty === "boolean" &&
                typeof stored.claimAccepted === "boolean"
            ) {
                const validHistory =
                    stored.local === null ||
                    loadLifeHistory("history", {
                        getItem: () => JSON.stringify(stored.local),
                        setItem: () => undefined,
                    }) !== null;
                if (validHistory) this.value = stored;
            }
        } catch {
            this.storageFailed = true;
        }
    }

    /**
     * Observe the durable local record without transferring its ownership.
     *
     * @returns the current envelope
     */
    snapshot(): RecordingEnvelope {
        return this.value;
    }

    /**
     * Whether this device has an acknowledged recording claim, including while disconnected.
     *
     * @returns whether local counting may continue
     */
    writer(): boolean {
        return this.value.claimAccepted && !this.value.blocked;
    }

    /**
     * Keeps failed writes visible while retaining the latest state in memory.
     *
     * @returns whether the complete envelope was persisted
     */
    private persist(): boolean {
        try {
            this.storage.setItem(recordingKey(this.scope), JSON.stringify(this.value));
            this.storageFailed = false;
            return true;
        } catch {
            this.storageFailed = true;
            return false;
        }
    }

    /**
     * Retains the last authorized Match and server offset for a network-only reload fallback.
     *
     * @param context authorized Match context and clock offset
     */
    rememberContext(context: OfflineMatchContext): void {
        this.value = { ...this.value, context };
        this.persist();
    }

    /**
     * Retains local history and dirty state atomically, coalescing later taps behind an immutable upload.
     *
     * @param local latest counter state
     * @param configured whether setup was explicitly confirmed
     */
    change(local: LifeHistory, configured: boolean): void {
        if (!this.writer()) return;
        if (
            this.value.local &&
            JSON.stringify(this.value.local) === JSON.stringify(local) &&
            this.value.configured === configured
        )
            return;
        this.value = { ...this.value, local, configured, dirty: configured || this.value.dirty };
        this.persist();
    }

    /**
     * Updates the observed server state without discarding dirty or uncertain local work.
     *
     * @param remote fresh observed server state
     */
    observe(remote: MatchLifeHistoryResponse): void {
        const own =
            this.value.claim &&
            remote.writer === this.value.claim.device &&
            remote.generation === this.value.claim.generation + 1;
        const blocked =
            this.value.claimAccepted && !own
                ? "conflict"
                : this.value.blocked === "auth"
                  ? undefined
                  : this.value.blocked;
        this.value = {
            ...this.value,
            remote,
            blocked,
            local:
                this.value.dirty || this.value.inFlight || this.value.claimAccepted
                    ? this.value.local
                    : remote.history
                      ? fromMatchLifeHistory(remote.history)
                      : this.value.local,
        };
        this.persist();
    }

    /**
     * Retains the original ownership intent before sending it, including after acknowledgement.
     *
     * @returns the exact request to claim or retry
     */
    prepareClaim(): ClaimMatchLifeRequest {
        if (!this.value.claim) {
            this.value = {
                ...this.value,
                claim: {
                    device: crypto.randomUUID(),
                    writer_token: crypto.randomUUID(),
                    request_id: crypto.randomUUID(),
                    generation: this.value.remote?.generation ?? 0,
                    expected_revision: this.value.remote?.revision ?? 0,
                },
            };
        }
        this.persist();
        return this.value.claim!;
    }

    /**
     * Accepts only an acknowledgement of the retained original claim.
     *
     * @param remote server response to the original claim
     */
    acceptClaim(remote: MatchLifeHistoryResponse): void {
        const claim = this.value.claim;
        const accepted =
            !!claim &&
            remote.accepted_request === claim.request_id &&
            remote.writer === claim.device &&
            remote.generation === claim.generation + 1;
        this.value = {
            ...this.value,
            remote,
            claimAccepted: accepted,
            blocked: accepted ? undefined : "conflict",
            local: this.value.local ?? (remote.history ? fromMatchLifeHistory(remote.history) : null),
        };
        this.persist();
    }

    /**
     * Persists an exact upload intention before network I/O; subsequent changes never mutate it.
     *
     * @returns the original uncertain request or the next coalesced snapshot
     */
    prepareUpload(): SaveMatchLifeRequest | null {
        if (this.writer() && this.value.inFlight) return this.persist() ? this.value.inFlight : null;
        if (
            !this.writer() ||
            !this.value.local ||
            !this.value.configured ||
            !this.value.dirty ||
            !this.value.claim ||
            !this.value.remote
        )
            return null;
        if (!this.value.inFlight) {
            const claim = this.value.claim;
            this.value = {
                ...this.value,
                inFlight: {
                    device: claim.device,
                    writer_token: claim.writer_token,
                    request_id: crypto.randomUUID(),
                    generation: claim.generation + 1,
                    expected_revision: this.value.remote.revision,
                    history: toMatchLifeHistory(this.value.local),
                },
            };
        }
        return this.persist() ? this.value.inFlight! : null;
    }

    /**
     * Reconciles only the receipt for the immutable upload, preserving newer local counting.
     *
     * @param remote fresh state and receipt returned by an upload
     */
    acceptUpload(remote: MatchLifeHistoryResponse): void {
        const request = this.value.inFlight;
        if (
            !request ||
            remote.accepted_request !== request.request_id ||
            remote.accepted_revision !== request.expected_revision + 1
        ) {
            this.reject("conflict");
            return;
        }
        const dirty = JSON.stringify(toMatchLifeHistory(this.value.local!)) !== JSON.stringify(request.history);
        const current =
            remote.writer === request.device &&
            remote.generation === request.generation &&
            remote.revision === remote.accepted_revision;
        this.value = { ...this.value, remote, dirty, inFlight: undefined, blocked: current ? undefined : "conflict" };
        this.persist();
    }

    /**
     * Retains all pending history when the server rejects ownership, revision or content.
     *
     * @param blocked why automatic upload must stop
     */
    reject(blocked: "conflict" | "invalid" | "auth"): void {
        this.value = { ...this.value, blocked };
        this.persist();
    }
}
