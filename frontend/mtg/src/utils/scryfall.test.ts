import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCardUrl, searchPrintingPage, searchPrintings } from "src/utils/scryfall";

afterEach(() => vi.unstubAllGlobals());

describe("searchPrintings", () => {
    it("passes a sort directive through the API's order parameter", async () => {
        const fetch = vi.fn(
            async (_input: RequestInfo | URL) => new Response(JSON.stringify({ data: [] }), { status: 200 }),
        );
        vi.stubGlobal("fetch", fetch);

        await searchPrintings("sort:edhrec t:instant eur<5", undefined, "cards");

        const url = new URL(String(fetch.mock.calls[0]?.[0]));
        expect(url.searchParams.get("q")).toBe("t:instant eur<5");
        expect(url.searchParams.get("unique")).toBe("cards");
        expect(url.searchParams.get("order")).toBe("edhrec");
        expect(url.searchParams.get("dir")).toBe("auto");
    });

    it("returns Scryfall's cursor for the next result page", async () => {
        const nextPage = "https://api.scryfall.com/cards/search?q=t%3Ainstant&page=2";
        const fetch = vi.fn(
            async (_input: RequestInfo | URL) =>
                new Response(JSON.stringify({ data: [], has_more: true, next_page: nextPage }), { status: 200 }),
        );
        vi.stubGlobal("fetch", fetch);

        const page = await searchPrintingPage("t:instant", undefined, "cards");

        expect(page).toEqual({ printings: [], nextPage });
    });
});

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
