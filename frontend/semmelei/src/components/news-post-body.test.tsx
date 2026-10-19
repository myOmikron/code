import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { NewsPostBody } from "src/components/news-post-body";

/**
 * The markup customers get for a body
 *
 * @param markdown the News Post's body
 *
 * @returns the rendered html
 */
function render(markdown: string): string {
    return renderToStaticMarkup(<NewsPostBody markdown={markdown} />);
}

describe("NewsPostBody", () => {
    test("renders the allowed Markdown", () => {
        const html = render("## Feiertag\n\n**Keine** _Abholung_.\n\n- eins\n\n> Zitat");
        expect(html).toContain("<h2>Feiertag</h2>");
        expect(html).toContain("<strong>Keine</strong> <em>Abholung</em>.");
        expect(html).toContain("<li>eins</li>");
        expect(html).toContain("<blockquote>");
    });

    test("shows raw html as text", () => {
        const html = render('Hallo <script>alert(1)</script> <b onclick="x()">fett</b>');
        expect(html).not.toContain("<script");
        expect(html).not.toContain("<b ");
        expect(html).toContain("&lt;script&gt;");
    });

    test("drops images", () => {
        const html = render("Vorher ![Tracker](https://tracker.example/pixel.gif) nachher");
        expect(html).not.toContain("<img");
        expect(html).not.toContain("tracker.example");
    });

    test("opens links in a new tab without handing over the shop", () => {
        const html = render("[Verein](https://example.org/verein)");
        expect(html).toContain('href="https://example.org/verein"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    test("neutralizes script links", () => {
        const html = render("[Klick](javascript:alert(document.cookie))");
        expect(html).toContain("Klick");
        expect(html).not.toContain("javascript:");
    });

    test("keeps mailto links", () => {
        expect(render("[Schreib uns](mailto:info@example.org)")).toContain('href="mailto:info@example.org"');
    });

    test("renders no tables", () => {
        expect(render("| a | b |\n|---|---|\n| 1 | 2 |")).not.toContain("<table");
    });
});
