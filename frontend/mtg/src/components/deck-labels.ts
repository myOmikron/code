/**
 * What formats, zones and card groups are called.
 *
 * Written as `switch` statements over spelled-out translate calls, like
 * `card-labels.ts`: the translation scanner only sees keys written inside a
 * `t(...)`, and one reached through a table is dropped as unused on its next
 * sweep. Anything a switch does not know falls back to the bare slug, which is
 * what a format added to the backend without a label here reads as.
 */

import { useTranslation } from "react-i18next";
import type { DeckZone, FormatRulesResponse } from "src/api/generated";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import type { Translate } from "src/utils/translate";

/** The zones in the order a decklist reads */
export const ZONE_ORDER: Array<DeckZone> = ["Commander", "Main", "Side", "Companion", "Maybe"];

/**
 * The labels the deck pages need
 *
 * @returns one function per thing that needs naming
 */
export function useDeckLabels() {
    const [t] = useTranslation("deck");

    return {
        /**
         * What a format is called
         *
         * @param slug the format
         *
         * @returns its name
         */
        format: (slug: string): string => formatName(t, slug),

        /**
         * The one line under a format saying what it asks for
         *
         * @param rules the format's rules
         *
         * @returns the line
         */
        shape: (rules: FormatRulesResponse): string => {
            const size =
                rules.deck_size.kind === "exactly"
                    ? t("description.format-size-exact", { cards: rules.deck_size.cards })
                    : t("description.format-size-least", { cards: rules.deck_size.cards });
            const copies =
                rules.max_copies === 1
                    ? t("description.format-singleton")
                    : t("description.format-copies", { copies: rules.max_copies });
            return `${size} · ${copies}`;
        },

        /**
         * What a zone is called
         *
         * @param zone the zone
         *
         * @returns its name
         */
        zone: (zone: DeckZone): string => zoneName(t, zone),

        /**
         * What a card type is called
         *
         * @param slug the type
         *
         * @returns its name
         */
        type: (slug: string): string => typeName(t, slug),

        /**
         * What a colour is called
         *
         * @param letter the colour, as Scryfall spells it
         *
         * @returns its name
         */
        color: (letter: string): string => colorName(t, letter),

        /**
         * What a Commander bracket is called
         *
         * @param slug the bracket
         *
         * @returns its name
         */
        bracket: (slug: string): string => bracketName(t, slug),

        /**
         * What a grouping is called
         *
         * @param grouping how the list is broken up
         *
         * @returns its name
         */
        grouping: (grouping: DeckGrouping): string => groupingName(t, grouping),

        /**
         * What an order is called
         *
         * @param sort how the cards inside a group are ordered
         *
         * @returns its name
         */
        sort: (sort: DeckSort): string => sortName(t, sort),
    };
}

/**
 * What a format is called, see {@link useDeckLabels}
 *
 * @param t the deck namespace's translate function
 * @param slug the format
 *
 * @returns its name
 */
function formatName(t: Translate, slug: string): string {
    switch (slug) {
        case "commander":
            return t("label.format-commander");
        case "standard":
            return t("label.format-standard");
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
        default:
            return slug;
    }
}

/**
 * What a zone is called, see {@link useDeckLabels}
 *
 * @param t the deck namespace's translate function
 * @param zone the zone
 *
 * @returns its name
 */
function zoneName(t: Translate, zone: DeckZone): string {
    switch (zone) {
        case "Commander":
            return t("label.zone-commander");
        case "Side":
            return t("label.zone-side");
        case "Companion":
            return t("label.zone-companion");
        case "Maybe":
            return t("label.zone-maybe");
        case "Main":
            return t("label.zone-main");
    }
}

/**
 * What a card type is called, see {@link useDeckLabels}
 *
 * @param t the deck namespace's translate function
 * @param slug the type
 *
 * @returns its name
 */
function typeName(t: Translate, slug: string): string {
    switch (slug) {
        case "land":
            return t("label.type-land");
        case "creature":
            return t("label.type-creature");
        case "planeswalker":
            return t("label.type-planeswalker");
        case "battle":
            return t("label.type-battle");
        case "instant":
            return t("label.type-instant");
        case "sorcery":
            return t("label.type-sorcery");
        case "enchantment":
            return t("label.type-enchantment");
        case "artifact":
            return t("label.type-artifact");
        case "conspiracy":
            return t("label.type-conspiracy");
        case "dungeon":
            return t("label.type-dungeon");
        case "phenomenon":
            return t("label.type-phenomenon");
        case "plane":
            return t("label.type-plane");
        case "scheme":
            return t("label.type-scheme");
        case "vanguard":
            return t("label.type-vanguard");
        default:
            return t("label.type-other");
    }
}

/**
 * What a colour is called, see {@link useDeckLabels}
 *
 * @param t the deck namespace's translate function
 * @param letter the colour
 *
 * @returns its name
 */
function colorName(t: Translate, letter: string): string {
    switch (letter) {
        case "W":
            return t("label.color-white");
        case "U":
            return t("label.color-blue");
        case "B":
            return t("label.color-black");
        case "R":
            return t("label.color-red");
        case "G":
            return t("label.color-green");
        default:
            return t("label.color-colorless");
    }
}

/**
 * What a grouping is called, see {@link useDeckLabels}
 *
 * @param t the deck namespace's translate function
 * @param grouping how the list is broken up
 *
 * @returns its name
 */
function groupingName(t: Translate, grouping: DeckGrouping): string {
    switch (grouping) {
        case "mana":
            return t("label.group-mana");
        case "color":
            return t("label.group-color");
        case "zone":
            return t("label.group-zone");
        case "tag":
            return t("label.group-tag");
        case "type":
            return t("label.group-type");
    }
}

/**
 * What an order is called, see {@link useDeckLabels}
 *
 * @param t the deck namespace's translate function
 * @param sort how the cards inside a group are ordered
 *
 * @returns its name
 */
function sortName(t: Translate, sort: DeckSort): string {
    switch (sort) {
        case "mana":
            return t("label.sort-mana");
        case "price":
            return t("label.sort-price");
        case "name":
            return t("label.sort-name");
    }
}

/**
 * What a Commander bracket is called, see {@link useDeckLabels}
 *
 * @param t the deck namespace's translate function
 * @param slug the bracket
 *
 * @returns its name
 */
function bracketName(t: Translate, slug: string): string {
    switch (slug) {
        case "exhibition":
            return t("label.bracket-exhibition");
        case "core":
            return t("label.bracket-core");
        case "upgraded":
            return t("label.bracket-upgraded");
        case "optimized":
            return t("label.bracket-optimized");
        case "cedh":
            return t("label.bracket-cedh");
        default:
            return slug;
    }
}
