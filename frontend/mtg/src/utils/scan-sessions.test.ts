import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
    addEntry,
    createScanEntry,
    createScanSession,
    loadScanSessions,
    removeEntries,
    removeEntry,
    removeSession,
    replaceEntryCard,
    sessionCardCount,
    sessionValue,
    setSessionTarget,
    updateEntry,
} from "./scan-sessions";
import type { ScanSession } from "./scan-sessions";
import type { CardRecord } from "src/types";

const card = (id: string, priceEur: number | null = 1): CardRecord => ({
    id,
    name: `Card ${id}`,
    setName: "Set",
    setCode: "SET",
    collectorNumber: "1",
    manaCost: "{1}",
    typeLine: "Artifact",
    colors: [],
    imageUrl: "",
    priceEur,
});

const withEntries = (...entries: ScanSession["entries"]): ScanSession => ({
    ...createScanSession(),
    entries: [...entries],
});

describe("scan sessions", () => {
    it("starts an entry as one near-mint copy with the finish the scan saw", () => {
        const plain = createScanEntry(card("a"), false);
        expect(plain.quantity).toBe(1);
        expect(plain.condition).toBe("NearMint");
        expect(plain.finish).toBe("Nonfoil");
        expect(plain.purchasePriceCents).toBeNull();
        expect(plain.acquiredAt).toBeNull();
        expect(createScanEntry(card("a"), true).finish).toBe("Foil");
    });

    it("gives every scan its own identity, so two copies stay separable", () => {
        const first = createScanEntry(card("a"), false);
        const second = createScanEntry(card("a"), false);
        expect(first.id).not.toBe(second.id);

        let sessions = [withEntries()];
        sessions = addEntry(sessions, sessions[0].id, first);
        sessions = addEntry(sessions, sessions[0].id, second);
        expect(sessions[0].entries).toHaveLength(2);
        expect(removeEntry(sessions, sessions[0].id, first.id)[0].entries.map((e) => e.id)).toEqual([second.id]);
    });

    it("keeps the newest scan first", () => {
        const older = createScanEntry(card("a"), false);
        const newer = createScanEntry(card("b"), false);
        let sessions = [withEntries(older)];
        sessions = addEntry(sessions, sessions[0].id, newer);
        expect(sessions[0].entries.map((e) => e.card.id)).toEqual(["b", "a"]);
    });

    it("only touches the addressed session", () => {
        const sessions = [withEntries(), withEntries()];
        const entry = createScanEntry(card("a"), false);
        const updated = addEntry(sessions, sessions[1].id, entry);
        expect(updated[0].entries).toHaveLength(0);
        expect(updated[0]).toBe(sessions[0]);
        expect(updated[1].entries).toHaveLength(1);
    });

    it("drops exactly the ids a transfer acknowledged and ignores unknown ones", () => {
        const a = createScanEntry(card("a"), false);
        const b = createScanEntry(card("b"), false);
        const sessions = [withEntries(a, b)];
        expect(removeEntries(sessions, sessions[0].id, [a.id, "never-existed"])[0].entries.map((e) => e.id)).toEqual([
            b.id,
        ]);
    });

    it("patches an entry's editable fields without touching its card", () => {
        const entry = createScanEntry(card("a"), false);
        const sessions = [withEntries(entry)];
        const updated = updateEntry(sessions, sessions[0].id, entry.id, {
            quantity: 4,
            condition: "Played",
            finish: "Etched",
            purchasePriceCents: 250,
            acquiredAt: "2026-08-20",
        })[0].entries[0];
        expect(updated.quantity).toBe(4);
        expect(updated.condition).toBe("Played");
        expect(updated.finish).toBe("Etched");
        expect(updated.purchasePriceCents).toBe(250);
        expect(updated.acquiredAt).toBe("2026-08-20");
        expect(updated.card).toBe(entry.card);
    });

    it("keeps the runners-up but never the chosen card among them", () => {
        const entry = createScanEntry(card("a"), false, [card("a"), card("b"), card("c")]);
        expect(entry.alternatives.map((c) => c.id)).toEqual(["b", "c"]);
    });

    it("swaps in an alternative and offers the replaced card back, so a correction is reversible", () => {
        const entry = createScanEntry(card("a"), false, [card("b"), card("c")]);
        const sessions = [withEntries(entry)];
        const swapped = replaceEntryCard(sessions, sessions[0].id, entry.id, card("b"))[0].entries[0];
        expect(swapped.card.id).toBe("b");
        expect(swapped.alternatives.map((c) => c.id)).toEqual(["a", "c"]);

        const back = replaceEntryCard([withEntries(swapped)], sessions[0].id, entry.id, card("a"));
        // The swap addressed a different session id, so nothing changes …
        expect(back[0].entries[0]).toBe(swapped);
        // … while addressing the right one reverses the correction.
        const reverted = replaceEntryCard(
            [{ ...sessions[0], entries: [swapped] }],
            sessions[0].id,
            entry.id,
            card("a"),
        )[0].entries[0];
        expect(reverted.card.id).toBe("a");
        expect(reverted.alternatives.map((c) => c.id)).toEqual(["b", "c"]);
    });

    it("retargets and removes sessions", () => {
        const sessions = [withEntries(), withEntries()];
        const target = { uuid: "u1", name: "Binder" };
        const retargeted = setSessionTarget(sessions, sessions[0].id, target);
        expect(retargeted[0].target).toEqual(target);
        expect(retargeted[1].target).toBeNull();
        expect(removeSession(sessions, sessions[0].id).map((s) => s.id)).toEqual([sessions[1].id]);
    });

    it("sums value and card count per quantity and tolerates cards without a price", () => {
        const two = { ...createScanEntry(card("a", 2.5), false), quantity: 2 };
        const priceless = createScanEntry(card("b", null), false);
        const session = withEntries(two, priceless);
        expect(sessionValue(session)).toBe(5);
        expect(sessionCardCount(session)).toBe(3);
    });

    describe("storage", () => {
        // vitest runs in plain node, so the storage the module reaches for is stubbed in-memory.
        const backing = new Map<string, string>();
        beforeAll(() => {
            vi.stubGlobal("localStorage", {
                getItem: (key: string) => backing.get(key) ?? null,
                setItem: (key: string, value: string) => void backing.set(key, value),
                removeItem: (key: string) => void backing.delete(key),
            });
        });
        afterAll(() => vi.unstubAllGlobals());
        beforeEach(() => backing.clear());

        it("wraps the old flat staging list into one target-less session and drops the key", () => {
            const legacy = [
                {
                    id: "s1",
                    card: card("a"),
                    foil: false,
                    scannedAt: "2026-01-01T00:00:00Z",
                    alternatives: [card("b")],
                },
                { id: "s2", card: card("c"), foil: true, scannedAt: "2026-01-02T00:00:00Z" },
            ];
            localStorage.setItem("cardlens.pendingScans.v1", JSON.stringify(legacy));

            const sessions = loadScanSessions();
            expect(sessions).toHaveLength(1);
            expect(sessions[0].target).toBeNull();
            const [first, second] = sessions[0].entries;
            expect(first.id).toBe("s1");
            expect(first.finish).toBe("Nonfoil");
            expect(first.condition).toBe("NearMint");
            expect(first.quantity).toBe(1);
            expect(first.alternatives.map((c) => c.id)).toEqual(["b"]);
            expect(second.finish).toBe("Foil");
            expect(localStorage.getItem("cardlens.pendingScans.v1")).toBeNull();
            // The migration persisted, so the next load sees the same session.
            expect(loadScanSessions()).toEqual(sessions);
        });

        it("ignores an empty or unreadable legacy list", () => {
            localStorage.setItem("cardlens.pendingScans.v1", "[]");
            expect(loadScanSessions()).toEqual([]);
        });
    });
});
