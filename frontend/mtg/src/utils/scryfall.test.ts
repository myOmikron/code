import { describe, expect, it } from "vitest";
import { parseCardUrl } from "src/utils/scryfall";

describe("parseCardUrl", () => {
    it("reads a dragged card image", () => {
        expect(
            parseCardUrl(
                "https://cards.scryfall.io/display/front/1/7/1704d11c-569c-4b4e-bbe0-df42af98c4fc.webp?1783948590",
            ),
        ).toEqual({ kind: "id", id: "1704d11c-569c-4b4e-bbe0-df42af98c4fc" });
    });

    it("reads a dragged card link", () => {
        expect(parseCardUrl("https://scryfall.com/card/hob/1/long-bodied-grey-dog")).toEqual({
            kind: "coordinate",
            setCode: "hob",
            collectorNumber: "1",
            lang: undefined,
        });
    });

    it("reads the language segment", () => {
        expect(parseCardUrl("https://scryfall.com/card/hob/1/de/langbeiniger-grauer-hund")).toEqual({
            kind: "coordinate",
            setCode: "hob",
            collectorNumber: "1",
            lang: "de",
        });
    });

    it("does not mistake a short slug for a language", () => {
        expect(parseCardUrl("https://scryfall.com/card/mh2/145/fry")).toEqual({
            kind: "coordinate",
            setCode: "mh2",
            collectorNumber: "145",
            lang: undefined,
        });
    });

    it("rejects anything else", () => {
        expect(parseCardUrl("https://example.com/card/hob/1")).toBeNull();
        expect(parseCardUrl("not a url")).toBeNull();
    });
});
