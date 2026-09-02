import { describe, expect, it } from "vitest";
import { humanizeSlug, parseTypeSource, typeSourceLabel } from "src/utils/type-source";

describe("parseTypeSource", () => {
    it("reads nothing off an absent field", () => {
        expect(parseTypeSource(undefined)).toBeNull();
        expect(parseTypeSource(null)).toBeNull();
        expect(parseTypeSource("")).toBeNull();
    });

    it("reads the default fallback", () => {
        expect(parseTypeSource("default")).toEqual({ kind: "default" });
    });

    it("reads a commander's cEDH subpage, comma and all", () => {
        expect(parseTypeSource("edhrec:najeela-the-blade-blossom/cedh (1,258 decks)")).toEqual({
            kind: "cedh-page",
            slug: "najeela-the-blade-blossom",
            decks: 1258,
        });
    });

    it("reads the pooled cEDH profile", () => {
        expect(parseTypeSource("cedh-pool (40 commanders, 39,657 decks)")).toEqual({
            kind: "cedh-pool",
            commanders: 40,
            decks: 39657,
        });
    });

    it("reads a commander×theme subpage, and does not mistake it for cEDH", () => {
        expect(parseTypeSource("edhrec:muldrotha-the-gravetide/spellslinger (2,028 decks)")).toEqual({
            kind: "theme-page",
            slug: "muldrotha-the-gravetide",
            theme: "spellslinger",
            decks: 2028,
        });
    });

    it("reads a bare commander page", () => {
        expect(parseTypeSource("edhrec:krenko-mob-boss")).toEqual({
            kind: "commander-page",
            slug: "krenko-mob-boss",
        });
    });

    it("reads a pooled archetype profile", () => {
        expect(parseTypeSource("archetype:plus-1-plus-1-counters (20 commanders, 25,590 decks)")).toEqual({
            kind: "archetype",
            tag: "plus-1-plus-1-counters",
            commanders: 20,
            decks: 25590,
        });
    });

    it("falls back to unknown rather than crashing on a shape it has never seen", () => {
        expect(parseTypeSource("something-new-entirely")).toEqual({
            kind: "unknown",
            raw: "something-new-entirely",
        });
    });
});

describe("humanizeSlug", () => {
    it("title-cases a hyphenated slug", () => {
        expect(humanizeSlug("muldrotha-the-gravetide")).toBe("Muldrotha The Gravetide");
    });

    it("leaves a leading digit alone rather than crashing on it", () => {
        expect(humanizeSlug("plus-1-plus-1-counters")).toBe("Plus 1 Plus 1 Counters");
    });
});

describe("typeSourceLabel", () => {
    it("keys and params a cEDH page", () => {
        expect(typeSourceLabel({ kind: "cedh-page", slug: "najeela-the-blade-blossom", decks: 1258 })).toEqual({
            key: "label.type-source-cedh-page",
            params: { commander: "Najeela The Blade Blossom", count: "1.258" },
        });
    });

    it("keys and params the pooled cEDH profile", () => {
        expect(typeSourceLabel({ kind: "cedh-pool", commanders: 40, decks: 39657 })).toEqual({
            key: "label.type-source-cedh-pool",
            params: { commanders: "40", count: "39.657" },
        });
    });

    it("keys and params a theme subpage", () => {
        expect(
            typeSourceLabel({
                kind: "theme-page",
                slug: "muldrotha-the-gravetide",
                theme: "spellslinger",
                decks: 2028,
            }),
        ).toEqual({
            key: "label.type-source-theme-page",
            params: { commander: "Muldrotha The Gravetide", theme: "Spellslinger", count: "2.028" },
        });
    });

    it("keys and params a bare commander page", () => {
        expect(typeSourceLabel({ kind: "commander-page", slug: "krenko-mob-boss" })).toEqual({
            key: "label.type-source-commander-page",
            params: { commander: "Krenko Mob Boss" },
        });
    });

    it("keys and params a pooled archetype", () => {
        expect(
            typeSourceLabel({ kind: "archetype", tag: "plus-1-plus-1-counters", commanders: 20, decks: 25590 }),
        ).toEqual({
            key: "label.type-source-archetype",
            params: { archetype: "Plus 1 Plus 1 Counters", commanders: "20", count: "25.590" },
        });
    });

    it("keys the default fallback with no params", () => {
        expect(typeSourceLabel({ kind: "default" })).toEqual({ key: "label.type-source-default", params: {} });
    });

    it("keeps the raw string for an unrecognised shape", () => {
        expect(typeSourceLabel({ kind: "unknown", raw: "mystery" })).toEqual({
            key: "label.type-source-unknown",
            params: { raw: "mystery" },
        });
    });
});
