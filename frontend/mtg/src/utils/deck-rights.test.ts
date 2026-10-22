import { describe, expect, it } from "vitest";
import { deckCardsRoute, deckRights, tagWritable } from "src/utils/deck-rights";

describe("deckRights", () => {
    it("gives the owner everything", () => {
        expect(deckRights("Owner")).toEqual({ edit: true, owner: true, globalTags: true });
    });

    it("lets an Editor build the decklist and its own tags, without the shelf or the global tags", () => {
        expect(deckRights("Editor")).toEqual({ edit: true, owner: false, globalTags: false });
    });

    it("leaves a Viewer and a stranger reading", () => {
        const reading = { edit: false, owner: false, globalTags: false };
        expect(deckRights("Viewer")).toEqual(reading);
        expect(deckRights(null)).toEqual(reading);
        expect(deckRights(undefined)).toEqual(reading);
    });
});

describe("tagWritable", () => {
    const local = { deck: "8f1c2a5e-3c64-4a43-9b0e-5d2b7d0b6a11" };
    const global = { deck: null };

    it("lets the owner change every tag", () => {
        expect(tagWritable(deckRights("Owner"), local)).toBe(true);
        expect(tagWritable(deckRights("Owner"), global)).toBe(true);
    });

    it("lets an Editor change the deck's own tags only", () => {
        expect(tagWritable(deckRights("Editor"), local)).toBe(true);
        expect(tagWritable(deckRights("Editor"), global)).toBe(false);
        expect(tagWritable(deckRights("Editor"), {})).toBe(false);
    });

    it("lets a Viewer change no tag", () => {
        expect(tagWritable(deckRights("Viewer"), local)).toBe(false);
        expect(tagWritable(deckRights("Viewer"), global)).toBe(false);
    });
});

describe("deckCardsRoute", () => {
    it("opens the deck builder for the owner and an Editor", () => {
        expect(deckCardsRoute("Owner")).toBe("/decks/$deckUuid/cards");
        expect(deckCardsRoute("Editor")).toBe("/decks/$deckUuid/cards");
    });

    it("opens the read-only page for everyone else", () => {
        expect(deckCardsRoute("Viewer")).toBe("/collaborating/$deckUuid/cards");
        expect(deckCardsRoute(null)).toBe("/collaborating/$deckUuid/cards");
    });
});
