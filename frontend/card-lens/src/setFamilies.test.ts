import { describe, expect, it } from "vitest";
import { filterFamilies, groupSetsIntoFamilies } from "./setFamilies";
import type { IndexedSet } from "./setFamilies";

const set = (code: string, name: string, cardCount = 1): IndexedSet => ({ code, name, cardCount });

// The real Strixhaven sets, which is the case the picker has to get right: selecting the release
// must enable all seven codes, including the ones whose names differ ("Mystical Archive") and the
// ones only related through their code ("TSOC" → "SOC").
const strixhaven: IndexedSet[] = [
  set("SOS", "Secrets of Strixhaven", 368),
  set("ASOS", "Secrets of Strixhaven Art Series", 108),
  set("SOC", "Secrets of Strixhaven Commander", 426),
  set("TSOC", "Secrets of Strixhaven Commander Tokens", 30),
  set("SOA", "Secrets of Strixhaven Mystical Archive", 195),
  set("PSOS", "Secrets of Strixhaven Promos", 80),
  set("TSOS", "Secrets of Strixhaven Tokens", 15),
];

describe("set families", () => {
  it("groups a release's companion products under one family", () => {
    const families = groupSetsIntoFamilies(strixhaven);
    expect(families).toHaveLength(1);
    expect(families[0].name).toBe("Secrets of Strixhaven");
    expect(families[0].sets.map((s) => s.code)).toEqual(["ASOS", "PSOS", "SOA", "SOC", "SOS", "TSOC", "TSOS"]);
    expect(families[0].cardCount).toBe(1222);
  });

  it("keeps separate releases apart even when their names overlap", () => {
    const families = groupSetsIntoFamilies([
      ...strixhaven,
      set("STX", "Strixhaven: School of Mages", 415),
      set("TSTX", "Strixhaven: School of Mages Tokens", 9),
    ]);
    expect(families.map((f) => f.name).sort()).toEqual(["Secrets of Strixhaven", "Strixhaven: School of Mages"]);
  });

  it("does not mistake a set name's own last word for a product suffix", () => {
    // "Edition" and "Masters" end real releases; stripping them would merge unrelated sets.
    const families = groupSetsIntoFamilies([
      set("10E", "Tenth Edition"),
      set("9ED", "Ninth Edition"),
      set("DMR", "Dominaria Remastered"),
    ]);
    expect(families.map((f) => f.name).sort()).toEqual(["Dominaria Remastered", "Ninth Edition", "Tenth Edition"]);
  });

  it("finds families by release name and by member set code", () => {
    const families = groupSetsIntoFamilies(strixhaven);
    expect(filterFamilies(families, "strix")).toHaveLength(1);
    expect(filterFamilies(families, "tsoc")).toHaveLength(1);
    expect(filterFamilies(families, "bloomburrow")).toHaveLength(0);
  });
});
