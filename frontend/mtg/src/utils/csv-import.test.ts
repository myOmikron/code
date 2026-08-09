import { describe, expect, it } from "vitest";
import {
    detectDelimiter,
    parseAmount,
    parseCollectionCsv,
    parseCondition,
    parseDelimited,
    parseFinish,
} from "src/utils/csv-import";

/** A Moxfield export, headers verbatim */
const MOXFIELD = [
    '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"',
    '"4","0","Lightning Bolt","2ed","Near Mint","English","","","2024-01-01 10:00:00.000","161","False","False","1.50"',
    '"1","0","Sol Ring","cmr","Good (Lightly Played)","English","foil","","2024-01-01 10:00:00.000","472","False","False","12,30"',
].join("\n");

/** An Archidekt export, which carries the printing id outright */
const ARCHIDEKT = [
    "Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Edition Name,Edition Code,Scryfall ID,Collector Number",
    "2,Counterspell,Normal,NM,2024-03-04,EN,0.75,Modern Horizons 2,mh2,1234abcd-0000-0000-0000-00000000ffff,267",
    "1,Ragavan; Nimble Pilferer,Foil,LP,2024-03-05,EN,45.00,Modern Horizons 2,mh2,,138",
].join("\n");

describe("detectDelimiter", () => {
    it("finds a semicolon in a German export", () => {
        expect(detectDelimiter("Anzahl;Name;Set")).toBe(";");
    });

    it("ignores separators inside a quoted card name", () => {
        // Only one real comma, but three inside the quotes
        expect(detectDelimiter('"Look at Me, I\'m the DCI";Edition;Count')).toBe(";");
    });
});

describe("parseDelimited", () => {
    it("keeps a delimiter that sits inside quotes", () => {
        expect(parseDelimited('a,"b,c",d', ",")).toEqual([["a", "b,c", "d"]]);
    });

    it("reads a doubled quote as a literal one", () => {
        expect(parseDelimited('"say ""hi""",x', ",")).toEqual([['say "hi"', "x"]]);
    });

    it("keeps a newline inside a quoted field", () => {
        expect(parseDelimited('"two\nlines",x', ",")).toEqual([["two\nlines", "x"]]);
    });

    it("handles CRLF and drops blank lines", () => {
        expect(parseDelimited("a,b\r\n\r\nc,d\r\n", ",")).toEqual([
            ["a", "b"],
            ["c", "d"],
        ]);
    });

    it("strips a byte order mark off the first header", () => {
        expect(parseDelimited("\uFEFFCount,Name", ",")[0]?.[0]).toBe("Count");
    });
});

describe("parseAmount", () => {
    it("reads German notation", () => {
        expect(parseAmount("1.234,56")).toBe(1234.56);
    });

    it("reads English notation", () => {
        expect(parseAmount("1,234.56")).toBe(1234.56);
    });

    it("reads a lone comma as a decimal point", () => {
        expect(parseAmount("12,30")).toBe(12.3);
    });

    it("ignores a currency symbol", () => {
        expect(parseAmount("$0.75")).toBe(0.75);
    });

    it("has nothing to read in an empty cell", () => {
        expect(parseAmount("")).toBeNull();
        expect(parseAmount("n/a")).toBeNull();
    });
});

describe("parseCondition", () => {
    it("maps the trackers' five-step ladder onto Cardmarket's seven", () => {
        expect(parseCondition("NM")).toBe("NearMint");
        expect(parseCondition("Lightly Played")).toBe("LightPlayed");
        expect(parseCondition("Moderately Played")).toBe("Played");
        expect(parseCondition("Heavily Played")).toBe("Poor");
        expect(parseCondition("Damaged")).toBe("Poor");
    });

    it("reads Moxfield's parenthesised wording", () => {
        expect(parseCondition("Good (Lightly Played)")).toBe("Good");
    });

    it("defaults to near mint when nobody said", () => {
        expect(parseCondition("")).toBe("NearMint");
        expect(parseCondition("who knows")).toBe("NearMint");
    });
});

describe("parseFinish", () => {
    it("understands every spelling the trackers use", () => {
        expect(parseFinish("")).toBe("Nonfoil");
        expect(parseFinish("Normal")).toBe("Nonfoil");
        expect(parseFinish("foil")).toBe("Foil");
        expect(parseFinish("true")).toBe("Foil");
        expect(parseFinish("Etched")).toBe("Etched");
    });
});

describe("parseCollectionCsv", () => {
    it("reads a Moxfield export", () => {
        const { rows, skipped } = parseCollectionCsv(MOXFIELD);

        expect(skipped).toBe(0);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            name: "Lightning Bolt",
            // Moxfield's "Edition" is the set code, not the set name
            setCode: "2ed",
            collectorNumber: "161",
            quantity: 4,
            condition: "NearMint",
            finish: "Nonfoil",
            purchasePriceCents: 150,
        });
        expect(rows[1]).toMatchObject({ finish: "Foil", condition: "Good", purchasePriceCents: 1230 });
    });

    it("reads an Archidekt export and prefers its printing id", () => {
        const { rows } = parseCollectionCsv(ARCHIDEKT);

        expect(rows[0]).toMatchObject({
            scryfallId: "1234abcd-0000-0000-0000-00000000ffff",
            setCode: "mh2",
            quantity: 2,
            acquiredAt: "2024-03-04",
        });
        // The second row has no id, so set and number have to carry it
        expect(rows[1]).toMatchObject({ scryfallId: "", setCode: "mh2", collectorNumber: "138", finish: "Foil" });
    });

    it("skips a row that names no card", () => {
        const { rows, skipped } = parseCollectionCsv("Count,Name,Edition\n1,,\n2,Island,lea\n");

        expect(rows).toHaveLength(1);
        expect(skipped).toBe(1);
    });

    it("never files less than one copy", () => {
        const { rows } = parseCollectionCsv("Count,Name\n0,Island\n");

        expect(rows[0]?.quantity).toBe(1);
    });

    it("tells Deckbox's set name apart from Moxfield's set code", () => {
        // Deckbox has both columns, so "Edition" there is the set's full name
        const { rows } = parseCollectionCsv("Count,Name,Edition,Edition Code\n1,Island,Alpha,lea\n");

        expect(rows[0]?.setCode).toBe("lea");
    });

    it("reads a semicolon separated file", () => {
        const { rows } = parseCollectionCsv("Anzahl;Name;Set\n3;Wald;lea\n");

        expect(rows[0]).toMatchObject({ name: "Wald", setCode: "lea", quantity: 3 });
    });

    it("ignores a date it cannot read unambiguously", () => {
        const { rows } = parseCollectionCsv("Count,Name,Date Added\n1,Island,03/04/2024\n");

        expect(rows[0]?.acquiredAt).toBeNull();
    });
});
