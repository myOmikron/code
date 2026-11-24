import { describe, expect, it } from "vitest";
import type { DateSessionResponse } from "src/api/generated";
import { bringReactionKey, dateMessages, levelSwipe, swipeLevel } from "src/utils/dating-date";

const session = (overrides: Partial<DateSessionResponse>): DateSessionResponse => ({
    deck: "deck",
    commander: "krenko",
    name: "Krenko, Mob Boss",
    image_art_crop: null,
    status: "Active",
    chemistry: 50,
    next: "Commander",
    round: 1,
    proposal: { theme: "tribal", label: "Tribal" },
    palette: [],
    turns: [],
    ...overrides,
});

describe("dateMessages", () => {
    it("opens with the Commander's proposal", () => {
        expect(dateMessages(session({}))).toEqual([
            { from: "commander", key: "description.propose-1", theme: "Tribal" },
        ]);
    });

    it("tells a turn as proposal, answer and reaction", () => {
        const messages = dateMessages(
            session({
                next: "Player",
                proposal: null,
                turns: [{ by: "Commander", theme: "tribal", label: "Tribal", level: "avoid", delta: -40 }],
            }),
        );

        expect(messages.map((message) => message.key)).toEqual([
            "description.propose-1",
            "label.level-avoid",
            "description.react-avoid-top",
        ]);
        expect(messages[2].delta).toBe(-40);
    });

    it("tells a player's theme with its level", () => {
        const messages = dateMessages(
            session({
                proposal: { theme: "tokens", label: "Tokens" },
                turns: [
                    { by: "Commander", theme: "tribal", label: "Tribal", level: "allin", delta: 20 },
                    { by: "Player", theme: "treasure", label: "Treasure", level: "core", delta: 5 },
                ],
            }),
        );

        expect(messages[3]).toEqual({
            from: "player",
            key: "description.bring-me",
            theme: "Treasure",
            level: "label.level-core",
        });
        expect(messages[4].key).toBe("description.bring-fine");
        expect(messages.at(-1)).toEqual({ from: "commander", key: "description.propose-2", theme: "Tokens" });
    });
});

describe("bringReactionKey", () => {
    it("reads the chemistry change", () => {
        expect(bringReactionKey(15)).toBe("description.bring-good");
        expect(bringReactionKey(0)).toBe("description.bring-meh");
        expect(bringReactionKey(-10)).toBe("description.bring-bad");
        expect(bringReactionKey(-25)).toBe("description.bring-worst");
    });
});

describe("swipeLevel", () => {
    it("reads right as core, up as all in and left as not my thing", () => {
        expect(swipeLevel("right")).toBe("core");
        expect(swipeLevel("up")).toBe("allin");
        expect(swipeLevel("left")).toBe("avoid");
    });
});

describe("levelSwipe", () => {
    it("sends an answer off the way its swipe goes", () => {
        for (const direction of ["left", "right", "up"] as const) {
            expect(levelSwipe(swipeLevel(direction))).toBe(direction);
        }
    });

    it("has no swipe for a little", () => {
        expect(levelSwipe("light")).toBeNull();
    });
});
