/**
 * What the enums a collection is described with are called.
 *
 * Written as calls rather than as tables of key strings: the translation
 * scanner only ever reads keys spelled out inside a translate call, and one
 * reached through a variable is dropped as unused on its next sweep.
 * The hook below declares the namespace those keys belong to, which is what
 * tells the scanner where to file them.
 */

import { useTranslation } from "react-i18next";
import type { CardRarity, EntryGrouping, EntrySort } from "src/api/generated";
import type { Translate } from "src/utils/translate";

/**
 * What a rarity is called
 *
 * @param t the collection namespace's translate function
 * @param rarity the rarity to name
 *
 * @returns the label
 */
function rarityLabel(t: Translate, rarity: CardRarity): string {
    switch (rarity) {
        case "Common":
            return t("label.rarity-common");
        case "Uncommon":
            return t("label.rarity-uncommon");
        case "Rare":
            return t("label.rarity-rare");
        case "Mythic":
            return t("label.rarity-mythic");
        case "Special":
            return t("label.rarity-special");
        case "Bonus":
            return t("label.rarity-bonus");
    }
}

/**
 * What a grouping is called
 *
 * @param t the collection namespace's translate function
 * @param grouping the grouping to name
 *
 * @returns the label
 */
function groupingLabel(t: Translate, grouping: EntryGrouping): string {
    switch (grouping) {
        case "none":
            return t("label.group-none");
        case "type":
            return t("label.group-type");
        case "mana_value":
            return t("label.group-mana-value");
        case "color":
            return t("label.group-color");
        case "set":
            return t("label.group-set");
        case "tag":
            return t("label.group-tag");
    }
}

/**
 * What an order is called
 *
 * @param t the collection namespace's translate function
 * @param sort the order to name
 *
 * @returns the label
 */
function sortLabel(t: Translate, sort: EntrySort): string {
    switch (sort) {
        case "filed":
            return t("label.sort-filed");
        case "name":
            return t("label.sort-name");
        case "set":
            return t("label.sort-set");
        case "rarity":
            return t("label.sort-rarity");
        case "mana_value":
            return t("label.sort-mana-value");
        case "unit_price":
            return t("label.sort-unit-price");
        case "stack_value":
            return t("label.sort-stack-value");
        case "quantity":
            return t("label.sort-quantity");
        case "condition":
            return t("label.sort-condition");
    }
}

/**
 * Names for the rarities, groupings and orders a collection page shows
 *
 * @returns one naming function each
 */
export function useCardLabels() {
    const [t] = useTranslation("collection");

    return {
        /**
         * What a rarity is called
         *
         * @param rarity the rarity to name
         *
         * @returns the label
         */
        rarity: (rarity: CardRarity) => rarityLabel(t, rarity),
        /**
         * What a grouping is called
         *
         * @param grouping the grouping to name
         *
         * @returns the label
         */
        grouping: (grouping: EntryGrouping) => groupingLabel(t, grouping),
        /**
         * What an order is called
         *
         * @param sort the order to name
         *
         * @returns the label
         */
        sort: (sort: EntrySort) => sortLabel(t, sort),
    };
}
