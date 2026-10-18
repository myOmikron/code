// PROTOTYPE, wipe me: fake News Posts for the placement prototype (branch prototype/semmelei-news-placement)

/** A fake Published News Post */
export type FakePost = {
    /** Id */
    id: string;
    /** Title */
    title: string;
    /** When it was published */
    publishedAt: string;
    /** Markdown body */
    body: string;
};

/** Newest first, like the real public list */
export const FAKE_POSTS: FakePost[] = [
    {
        id: "p3",
        title: "Keine Abholung am 1. November",
        publishedAt: "2026-10-16T09:12:00Z",
        body: `An **Allerheiligen** hat die Bäckerei geschlossen, deshalb gibt es am Samstag, 1. November, keine Abholung.

Die nächste Abholung ist am **8. November**. Bestellungen dafür sind ab sofort möglich.

Bei Fragen erreicht ihr uns unter [info@nachbarschaftshilfe-sindelsdorf.de](mailto:info@nachbarschaftshilfe-sindelsdorf.de).`,
    },
    {
        id: "p2",
        title: "Neu im Sortiment: Dinkel-Vollkornbrot",
        publishedAt: "2026-10-02T14:30:00Z",
        body: `Ab sofort könnt ihr auch ein **Dinkel-Vollkornbrot** (750 g) bestellen.

Die Bäckerei backt es nur in kleinen Mengen, also:

- bis Donnerstagabend bestellen
- maximal zwei Stück pro Bestellung

> Danke an alle, die sich das gewünscht haben!`,
    },
    {
        id: "p1",
        title: "Helferinnen und Helfer gesucht",
        publishedAt: "2026-09-12T08:00:00Z",
        body: `## Samstagvormittag frei?

Für die Ausgabe suchen wir noch Leute, die **einmal im Monat** von 8 bis 10 Uhr mithelfen.

Mehr über uns steht auf [unserer Webseite](https://nachbarschaftshilfe-sindelsdorf.de/). Meldet euch gern direkt bei der Ausgabe.`,
    },
];

/**
 * Rough plain-text excerpt of a Markdown body (the real one needs a proper decision)
 *
 * @param body markdown
 * @param max max characters
 *
 * @returns the excerpt
 */
export function excerpt(body: string, max = 140): string {
    const text = body
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[#*>_`-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
