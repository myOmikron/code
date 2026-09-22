import { describe, expect, it } from "vitest";
import { decideScan, MIN_ACCEPT_INLIERS } from "./scan-decision";
import type { IndexMatch } from "./embedding-index";

/** A candidate with enough metadata to distinguish editions. */
function match(id: string): IndexMatch {
    return {
        score: 0.8,
        printing: {
            id,
            face: 0,
            name: "Card",
            set: id,
            setName: id,
            collectorNumber: "1",
            lang: "en",
            manaCost: "",
            typeLine: "",
            colors: [],
            foilOnly: false,
        },
    };
}

describe("scan decision", () => {
    it("preserves the detail comparison's winner even when its inlier count is slightly lower", () => {
        const a = match("a"),
            b = match("b");
        expect(
            decideScan(
                [
                    { match: a, inliers: 100 },
                    { match: b, inliers: 96 },
                ],
                b,
            ),
        ).toMatchObject({
            status: "recognised",
            printing: b.printing,
            inliers: 96,
            runnerUp: 100,
        });
    });

    it("never accepts a weak geometric match, even when preferred", () => {
        const a = match("a");
        expect(decideScan([{ match: a, inliers: MIN_ACCEPT_INLIERS - 1 }], a).status).toBe("unrecognised");
    });

    it("uses the strongest verified candidate when no detail winner is supplied", () => {
        const a = match("a"),
            b = match("b");
        expect(
            decideScan([
                { match: a, inliers: 50 },
                { match: b, inliers: 80 },
            ]),
        ).toMatchObject({ printing: b.printing });
    });
});
