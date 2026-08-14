/**
 * Links into Cardmarket, and the defaults they are built with.
 *
 * The catalog stores Cardmarket's product id and nothing else about them:
 * `/Magic/Products?idProduct=…` is what Cardmarket itself resolves, and it is
 * the form Scryfall links to. Their product and set names differ from
 * Scryfall's often enough that spelling out a path would miss.
 *
 * Which country page, and which offers to show, is the reader's own setting,
 * kept in `localStorage` the way the theme is: it describes this browser, not
 * the account, and a link should not wait for a round trip.
 */

import type { CardCondition, CardFinish } from "src/api/generated";

/** The country pages Cardmarket serves, as the segment its urls carry */
export const CARDMARKET_REGIONS = ["de", "en", "fr", "it", "es"] as const;

/** One of {@link CARDMARKET_REGIONS} */
export type CardmarketRegion = (typeof CARDMARKET_REGIONS)[number];

/**
 * Cardmarket's language ids, keyed by Scryfall's language code.
 *
 * A printing knows the language it was printed in; Cardmarket knows one product
 * per printing and sorts the languages into it. Filtering by this is what turns
 * "this card" into "this card as I own it".
 *
 * Languages Cardmarket does not grade separately are simply absent, and an
 * unknown code leaves the filter off rather than guessing at a number.
 */
const LANGUAGE_IDS: Record<string, number> = {
    en: 1,
    fr: 2,
    de: 3,
    es: 4,
    it: 5,
    zhs: 6,
    ja: 7,
    pt: 8,
    ru: 9,
    ko: 10,
    zht: 11,
};

/** Cardmarket's condition ids, keyed by the grade the collection files */
const CONDITION_IDS: Record<CardCondition, number> = {
    Mint: 1,
    NearMint: 2,
    Excellent: 3,
    Good: 4,
    LightPlayed: 5,
    Played: 6,
    Poor: 7,
};

/**
 * The countries a seller can sit in, as Cardmarket's own ids.
 *
 * Read off Cardmarket's own filter. The numbering follows the iso codes in
 * alphabetical order up to `SK`, and everything Cardmarket opened up to later
 * was appended past the end, which is why Croatia is not where the alphabet
 * would put it. Germany is the one value not read off the list directly: it was
 * the filter already set when the list was taken, and 7 is the only gap left
 * between `CZ` and `DK`.
 *
 * Countries are named through `Intl.DisplayNames` rather than through the
 * translation files: the browser already knows what "HR" is called in German.
 */
export const SELLER_COUNTRIES: Array<{ id: number; code: string }> = [
    { id: 1, code: "AT" },
    { id: 2, code: "BE" },
    { id: 3, code: "BG" },
    { id: 4, code: "CH" },
    { id: 5, code: "CY" },
    { id: 6, code: "CZ" },
    { id: 7, code: "DE" },
    { id: 8, code: "DK" },
    { id: 9, code: "EE" },
    { id: 10, code: "ES" },
    { id: 11, code: "FI" },
    { id: 12, code: "FR" },
    { id: 13, code: "GB" },
    { id: 14, code: "GR" },
    { id: 15, code: "HU" },
    { id: 16, code: "IE" },
    { id: 17, code: "IT" },
    { id: 18, code: "LI" },
    { id: 19, code: "LT" },
    { id: 20, code: "LU" },
    { id: 21, code: "LV" },
    { id: 22, code: "MT" },
    { id: 23, code: "NL" },
    { id: 24, code: "NO" },
    { id: 25, code: "PL" },
    { id: 26, code: "PT" },
    { id: 27, code: "RO" },
    { id: 28, code: "SE" },
    { id: 29, code: "SG" },
    { id: 30, code: "SI" },
    { id: 31, code: "SK" },
    { id: 33, code: "CA" },
    { id: 35, code: "HR" },
    { id: 36, code: "JP" },
    { id: 37, code: "IS" },
];

/** What the reader chose the links to do */
export type CardmarketSettings = {
    /** Which country page to open */
    region: CardmarketRegion;
    /** Whether offers are narrowed to the printing's own language */
    matchLanguage: boolean;
    /** Whether offers are narrowed to the stack's finish */
    matchFinish: boolean;
    /** The worst grade worth showing, `null` for any */
    minCondition: CardCondition | null;
    /** Cardmarket's id of the seller country, `null` for anywhere */
    sellerCountry: number | null;
};

