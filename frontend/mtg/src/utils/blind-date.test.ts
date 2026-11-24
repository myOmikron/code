import { beforeEach, describe, expect, it, vi } from "vitest";

const blindDate = vi.fn();
const importCards = vi.fn();
vi.mock("src/api/graph", () => ({ GraphApi: { blindDate: (...args: unknown[]) => blindDate(...args) } }));
vi.mock("src/api/api", () => ({
    Api: { decks: { cards: { import: (...args: unknown[]) => importCards(...args) } } },
}));
vi.mock("src/utils/use-suggestion-cards", () => ({
    resolveCardNames: async (names: Array<string>) =>
        new Map(names.map((name) => [name, { id: `print-${name}`, finishes: ["nonfoil"] }])),
}));

const { rollBlindDate, surpriseMe } = await import("src/utils/blind-date");

const refused = (status: number) => ({ response: new Response(null, { status }) });
const DATE = { themes: [], add_now: [], open_slots: 35, solved: true };

const failure = async (roll: Promise<unknown>) => {
    try {
        await roll;
    } catch (error) {
        return error;
    }
    return null;
};

describe("rollBlindDate", () => {
    beforeEach(() => {
        blindDate.mockReset();
    });

    it("asks again while every solver slot is taken", async () => {
        blindDate.mockRejectedValueOnce(refused(429)).mockRejectedValueOnce(refused(429)).mockResolvedValue(DATE);
        const waits: Array<number> = [];

        const date = await rollBlindDate("krenko", null, 3, async (ms) => {
            waits.push(ms);
        });

        expect(date).toBe(DATE);
        expect(blindDate).toHaveBeenCalledTimes(3);
        expect(waits).toHaveLength(2);
    });

    it("gives up on anything but a busy solver", async () => {
        blindDate.mockImplementation(async () => {
            throw refused(500);
        });

        expect(await failure(rollBlindDate("krenko", null, null, async () => {}))).not.toBeNull();
        expect(blindDate).toHaveBeenCalledTimes(1);
    });

    it("gives up after a few busy answers", async () => {
        blindDate.mockImplementation(async () => {
            throw refused(429);
        });

        expect(await failure(rollBlindDate("krenko", null, null, async () => {}))).not.toBeNull();
        expect(blindDate).toHaveBeenCalledTimes(8);
    });
});

describe("surpriseMe", () => {
    beforeEach(() => {
        importCards.mockReset();
    });

    it("files every copy of a basic", async () => {
        const date = {
            ...DATE,
            add_later: [
                { oracle_id: "island", name: "Island", quantity: 12 },
                { oracle_id: "a", name: "Ponder" },
            ],
        };

        const added = await surpriseMe("deck", date);

        expect(added).toBe(13);
        const [, request] = importCards.mock.calls[0];
        expect(request.cards.map((card: { quantity: number }) => card.quantity)).toEqual([12, 1]);
    });
});
