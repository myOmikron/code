import { describe, expect, it } from "vitest";
import { MatchLifeRecording } from "src/utils/match-life-recording";
import { createLifeHistory, changeLifeHistory } from "src/utils/life-history";
import { toMatchLifeHistory } from "src/utils/durable-match-life";
import type { MatchLifeHistoryResponse } from "src/api/generated";

const empty: MatchLifeHistoryResponse = { history: null, generation: 0, revision: 0, writer: null };
const scope = { account: "account-a", tournament: "tournament-a", match: "match-a" };
/**
 * Browser storage boundary for persistence journeys.
 *
 * @returns independent in-memory storage
 */
function storage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
}
/**
 * Explicitly claims a recording slot through the public controller interface.
 *
 * @param store browser persistence boundary
 * @returns the acknowledged recording and original ownership proof
 */
function start(store = storage()) {
    const recording = new MatchLifeRecording(scope, store);
    recording.observe(empty);
    const claim = recording.prepareClaim();
    recording.acceptClaim({
        ...empty,
        writer: claim.device,
        generation: 1,
        accepted_request: claim.request_id,
        accepted_revision: 0,
    });
    return { recording, store, claim };
}

describe("durable Match recording", () => {
    it("restores an uncertain upload unchanged and coalesces later counting behind its receipt", () => {
        const { recording, store, claim } = start();
        const first = createLifeHistory(
            [
                { id: "alice", name: "Alice" },
                { id: "bob", name: "Bob" },
            ],
            [20, 20],
            1000,
        );
        recording.change(first, true);
        const upload = recording.prepareUpload()!;
        const latest = changeLifeHistory(first, 0, -2, 2000);
        recording.change(latest, true);
        const restored = new MatchLifeRecording(scope, store);
        expect(restored.prepareUpload()).toEqual(upload);
        expect(restored.snapshot().local?.games[0].life).toEqual([18, 20]);
        restored.acceptUpload({
            ...empty,
            generation: 1,
            revision: 1,
            writer: claim.device,
            history: upload.history,
            accepted_request: upload.request_id,
            accepted_revision: 1,
        });
        const next = restored.prepareUpload()!;
        expect(next.request_id).not.toBe(upload.request_id);
        expect(next.expected_revision).toBe(1);
        expect(next.history).toEqual(toMatchLifeHistory(latest));
        restored.acceptUpload({
            ...empty,
            generation: 1,
            revision: 2,
            writer: claim.device,
            history: next.history,
            accepted_request: next.request_id,
            accepted_revision: 2,
        });
        const synchronized = new MatchLifeRecording(scope, store);
        expect(synchronized.snapshot().dirty).toBe(false);
        expect(synchronized.snapshot().inFlight).toBeUndefined();
        expect(synchronized.snapshot().local).toEqual(latest);
        expect(synchronized.snapshot().claim).toEqual(claim);
    });
});

it("keeps pending counting after a newer server generation and a read-only projection", () => {
    const { recording, store } = start();
    const local = createLifeHistory([{ id: "alice", name: "Alice" }], [40], 1000);
    recording.change(local, true);
    const upload = recording.prepareUpload();
    recording.observe({
        ...empty,
        generation: 2,
        revision: 3,
        writer: "other-device",
        history: toMatchLifeHistory(createLifeHistory([{ id: "alice", name: "Alice" }], [20], 3000)),
    });
    recording.change(createLifeHistory([{ id: "alice", name: "Alice" }], [20]), true);
    const restored = new MatchLifeRecording(scope, store);
    expect(restored.snapshot().local).toEqual(local);
    expect(restored.snapshot().inFlight).toEqual(upload);
    expect(restored.snapshot().blocked).toBe("conflict");
    expect(restored.writer()).toBe(false);
});

it("keeps original ownership proof and rejects a receipt for another upload", () => {
    const { recording, store, claim } = start();
    recording.change(createLifeHistory([{ id: "alice", name: "Alice" }], [20]), true);
    const upload = recording.prepareUpload();
    recording.acceptUpload({ ...empty, accepted_request: "unrelated", accepted_revision: 1 });
    const restored = new MatchLifeRecording(scope, store);
    expect(restored.snapshot().claim).toEqual(claim);
    expect(restored.snapshot().inFlight).toEqual(upload);
    expect(restored.snapshot().blocked).toBe("conflict");
    expect(new MatchLifeRecording({ ...scope, account: "account-b" }, store).snapshot().local).toBeNull();
});

it("reports unavailable local persistence and never sends an unpersisted intent", () => {
    const store = storage();
    const { recording } = start(store);
    store.setItem = () => {
        throw new Error("quota");
    };
    const local = createLifeHistory([{ id: "alice", name: "Alice" }], [20]);
    recording.change(local, true);
    expect(recording.snapshot().local).toEqual(local);
    expect(recording.storageFailed).toBe(true);
    expect(recording.prepareUpload()).toBeNull();
});

