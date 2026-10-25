/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardSymbolUrl } from "./card-symbols";

describe("bundled card symbols", () => {
    it.each([
        ["U", "U"],
        ["{3}", "3"],
        ["w/u", "WU"],
        ["2/W", "2W"],
        ["B/G/P", "BGP"],
        ["C/P", "CP"],
        ["½", "HALF"],
        ["∞", "INFINITY"],
    ])("resolves %s to a local SVG", (symbol, filename) => {
        expect(cardSymbolUrl(symbol)).toBe(`/card-symbols/${filename}.svg`);
        expect(readFileSync(`public${cardSymbolUrl(symbol)}`, "utf8")).toContain("<svg");
    });

    it("ships valid SVGs for every bundled symbol, including all chart colors", () => {
        const filenames = readdirSync("public/card-symbols").filter((file) => file.endsWith(".svg"));
        for (const symbol of ["W", "U", "B", "R", "G", "C"]) expect(filenames).toContain(`${symbol}.svg`);
        for (const file of filenames) expect(readFileSync(`public/card-symbols/${file}`, "utf8")).toContain("<svg");
    });
});
