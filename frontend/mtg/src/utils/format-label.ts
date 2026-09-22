/**
 * What a format is called.
 *
 * Lives in the general namespace rather than a page's own, because three unrelated corners of the
 * app name formats — a deck's rules, a collection's charts, and a tournament's settings, join
 * screen and beamer. It used to be spelled out twice, in `deck` and `collection`, which is why the
 * tournament surfaces printed the bare slug instead: the label they needed was in a namespace
 * they were not allowed to reach for.
 *
 * Written as a `switch` over spelled-out translate calls, like `deck-labels.ts`: the translation
 * scanner only sees keys written inside a `t(...)`, and one reached through a lookup table is
 * dropped as unused on its next sweep.
 */

import type { Translate } from "src/utils/translate";

/**
 * What a format is called
 *
 * Anything this does not know falls back to the bare slug, which is what a format added to the
 * backend without a label here reads as.
 *
 * @param t the general namespace's translate function
 * @param slug the format
 *
 * @returns its name
 */
export function formatName(t: Translate, slug: string): string {
    switch (slug) {
        case "commander":
            return t("label.format-commander");
        case "duel":
            return t("label.format-duel");
        case "archon":
            return t("label.format-archon");
        case "predh":
            return t("label.format-predh");
        case "paupercommander":
            return t("label.format-paupercommander");
        case "oathbreaker":
            return t("label.format-oathbreaker");
        case "brawl":
            return t("label.format-brawl");
        case "competitivebrawl":
            return t("label.format-competitivebrawl");
        case "standardbrawl":
            return t("label.format-standardbrawl");
        case "gladiator":
            return t("label.format-gladiator");
        case "standard":
            return t("label.format-standard");
        case "future":
            return t("label.format-future");
        case "pioneer":
            return t("label.format-pioneer");
        case "modern":
            return t("label.format-modern");
        case "legacy":
            return t("label.format-legacy");
        case "vintage":
            return t("label.format-vintage");
        case "pauper":
            return t("label.format-pauper");
        case "penny":
            return t("label.format-penny");
        case "premodern":
            return t("label.format-premodern");
        case "oldschool":
            return t("label.format-oldschool");
        case "historic":
            return t("label.format-historic");
        case "timeless":
            return t("label.format-timeless");
        case "alchemy":
            return t("label.format-alchemy");
        case "tlr":
            return t("label.format-tlr");
        default:
            return slug;
    }
}