it("keeps hundreds of offline taps within one small browser record", () => {
    const store = storage();
    const write = store.setItem;
    store.setItem = (key, value) => {
        if (value.length > 80000) throw new Error("limited mobile quota");
        write(key, value);
    };
    const { recording } = start(store);
    let history = createLifeHistory([{ id: "alice", name: "Alice" }], [400], 1000);
    recording.change(history, true);
    recording.prepareUpload();
    for (let tap = 0; tap < 200; tap++) {
        history = changeLifeHistory(history, 0, -1, 2000 + tap);
        recording.change(history, true);
    }
    const restored = new MatchLifeRecording(scope, store);
    expect(recording.storageFailed).toBe(false);
    expect(restored.snapshot().local?.games[0].life).toEqual([200]);
    expect(restored.snapshot().local?.games[0].events).toHaveLength(201);
});
it("freezes taps, flushes the latest snapshot and restores an uncertain release", () => {
    const { recording, store, claim } = start();
    const first = createLifeHistory([{ id: "alice", name: "Alice" }], [40], 1000);
    recording.change(first, true);
    const a = recording.prepareUpload()!;
    const latest = changeLifeHistory(first, 0, -3, 2000);
    recording.change(latest, true);
    recording.freezeTransfer();
    recording.change(changeLifeHistory(latest, 0, -9, 3000), true);
    expect(recording.writer()).toBe(false);
    expect(recording.prepareRelease()).toBeNull();
    recording.acceptUpload({
        ...empty,
        writer: claim.device,
        generation: 1,
        revision: 1,
        history: a.history,
        accepted_request: a.request_id,
        accepted_revision: 1,
    });
    const b = recording.prepareUpload()!;
    expect(b.history).toEqual(toMatchLifeHistory(latest));
    recording.acceptUpload({
        ...empty,
        writer: claim.device,
        generation: 1,
        revision: 2,
        history: b.history,
        accepted_request: b.request_id,
        accepted_revision: 2,
    });
    const release = recording.prepareRelease()!;
    const restored = new MatchLifeRecording(scope, store);
    expect(restored.prepareRelease()).toEqual(release);
    restored.acceptRelease({
        ...empty,
        writer: null,
        generation: 2,
        revision: 2,
        history: b.history,
        accepted_request: release.request_id,
        accepted_revision: 2,
    });
    expect(restored.writer()).toBe(false);
    expect(restored.snapshot().local).toEqual(latest);
});

it("preserves latest B after late accepted A loses ownership and persists the conflict upload", () => {
    const { recording, store, claim } = start();
    const first = createLifeHistory([{ id: "alice", name: "Alice" }], [40], 1000);
    recording.change(first, true);
    const a = recording.prepareUpload()!;
    const b = changeLifeHistory(first, 0, -4, 2000);
    recording.change(b, true);
    recording.acceptUpload({
        ...empty,
        writer: "new-phone",
        generation: 2,
        revision: 1,
        history: a.history,
        accepted_request: a.request_id,
        accepted_revision: 1,
    });
    const conflict = recording.prepareConflict()!;
    expect(conflict.history).toEqual(toMatchLifeHistory(b));
    expect(conflict.ownership).toEqual({ kind: "claim", request: claim });
    const restored = new MatchLifeRecording(scope, store);
    expect(restored.prepareConflict()).toEqual(conflict);
    expect(restored.writer()).toBe(false);
    expect(restored.snapshot().local?.games[0].life).toEqual([36]);
});

it("retains the captured branch for local review when a later active snapshot arrives", () => {
    const { recording, store } = start();
    const local = createLifeHistory([{ id: "alice", name: "Alice" }], [40], 1000);
    recording.change(local, true);
    recording.prepareUpload();
    recording.observe({ ...empty, generation: 2, revision: 0, writer: "new-phone" });
    const request = recording.prepareConflict()!;
    recording.acceptConflict(request.request_id, "artifact");
    recording.observe({
        ...empty,
        generation: 2,
        revision: 1,
        writer: "new-phone",
        history: toMatchLifeHistory(createLifeHistory([{ id: "alice", name: "Alice" }], [20], 2000)),
    });
    expect(new MatchLifeRecording(scope, store).snapshot().local).toEqual(local);
    expect(recording.snapshot().capturedConflict).toBe("artifact");
    expect(recording.writer()).toBe(false);
});

it("resumes an existing saved Game after a released slot is claimed without reopening setup", () => {
    const recording = new MatchLifeRecording(scope, storage());
    const history = createLifeHistory([{ id: "alice", name: "Alice" }], [30], 1000);
    recording.observe({ ...empty, generation: 2, revision: 1, history: toMatchLifeHistory(history) });
    const claim = recording.prepareClaim();
    recording.acceptClaim({
        ...empty,
        generation: 3,
        revision: 1,
        writer: claim.device,
        history: toMatchLifeHistory(history),
        accepted_request: claim.request_id,
        accepted_revision: 1,
    });
    expect(recording.snapshot().configured).toBe(true);
    expect(recording.snapshot().local).toEqual(history);
    expect(recording.writer()).toBe(true);
});
