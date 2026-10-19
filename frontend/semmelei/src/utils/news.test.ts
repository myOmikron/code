import { describe, expect, test } from "vitest";
import { excerpt, teaserPost } from "src/utils/news";

const NOW = new Date("2026-11-30T12:00:00Z");

/**
 * A Published News Post, published `days` before {@link NOW}
 *
 * @param days age in days
 *
 * @returns the post
 */
function postAged(days: number) {
    return {
        title: `${days} days old`,
        body: "Text",
        published_at: new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    };
}

describe("teaserPost", () => {
    test("the newest post at 29 days is shown", () => {
        expect(teaserPost([postAged(29), postAged(40)], NOW)?.title).toBe("29 days old");
    });

    test("the newest post at 30 days or more is not shown", () => {
        expect(teaserPost([postAged(30)], NOW)).toBeUndefined();
        expect(teaserPost([postAged(31), postAged(45)], NOW)).toBeUndefined();
    });

    test("without posts nothing is shown", () => {
        expect(teaserPost([], NOW)).toBeUndefined();
    });
});

describe("excerpt", () => {
    test("is the first paragraph as plain text", () => {
        expect(excerpt("Am 1. November keine Abholung.\n\nDanach wie gewohnt.")).toBe("Am 1. November keine Abholung.");
    });

    test("skips headings, lists and quotes before the first paragraph", () => {
        expect(excerpt("## Feiertag\n\n- erstens\n- zweitens\n\n> Zitat\n\nDer eigentliche Text.")).toBe(
            "Der eigentliche Text.",
        );
    });

    test("keeps link text and emphasis as text", () => {
        expect(excerpt("Wir suchen **Helfer** für [die Ausgabe](https://example.org), _gerne_ auch spontan.")).toBe(
            "Wir suchen Helfer für die Ausgabe, gerne auch spontan.",
        );
    });

    test("joins the lines of a paragraph", () => {
        expect(excerpt("Erste Zeile\nzweite Zeile")).toBe("Erste Zeile zweite Zeile");
    });

    test("is empty without any paragraph", () => {
        expect(excerpt("# Nur eine Überschrift")).toBe("");
    });
});
