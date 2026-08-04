import { describe, expect, it } from "vitest";
import { dominantWords, normalizeName } from "./nameIndex";

describe("normalizeName", () => {
  it("folds punctuation and diacritics the way the built index does", () => {
    expect(normalizeName("Zada, Hedron Grinder")).toBe("zada hedron grinder");
    expect(normalizeName("Nazgûl")).toBe("nazgul");
    expect(normalizeName("Storm God's Oracle")).toBe("storm god s oracle");
  });
});

describe("dominantWords", () => {
  it("keeps a short title read with stray tokens around it", () => {
    // The case the word fallback exists for: a one-word title that OCR trailed noise onto.
    expect(dominantWords("Nazgul Ea")).toContain("nazgul");
  });

  it("drops fragments of a longer title, which would exact-match an unrelated card", () => {
    // "Spider", "Zombie" and "Oracle" are all real cards; matching them off a partial read of a
    // longer title is how the wrong card used to be added at full confidence.
    expect(dominantWords("Spider Man Brooklyn Vision")).not.toContain("spider");
    expect(dominantWords("Zombie Master")).not.toContain("zombie");
    expect(dominantWords("Storm God's Oracle")).not.toContain("oracle");
  });

  it("judges each line on its own, since OCR output spans several passes", () => {
    // "nazgul" dominates its own line even though the whole text is much longer.
    const words = dominantWords("some garbage from the artwork\nNazgul\nmore garbage here");
    expect(words).toContain("nazgul");
  });

  it("ignores words too short to carry an identity", () => {
    expect(dominantWords("Fog")).not.toContain("fog");
  });

  it("returns nothing for empty or punctuation-only text", () => {
    expect(dominantWords("")).toEqual([]);
    expect(dominantWords("~ - .")).toEqual([]);
  });
});
