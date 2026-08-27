import { describe, expect, it } from "vitest";
import { parseDecklist } from "src/utils/decklist";

describe("parseDecklist", () => {
    it("reads the arena format with headings", () => {
        const { rows, unreadable } = parseDecklist(
            ["Deck", "4 Lightning Bolt (2ED) 162", "1 Sol Ring (LTR) 123", "", "Sideboard", "2 Duress (M21) 92"].join(
                "\n",
            ),
        );

        expect(unreadable).toEqual([]);
        expect(rows).toEqual([
            { quantity: 4, name: "Lightning Bolt", setCode: "2ED", collectorNumber: "162", zone: "Main" },
            { quantity: 1, name: "Sol Ring", setCode: "LTR", collectorNumber: "123", zone: "Main" },
            { quantity: 2, name: "Duress", setCode: "M21", collectorNumber: "92", zone: "Side" },
        ]);
    });

    it("reads bare names and the x notation", () => {
        const { rows } = parseDecklist(["2x Sol Ring", "Llanowar Elves"].join("\n"));

        expect(rows).toEqual([
            { quantity: 2, name: "Sol Ring", zone: "Main" },
            { quantity: 1, name: "Llanowar Elves", zone: "Main" },
        ]);
    });

    it("treats the first blank line as the sideboard break when nothing said otherwise", () => {
        const { rows } = parseDecklist(["4 Lightning Bolt", "", "2 Duress", "", "1 Pyroblast"].join("\n"));

        expect(rows.map((row) => row.zone)).toEqual(["Main", "Side", "Side"]);
    });

    it("keeps zones when headings are present, blank lines and all", () => {
        const { rows } = parseDecklist(["Commander", "1 Atraxa", "", "Deck", "1 Sol Ring"].join("\n"));

        expect(rows.map((row) => row.zone)).toEqual(["Commander", "Main"]);
    });

    it("keeps the foil marker and throws away categories and comments", () => {
        const { rows, unreadable } = parseDecklist(
            [
                "// my pet deck",
                "1 Sol Ring (m10) 214 [Ramp{noDeck}{noPrice}]",
                "1 Arcane Signet (ELD) 331 *F*",
                "1 Command Tower #lands",
            ].join("\n"),
        );

        expect(unreadable).toEqual([]);
        expect(rows).toEqual([
            { quantity: 1, name: "Sol Ring", setCode: "M10", collectorNumber: "214", zone: "Main" },
            {
                quantity: 1,
                name: "Arcane Signet",
                setCode: "ELD",
                collectorNumber: "331",
                foil: true,
                zone: "Main",
            },
            { quantity: 1, name: "Command Tower", zone: "Main" },
        ]);
    });

    it("reads an etched marker as foil, wherever the line carries it", () => {
        const { rows } = parseDecklist(["1 Sol Ring (m10) 214 *E*", "1 Arcane Signet (ELD) 331 *F* [Ramp]"].join("\n"));

        expect(rows.map((row) => row.foil)).toEqual([true, true]);
    });

    it("takes the front face of a double-faced card", () => {
        const { rows } = parseDecklist("1 Delver of Secrets // Insectile Aberration (ISD) 51");

        expect(rows[0]?.name).toBe("Delver of Secrets");
    });

    it("reads the moxfield sideboard heading with a count", () => {
        const { rows } = parseDecklist(["1 Sol Ring", "SIDEBOARD: (2)", "2 Duress"].join("\n"));

        expect(rows.map((row) => row.zone)).toEqual(["Main", "Side"]);
    });

    it("reports what it cannot read", () => {
        const { rows, unreadable } = parseDecklist(["0 Sol Ring", "1 Llanowar Elves"].join("\n"));

        expect(rows).toHaveLength(1);
        expect(unreadable).toEqual(["0 Sol Ring"]);
    });

    it("starts in the zone it was given", () => {
        const { rows } = parseDecklist("1 Atraxa", "Commander");

        expect(rows[0]?.zone).toBe("Commander");
    });
});
