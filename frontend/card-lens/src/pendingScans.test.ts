import { describe, expect, it } from "vitest";
import {
  addPendingScan,
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

  it("sums value per scanned copy and tolerates cards without a price", () => {
    const scans = [createPendingScan(card("a", 2.5), false), createPendingScan(card("a", 2.5), false), createPendingScan(card("b", null), false)];
    expect(pendingValue(scans)).toBe(5);
  });
});
