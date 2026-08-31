import { afterEach, describe, expect, it, vi } from "vitest";
import { correctCardWords, fuzzyCardName, parseCardUrl, searchPrintingPage, searchPrintings } from "src/utils/scryfall";

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

    it("lets a typed sort directive override a default one in front of it", async () => {
        const fetch = vi.fn(
            async (_input: RequestInfo | URL) => new Response(JSON.stringify({ data: [] }), { status: 200 }),
        );
        vi.stubGlobal("fetch", fetch);

        await searchPrintings("f:commander sort:edhrec t:goblin sort:cmc", undefined, "cards");

        const url = new URL(String(fetch.mock.calls[0]?.[0]));
        expect(url.searchParams.get("q")).toBe("f:commander  t:goblin");
        expect(url.searchParams.get("order")).toBe("cmc");
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

describe("two-faced cards", () => {
    /**
     * Stubs the global fetch so one search answers with a single card object
     *
     * @param card the raw Scryfall card the search should return
     */
    function respondWith(card: unknown) {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ data: [card] }), { status: 200 })),
        );
    }

    it("takes both scans off a card that is photographed twice", async () => {
        respondWith({
            id: "11bf83bb-c95b-4b4f-9a56-ce7a1816307a",
            name: "Delver of Secrets // Insectile Aberration",
            set: "isd",
            set_name: "Innistrad",
            collector_number: "51",
            card_faces: [
                { name: "Delver of Secrets", image_uris: { small: "front-small", normal: "front-normal" } },
                { name: "Insectile Aberration", image_uris: { small: "back-small", normal: "back-normal" } },
            ],
        });

        const [printing] = await searchPrintings("delver");

        expect(printing?.imageUrl).toBe("front-small");
        expect(printing?.largeImageUrl).toBe("front-normal");
        expect(printing?.backImageUrl).toBe("back-small");
        expect(printing?.backLargeImageUrl).toBe("back-normal");
    });

    it("leaves the back empty for a card whose faces share one picture", async () => {
        respondWith({
            id: "1f5b8b0c-9c19-4a1f-bfe1-58ba4d2e1eb2",
            name: "Fire // Ice",
            set: "apc",
            set_name: "Apocalypse",
            collector_number: "128",
            image_uris: { small: "split-small", normal: "split-normal" },
            card_faces: [{ name: "Fire" }, { name: "Ice" }],
        });

        const [printing] = await searchPrintings("fire // ice");

        expect(printing?.imageUrl).toBe("split-small");
        expect(printing?.backImageUrl).toBeNull();
        expect(printing?.backLargeImageUrl).toBeNull();
        expect(printing?.faces).toHaveLength(2);
    });
});

describe("fuzzyCardName", () => {
    it("resolves the name Scryfall matched, and asks with the fuzzy parameter", async () => {
        const fetch = vi.fn(
            async (_input: RequestInfo | URL) =>
                new Response(JSON.stringify({ name: "Gifts Ungiven" }), { status: 200 }),
        );
        vi.stubGlobal("fetch", fetch);

        const name = await fuzzyCardName("giffts ungiven");

        expect(name).toBe("Gifts Ungiven");
        const url = new URL(String(fetch.mock.calls[0]?.[0]));
        expect(url.searchParams.get("fuzzy")).toBe("giffts ungiven");
    });

    it("resolves null when nothing is close enough", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 404 })),
        );

        expect(await fuzzyCardName("zzzzqqqq")).toBeNull();
    });

    it("resolves null when Scryfall answers with an error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 500 })),
        );

        expect(await fuzzyCardName("gobblin")).toBeNull();
    });
});

// The card-name catalog is fetched once and kept for the tab's lifetime, so
// these tests share that state and their order carries meaning: the failed
// fetch comes first (a failure clears the slot for a retry), the successful
// one builds the vocabulary, and the later cases prove it is reused rather
// than refetched by handing them a fetch that would fail.
describe("correctCardWords", () => {
    it("answers no candidates when the catalog cannot be fetched", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 500 })),
        );

        expect(await correctCardWords("Unnderworld")).toEqual([]);
    });

    it("repairs a mistyped word to the closest real card word", async () => {
        const fetch = vi.fn(
            async (_input: RequestInfo | URL) =>
                new Response(
                    JSON.stringify({
                        data: [
                            "Underworld Breach",
                            "Lightning Bolt",
                            "Gifts Ungiven",
                            "Torment of Hailfire",
                            "Hellfire",
                            "Hellspire",
                        ],
                    }),
                    { status: 200 },
                ),
        );
        vi.stubGlobal("fetch", fetch);

        expect(await correctCardWords("Unnderworld")).toEqual(["underworld"]);
        expect(String(fetch.mock.calls[0]?.[0])).toContain("catalog/card-names");
    });

    it("reuses the catalog and repairs only the word that needs it", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Promise.reject(new Error("must not refetch"))),
        );

        expect(await correctCardWords("gifts unngiven")).toEqual(["gifts ungiven"]);
    });

    it("answers no candidates when every word is already a real card word with no alternate", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Promise.reject(new Error("must not refetch"))),
        );

        expect(await correctCardWords("Lightning Bolt")).toEqual([]);
    });

    it("repairs a longer word up to three edits away", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Promise.reject(new Error("must not refetch"))),
        );

        // Three edits from "lightning" (insert, substitute, substitute) —
        // exercises the raised ceiling for words over four letters.
        expect(await correctCardWords("lixtnming")).toEqual(["lightning"]);
    });

    it("offers every tied alternate for a word that is real but the wrong one", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Promise.reject(new Error("must not refetch"))),
        );

        // "Hellfire" is itself a card, so the baseline repair only fixes
        // "tourment" and leaves it alone. "Hellspire" is the same distance
        // from "Hellfire" as the actually-meant "Hailfire" — a single
        // "closest" pick could have landed on either, so both are offered,
        // nearest (tied) first.
        expect(await correctCardWords("Tourment of Hellfire")).toEqual([
            "torment of hellfire",
            "torment of hailfire",
            "torment of hellspire",
        ]);
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
