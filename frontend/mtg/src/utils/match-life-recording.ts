import type {
    CaptureMatchLifeConflictRequest,
    ClaimMatchLifeRequest,
    MatchLifeHistoryResponse,
    SaveMatchLifeRequest,
} from "src/api/generated";
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
    storageRevision?: number;
    claim?: ClaimMatchLifeRequest;
    claimAccepted: boolean;
    ownershipKind?: "claim" | "takeover";
    conflictUpload?: CaptureMatchLifeConflictRequest;
    capturedConflict?: string;
    conflictBaseRevision?: number;
    remote: MatchLifeHistoryResponse | null;
    local: LifeHistory | null;
    configured: boolean;
    dirty: boolean;
    inFlight?: SaveMatchLifeRequest;
    transfer?: boolean;
    release?: ClaimMatchLifeRequest;
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
     * @param writeAccess whether this controller still holds the local recording lock
     */
    constructor(
        private scope: RecordingScope,
        private storage: LifeStorage = {
            getItem: (key) => localStorage.getItem(key),
            setItem: (key, value) => localStorage.setItem(key, value),
        },
        private writeAccess: () => boolean = () => true,
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
        this.refreshFromStorage();
    }

    /**
     * Restores the complete latest envelope before local-tab promotion or read-only projection.
     *
     * @returns whether a valid persisted recording was found
     */
    refreshFromStorage(): boolean {
        try {
            const stored = JSON.parse(
                this.storage.getItem(recordingKey(this.scope)) ?? "null",
            ) as RecordingEnvelope | null;
            if (
                stored?.version === 1 &&
                stored.account === this.scope.account &&
                stored.tournament === this.scope.tournament &&
                stored.match === this.scope.match &&
                typeof stored.dirty === "boolean" &&
                typeof stored.claimAccepted === "boolean"
            ) {
                const validHistory =
                    stored.local === null ||
                    loadLifeHistory("history", {
                        getItem: () => JSON.stringify(stored.local),
                        setItem: () => undefined,
                    }) !== null;
                if (validHistory) {
                    this.value = stored;
                    return true;
                }
            }
        } catch {
            this.storageFailed = true;
        }
        return false;
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
        return this.canUpload() && !this.value.transfer;
    }

    /** @returns whether the acknowledged writer may flush retained uploads, including during transfer. */
    canUpload(): boolean {
        return this.writeAccess() && this.value.claimAccepted && !this.value.blocked;
    }

    /** Freezes further counting before the transfer flush begins. */
    freezeTransfer(): void {
        if (!this.canUpload()) return;
        this.value = { ...this.value, transfer: true };
        this.persist();
    }

    /** Resumes counting only while no release request could have reached the server. */
    cancelTransfer(): void {
        if (this.value.release || !this.canUpload()) return;
        this.value = { ...this.value, transfer: false };
        this.persist();
    }

    /** @returns a durable release intent only after every counted change has been acknowledged. */
    prepareRelease(): ClaimMatchLifeRequest | null {
        if (!this.writeAccess()) return null;
        if (this.value.release) return this.persist() ? this.value.release : null;
        const { claim, remote, transfer, dirty, inFlight } = this.value;
        if (!transfer || !this.canUpload() || dirty || inFlight || !claim || !remote) return null;
        this.value = {
            ...this.value,
            release: {
                device: claim.device,
                writer_token: claim.writer_token,
                generation: remote.generation,
                expected_revision: remote.revision,
                request_id: crypto.randomUUID(),
            },
        };
        return this.persist() ? this.value.release! : null;
    }

    /**
     * Accepts a release receipt without restoring ownership on a late retry.
     *
     * @param remote current state and receipt
     */
    acceptRelease(remote: MatchLifeHistoryResponse): void {
        if (!this.writeAccess()) return;
        const release = this.value.release;
        if (
            !release ||
            remote.accepted_request !== release.request_id ||
            remote.accepted_revision !== release.expected_revision
        ) {
            this.reject("conflict");
            return;
        }
        this.value = {
            ...this.value,
            remote,
            claim: undefined,
            claimAccepted: false,
            release: undefined,
            transfer: false,
            local: remote.history ? fromMatchLifeHistory(remote.history) : null,
        };
        this.persist();
    }

    /**
     * Keeps failed writes visible while retaining the latest state in memory.
     *
     * @returns whether the complete envelope was persisted
     */
    private persist(): boolean {
        if (!this.writeAccess()) return false;
        try {
            const latest = JSON.parse(
                this.storage.getItem(recordingKey(this.scope)) ?? "null",
            ) as RecordingEnvelope | null;
            if ((latest?.storageRevision ?? 0) > (this.value.storageRevision ?? 0)) {
                this.refreshFromStorage();
                return false;
            }
            this.value = { ...this.value, storageRevision: (this.value.storageRevision ?? 0) + 1 };
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
        if (!this.writeAccess()) return;
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
        if (this.value.configured && this.value.local && isHistoryPrefix(local, this.value.local)) return;
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
            conflictBaseRevision:
                blocked === "conflict"
                    ? (this.value.conflictBaseRevision ?? this.value.remote?.revision ?? 0)
                    : this.value.conflictBaseRevision,
            local:
                this.value.dirty ||
                this.value.inFlight ||
                this.value.claimAccepted ||
                this.value.conflictUpload ||
                this.value.capturedConflict
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
    prepareClaim(): ClaimMatchLifeRequest | null {
        if (!this.writeAccess()) return null;
        if (!this.value.claim || (!this.value.dirty && !this.value.inFlight && this.value.blocked === "conflict")) {
            this.value = {
                ...this.value,
                blocked: undefined,
                ownershipKind: "claim",
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
     * Prepares only an explicitly confirmed server snapshot for online takeover.
     *
     * @param confirmed the exact saved state shown in the confirmation dialog
     * @returns a persisted ownership intent or null while an unsent branch remains
     */
    prepareTakeover(confirmed: MatchLifeHistoryResponse): ClaimMatchLifeRequest | null {
        if (!this.writeAccess()) return null;
        if (this.value.dirty || this.value.inFlight || this.writer()) return null;
        this.value = {
            ...this.value,
            remote: confirmed,
            local: confirmed.history ? fromMatchLifeHistory(confirmed.history) : null,
            configured: confirmed.history != null,
            claimAccepted: false,
            blocked: undefined,
            transfer: false,
            ownershipKind: "takeover",
            claim: {
                device: crypto.randomUUID(),
                writer_token: crypto.randomUUID(),
                request_id: crypto.randomUUID(),
                generation: confirmed.generation,
                expected_revision: confirmed.revision,
            },
        };
        return this.persist() ? this.value.claim! : null;
    }

    /** @returns the complete frozen unsent branch, retaining its exact ownership proof across retries. */
    prepareConflict(): CaptureMatchLifeConflictRequest | null {
        if (!this.writeAccess()) return null;
        if (this.value.conflictUpload) return this.persist() ? this.value.conflictUpload : null;
        if (
            this.value.blocked !== "conflict" ||
            (!this.value.dirty && !this.value.inFlight) ||
            !this.value.local ||
            !this.value.claim
        )
            return null;
        this.value = {
            ...this.value,
            conflictUpload: {
                request_id: crypto.randomUUID(),
                ownership: { kind: this.value.ownershipKind ?? "claim", request: this.value.claim },
                base_revision: this.value.conflictBaseRevision ?? this.value.inFlight?.expected_revision ?? 0,
                history: toMatchLifeHistory(this.value.local),
            },
        };
        return this.persist() ? this.value.conflictUpload! : null;
    }

    /**
     * Retains the local branch until its immutable server artifact is acknowledged.
     *
     * @param request acknowledged capture request
     * @param artifact authorized server artifact identity
     */
    acceptConflict(request: string, artifact: string): void {
        if (!this.writeAccess()) return;
        if (this.value.conflictUpload?.request_id !== request) return;
        this.value = {
            ...this.value,
            capturedConflict: artifact,
            conflictUpload: undefined,
            dirty: false,
            inFlight: undefined,
            claimAccepted: false,
        };
        this.persist();
    }

    /**
     * Accepts only an acknowledgement of the retained original claim.
     *
     * @param remote server response to the original claim
     */
    acceptClaim(remote: MatchLifeHistoryResponse): void {
        if (!this.writeAccess()) return;
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
            configured: remote.history != null || this.value.configured,
            local:
                this.value.dirty || this.value.inFlight
                    ? this.value.local
                    : remote.history
                      ? fromMatchLifeHistory(remote.history)
                      : this.value.local,
        };
        this.persist();
    }

    /**
     * Persists an exact upload intention before network I/O; subsequent changes never mutate it.
     *
     * @returns the original uncertain request or the next coalesced snapshot
     */
    prepareUpload(): SaveMatchLifeRequest | null {
        if (this.canUpload() && this.value.inFlight) return this.persist() ? this.value.inFlight : null;
        if (
            !this.canUpload() ||
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
        if (!this.writeAccess()) return;
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
        this.value = {
            ...this.value,
            remote,
            dirty,
            inFlight: undefined,
            blocked: current ? undefined : "conflict",
            conflictBaseRevision: current ? this.value.conflictBaseRevision : remote.accepted_revision,
        };
        this.persist();
    }

    /**
     * Retains all pending history when the server rejects ownership, revision or content.
     *
     * @param blocked why automatic upload must stop
     */
    reject(blocked: "conflict" | "invalid" | "auth"): void {
        if (!this.writeAccess()) return;
        this.value = { ...this.value, blocked };
        this.persist();
    }
}

/**
 * Recognizes an old counter projection without treating it as new local counting.
 *
 * @param candidate possibly stale history emitted by a mounted counter
 * @param current latest durable local history
 * @returns whether the candidate contains only a retained prefix of the current record
 */
function isHistoryPrefix(candidate: LifeHistory, current: LifeHistory): boolean {
    return (
        candidate.games.length <= current.games.length &&
        candidate.games.every((game, index) => {
            const next = current.games[index];
            return (
                game.events.length <= next.events.length &&
                JSON.stringify(game.players) === JSON.stringify(next.players) &&
                JSON.stringify(game.startingLife) === JSON.stringify(next.startingLife) &&
                game.events.every((event, position) => JSON.stringify(event) === JSON.stringify(next.events[position]))
            );
        })
    );
}
