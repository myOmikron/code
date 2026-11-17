import { beforeEach, describe, expect, it, vi } from "vitest";

const blindDate = vi.fn();
vi.mock("src/api/graph", () => ({ GraphApi: { blindDate: (...args: unknown[]) => blindDate(...args) } }));
vi.mock("src/api/api", () => ({ Api: {} }));

const { rollBlindDate } = await import("src/utils/blind-date");

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

        const date = await rollBlindDate("krenko", 3, async (ms) => {
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

        expect(await failure(rollBlindDate("krenko", null, async () => {}))).not.toBeNull();
        expect(blindDate).toHaveBeenCalledTimes(1);
    });

    it("gives up after a few busy answers", async () => {
        blindDate.mockImplementation(async () => {
            throw refused(429);
        });

        expect(await failure(rollBlindDate("krenko", null, async () => {}))).not.toBeNull();
        expect(blindDate).toHaveBeenCalledTimes(8);
    });
});