/** What every browser starts with: the German page, filtered to the card in hand */
export const DEFAULT_SETTINGS: CardmarketSettings = {
    region: "de",
    matchLanguage: true,
    matchFinish: true,
    minCondition: null,
    sellerCountry: null,
};

/** The `localStorage` key */
const STORAGE_KEY = "cardlens.cardmarket.v1";

/**
 * Reads the stored settings, falling back to {@link DEFAULT_SETTINGS} per field
 *
 * @returns the settings
 */
function load(): CardmarketSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_SETTINGS;
        const stored = JSON.parse(raw) as Partial<CardmarketSettings>;
        return {
            region: CARDMARKET_REGIONS.includes(stored.region as CardmarketRegion)
                ? (stored.region as CardmarketRegion)
                : DEFAULT_SETTINGS.region,
            matchLanguage: stored.matchLanguage ?? DEFAULT_SETTINGS.matchLanguage,
            matchFinish: stored.matchFinish ?? DEFAULT_SETTINGS.matchFinish,
            minCondition:
                stored.minCondition != null && stored.minCondition in CONDITION_IDS ? stored.minCondition : null,
            sellerCountry: typeof stored.sellerCountry === "number" ? stored.sellerCountry : null,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

/** The settings in memory, so a list of sixty rows parses nothing */
let settings: CardmarketSettings = load();
const listeners = new Set<() => void>();

/**
 * The current settings
 *
 * @returns the settings
 */
export function cardmarketSettings(): CardmarketSettings {
    return settings;
}

/**
 * Stores changed settings and tells every open link about them
 *
 * @param next the settings to keep
 */
export function saveCardmarketSettings(next: CardmarketSettings) {
    settings = next;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // storage unavailable (private mode), so the choice lasts this session
    }
    for (const listener of listeners) listener();
}

/**
 * Subscribe to changed settings
 *
 * @param listener called on every change
 *
 * @returns the unsubscribe function
 */
export function subscribeCardmarketSettings(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** What a link needs to know about the card it points at */
export type CardmarketCard = {
    /** The printed name, what a search falls back to */
    name: string;
    /** Cardmarket's product id, absent when Cardmarket does not stock the printing */
    cardmarket_id?: number | null;
    /** The printing's language, as Scryfall's code */
    lang: string;
};

/**
 * Builds the link to a card's Cardmarket page.
 *
 * Points at the product when the catalog knows its id, and at a search for the
 * card's name when it does not: Cardmarket does not stock tokens and digital
 * printings as products, and a search still lands the reader in the right
 * place. The filters are only added to a product page: on a search they would
 * narrow nothing and only make the url look like it promises something.
 *
 * @param card the printing to link to
 * @param finish the finish of the stack in hand, `null` when no stack is meant
 * @param chosen the settings to build with, the stored ones by default
 *
 * @returns the url
 */
export function cardmarketUrl(
    card: CardmarketCard,
    finish: CardFinish | null = null,
    chosen: CardmarketSettings = settings,
): string {
    const base = `https://www.cardmarket.com/${chosen.region}/Magic/Products`;

    if (card.cardmarket_id == null) {
        const url = new URL(`${base}/Search`);
        url.searchParams.set("searchString", card.name);
        return url.toString();
    }

    const url = new URL(base);
    url.searchParams.set("idProduct", String(card.cardmarket_id));

    const language = LANGUAGE_IDS[card.lang];
    if (chosen.matchLanguage && language !== undefined) {
        url.searchParams.set("language", String(language));
    }
    if (chosen.matchFinish && finish !== null) {
        // Etched is a foil the same way traditional foil is. Cardmarket knows
        // the one flag, and an etched card is on the foil side of it.
        url.searchParams.set("isFoil", finish === "Nonfoil" ? "N" : "Y");
    }
    if (chosen.minCondition !== null) {
        url.searchParams.set("minCondition", String(CONDITION_IDS[chosen.minCondition]));
    }
    if (chosen.sellerCountry !== null) {
        url.searchParams.set("sellerCountry", String(chosen.sellerCountry));
    }

    return url.toString();
}
