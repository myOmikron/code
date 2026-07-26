import { describe, expect, it } from "vitest";
import {
  addPendingScan,
  replacePendingScanCard,
  createPendingScan,
  groupPendingScans,
  pendingValue,
  removePendingScan,
  removePendingScans,
} from "./pendingScans";
import type { CardRecord } from "./types";

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

describe("pending scans", () => {
  it("gives every scan its own identity, so two copies stay separable", () => {
    const first = createPendingScan(card("a"), false);
    const second = createPendingScan(card("a"), false);
    expect(first.id).not.toBe(second.id);

    const scans = addPendingScan(addPendingScan([], first), second);
    expect(scans).toHaveLength(2);
    expect(removePendingScan(scans, first.id).map((s) => s.id)).toEqual([second.id]);
  });

  it("keeps the newest scan first", () => {
    const older = createPendingScan(card("a"), false);
    const newer = createPendingScan(card("b"), false);
    expect(addPendingScan([older], newer).map((s) => s.card.id)).toEqual(["b", "a"]);
  });

  it("drops exactly the ids a backend acknowledged and ignores unknown ones", () => {
    const a = createPendingScan(card("a"), false);
    const b = createPendingScan(card("b"), false);
    expect(removePendingScans([a, b], [a.id, "never-existed"]).map((s) => s.id)).toEqual([b.id]);
  });

  it("groups by card and finish, keeping a foil apart from its non-foil copy", () => {
    const scans = [
      createPendingScan(card("a"), false),
      createPendingScan(card("a"), false),
      createPendingScan(card("a"), true),
      createPendingScan(card("b"), false),
    ];
    const groups = groupPendingScans(scans);
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.card.id === "a" && !g.foil)?.ids).toHaveLength(2);
    expect(groups.find((g) => g.card.id === "a" && g.foil)?.ids).toHaveLength(1);
  });

  it("keeps the runners-up but never the chosen card among them", () => {
    const scan = createPendingScan(card("a"), false, [card("a"), card("b"), card("c")]);
    expect(scan.alternatives.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("swaps in an alternative and offers the replaced card back, so a correction is reversible", () => {
    const scan = createPendingScan(card("a"), false, [card("b"), card("c")]);
    const swapped = replacePendingScanCard([scan], scan.id, card("b"))[0];
    expect(swapped.card.id).toBe("b");
    expect(swapped.alternatives.map((c) => c.id)).toEqual(["a", "c"]);

    const back = replacePendingScanCard([swapped], scan.id, card("a"))[0];
    expect(back.card.id).toBe("a");
    expect(back.alternatives.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("leaves other entries and no-op swaps alone", () => {
    const first = createPendingScan(card("a"), false, [card("b")]);
    const second = createPendingScan(card("x"), false, [card("y")]);
    const result = replacePendingScanCard([first, second], first.id, card("a"));
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(second);
  });

  it("sums value per scanned copy and tolerates cards without a price", () => {
    const scans = [createPendingScan(card("a", 2.5), false), createPendingScan(card("a", 2.5), false), createPendingScan(card("b", null), false)];
    expect(pendingValue(scans)).toBe(5);
  });
});
