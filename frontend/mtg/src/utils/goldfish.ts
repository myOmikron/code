/**
 * Playing a deck against nobody: the zones, the cards in them and every move
 * the table allows, as plain data.
 *
 * Nothing here knows about the screen. The page keeps one {@link GoldfishGame}
 * in state and every action is a function from one game to the next, so the
 * rules can be tested without rendering a card.
 */

import type { CardFinish, DeckCardResponse } from "src/api/generated";
import { finishOf } from "src/utils/deck-foil";
import type { Printing } from "src/utils/scryfall";

/** Where a card can be during a test game */
export type GoldfishZone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command";

/** The zones a card can be sent to from a menu, in the order they are offered */
export const ZONES: Array<GoldfishZone> = ["battlefield", "hand", "graveyard", "exile", "library", "command"];

/** How many cards an opening hand holds */
export const HAND_SIZE = 7;

/** Where a card lands when it goes back into the library */
export type LibraryEnd = "top" | "bottom";

/** The counters a menu offers without asking for a name */
export const COUNTER_KINDS = ["+1/+1", "-1/-1", "loyalty", "charge"] as const;

/** One physical card on the table */
export type GoldfishCard = {
    /** Tells this copy from every other, tokens included */
    id: string;
    /** Scryfall's printing id, `null` for a token that came from nowhere */
    printing: string | null;
    /** What the card is called */
    name: string;
    /** The type line, which decides where on the battlefield it goes */
    typeLine: string;
    /** The mana cost, empty for lands and tokens */
    manaCost: string;
    /** The front, `null` when no scan is known */
    image: string | null;
    /** The back of a two-faced card, `null` for the rest */
    backImage: string | null;
    /** Whether this is a token rather than a card of the deck */
    token: boolean;
    /** The finish, which puts the sheen on a foil */
    finish: CardFinish;
    /** Where it is */
    zone: GoldfishZone;
    /** Whether it is turned sideways */
    tapped: boolean;
    /** Whether it shows its back */
    flipped: boolean;
    /** What lies on it, by counter name, never zero */
    counters: Record<string, number>;
};

/** One test game */
export type GoldfishGame = {
    /** Every card, library on top first: the array order is the library order */
    cards: Array<GoldfishCard>;
    /** The player's life */
    life: number;
    /** Which turn it is, starting at one */
    turn: number;
    /** How many times the opening hand was sent back */
    mulligans: number;
    /** What the game started with, to start over the same way */
    startingLife: number;
    /** Counts up for token ids */
    nextId: number;
};

/** What a token is made from */
export type TokenSource = {
    /** Scryfall's printing id */
    printing: string;
    /** The token's name */
    name: string;
    /** Its type line */
    typeLine: string;
    /** Its artwork, `null` when Scryfall has none */
    image: string | null;
    /** Its back, for the rare double-faced token */
    backImage: string | null;
};

/**
 * Shuffles in place with `Math.random`, which is all a test game needs
 *
 * @param cards the cards to shuffle
 * @param random the source of randomness, replaceable for tests
 *
 * @returns the same array
 */
function shuffled<T>(cards: Array<T>, random: () => number = Math.random): Array<T> {
    for (let index = cards.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [cards[index], cards[other]] = [cards[other] as T, cards[index] as T];
    }
    return cards;
}

/**
 * Turns a deck slot into as many table cards as it has copies
 *
 * @param slot the slot as the deck lists it
 * @param printing what Scryfall knows where the catalog knows nothing
 * @param zone where the copies start out
 * @param nextId hands out ids
 *
 * @returns the copies
 */
function copiesOf(
    slot: DeckCardResponse,
    printing: Printing | undefined,
    zone: GoldfishZone,
    nextId: () => string,
): Array<GoldfishCard> {
    const catalog = slot.card ?? null;
    const copies: Array<GoldfishCard> = [];
    for (let copy = 0; copy < slot.quantity; copy++) {
        copies.push({
            id: nextId(),
            printing: slot.printing,
            name: catalog?.name ?? printing?.name ?? slot.printing,
            typeLine: catalog?.type_line ?? printing?.typeLine ?? "",
            manaCost: catalog?.mana_cost ?? printing?.manaCost ?? "",
            image:
                catalog?.image_normal ?? catalog?.image_small ?? printing?.largeImageUrl ?? printing?.imageUrl ?? null,
            backImage:
                catalog?.image_back_normal ??
                catalog?.image_back_small ??
                printing?.backLargeImageUrl ??
                printing?.backImageUrl ??
                null,
            token: false,
            finish: finishOf(slot),
            zone,
            tapped: false,
            flipped: false,
            counters: {},
        });
    }
    return copies;
}

/**
 * Deals a fresh game: the main deck shuffled into the library, the commander
 * and companion in the command zone, seven cards in hand
 *
 * @param slots the deck's cards
 * @param printings what Scryfall knows about slots the catalog does not
 * @param startingLife what the player begins at
 * @param random the source of randomness, replaceable for tests
 *
 * @returns the game
 */
export function newGame(
    slots: Array<DeckCardResponse>,
    printings: Map<string, Printing>,
    startingLife: number,
    random: () => number = Math.random,
): GoldfishGame {
    let counter = 0;
    const nextId = () => `c${++counter}`;

    const library: Array<GoldfishCard> = [];
    const command: Array<GoldfishCard> = [];
    for (const slot of slots) {
        const printing = printings.get(slot.printing);
        if (slot.zone === "Main") library.push(...copiesOf(slot, printing, "library", nextId));
        if (slot.zone === "Commander" || slot.zone === "Companion")
            command.push(...copiesOf(slot, printing, "command", nextId));
    }
    shuffled(library, random);

    const game: GoldfishGame = {
        cards: [...library, ...command],
        life: startingLife,
        turn: 1,
        mulligans: 0,
        startingLife,
        nextId: counter + 1,
    };
    return draw(game, HAND_SIZE);
}

/**
 * The library, top first
 *
 * @param game the game
 *
 * @returns the cards
 */
export function library(game: GoldfishGame): Array<GoldfishCard> {
    return game.cards.filter((card) => card.zone === "library");
}

/**
 * The cards in one zone, in table order
 *
 * @param game the game
 * @param zone the zone
 *
 * @returns the cards
 */
export function inZone(game: GoldfishGame, zone: GoldfishZone): Array<GoldfishCard> {
    return game.cards.filter((card) => card.zone === zone);
}

/**
 * How many cards each zone holds
 *
 * @param game the game
 *
 * @returns the counts
 */
export function zoneCounts(game: GoldfishGame): Record<GoldfishZone, number> {
    const counts: Record<GoldfishZone, number> = {
        library: 0,
        hand: 0,
        battlefield: 0,
        graveyard: 0,
        exile: 0,
        command: 0,
    };
    for (const card of game.cards) counts[card.zone]++;
    return counts;
}

/**
 * Moves the top cards of the library into the hand
 *
 * @param game the game
 * @param count how many
 *
 * @returns the game after
 */
export function draw(game: GoldfishGame, count: number): GoldfishGame {
    let left = count;
    const cards = game.cards.map((card) => {
        if (left > 0 && card.zone === "library") {
            left--;
            return { ...card, zone: "hand" as const };
        }
        return card;
    });
    return { ...game, cards };
}

/**
 * Shuffles the library, leaving every other zone where it is
 *
 * @param game the game
 * @param random the source of randomness, replaceable for tests
 *
 * @returns the game after
 */
export function shuffleLibrary(game: GoldfishGame, random: () => number = Math.random): GoldfishGame {
    const deck = shuffled(library(game), random);
    let next = 0;
    const cards = game.cards.map((card) => (card.zone === "library" ? (deck[next++] as GoldfishCard) : card));
    return { ...game, cards };
}

/**
 * Sends the hand back, shuffles and draws seven again.
 *
 * The London rule's "put one on the bottom per mulligan" is left to the
 * player: any card in hand can be sent to the bottom from its menu.
 *
 * @param game the game
 * @param random the source of randomness, replaceable for tests
 *
 * @returns the game after
 */
export function mulligan(game: GoldfishGame, random: () => number = Math.random): GoldfishGame {
    const returned: GoldfishGame = {
        ...game,
        mulligans: game.mulligans + 1,
        cards: game.cards.map((card) => (card.zone === "hand" ? { ...card, zone: "library" as const } : card)),
    };
    return draw(shuffleLibrary(returned, random), HAND_SIZE);
}

/**
 * Whether a card stays on the table when it changes zone.
 *
 * A token leaving the battlefield ceases to exist.
 *
 * @param card the card
 * @param zone where it goes
 *
 * @returns whether it is still there afterwards
 */
function survives(card: GoldfishCard, zone: GoldfishZone): boolean {
    return !card.token || zone === "battlefield";
}

/**
 * A card as it arrives in a zone: untapped, face up and bare
 *
 * @param card the card
 * @param zone where it goes
 *
 * @returns the card there
 */
function arriving(card: GoldfishCard, zone: GoldfishZone): GoldfishCard {
    return { ...card, zone, tapped: false, flipped: false, counters: {} };
}

/**
 * Puts a card somewhere else.
 *
 * Going to the library asks for an end. Going anywhere else appends the card
 * to that zone. A card is untapped and cleaned of its counters as it leaves
 * the battlefield, because that is what happens to it.
 *
 * @param game the game
 * @param id the card
 * @param zone where to
 * @param end which end of the library, for that zone
 *
 * @returns the game after
 */
export function moveCard(game: GoldfishGame, id: string, zone: GoldfishZone, end: LibraryEnd = "top"): GoldfishGame {
    const card = game.cards.find((entry) => entry.id === id);
    if (card === undefined) return game;
    const rest = game.cards.filter((entry) => entry.id !== id);
    if (!survives(card, zone)) return { ...game, cards: rest };

    const moved = card.zone === zone ? { ...card } : arriving(card, zone);
    if (zone === "library") {
        if (end === "top") {
            const first = rest.findIndex((entry) => entry.zone === "library");
            const at = first === -1 ? 0 : first;
            return { ...game, cards: [...rest.slice(0, at), moved, ...rest.slice(at)] };
        }
        let last = -1;
        rest.forEach((entry, index) => {
            if (entry.zone === "library") last = index;
        });
        return { ...game, cards: [...rest.slice(0, last + 1), moved, ...rest.slice(last + 1)] };
    }
    return { ...game, cards: [...rest, moved] };
}

/**
 * Turns a card sideways, or back
 *
 * @param game the game
 * @param id the card
 *
 * @returns the game after
 */
export function toggleTapped(game: GoldfishGame, id: string): GoldfishGame {
    return {
        ...game,
        cards: game.cards.map((card) => (card.id === id ? { ...card, tapped: !card.tapped } : card)),
    };
}

/**
 * Turns a two-faced card over
 *
 * @param game the game
 * @param id the card
 *
 * @returns the game after
 */
export function toggleFlipped(game: GoldfishGame, id: string): GoldfishGame {
    return {
        ...game,
        cards: game.cards.map((card) =>
            card.id === id && card.backImage !== null ? { ...card, flipped: !card.flipped } : card,
        ),
    };
}

/**
 * Stands every permanent back up
 *
 * @param game the game
 *
 * @returns the game after
 */
export function untapAll(game: GoldfishGame): GoldfishGame {
    return {
        ...game,
        cards: game.cards.map((card) => (card.tapped ? { ...card, tapped: false } : card)),
    };
}

/**
 * Untaps, draws and turns the page
 *
 * @param game the game
 *
 * @returns the game after
 */
export function nextTurn(game: GoldfishGame): GoldfishGame {
    return draw({ ...untapAll(game), turn: game.turn + 1 }, 1);
}

/**
 * Books a change to the life total
 *
 * @param game the game
 * @param amount what to add, negative to take
 *
 * @returns the game after
 */
export function changeLife(game: GoldfishGame, amount: number): GoldfishGame {
    return { ...game, life: game.life + amount };
}

/**
 * Adds to or takes from one kind of counter on a card, dropping it at zero
 *
 * @param game the game
 * @param id the card
 * @param kind which counter
 * @param amount what to add, negative to take
 *
 * @returns the game after
 */
export function changeCounter(game: GoldfishGame, id: string, kind: string, amount: number): GoldfishGame {
    const name = kind.trim();
    if (name === "") return game;
    return {
        ...game,
        cards: game.cards.map((card) => {
            if (card.id !== id) return card;
            const counters = { ...card.counters };
            const value = (counters[name] ?? 0) + amount;
            if (value <= 0) delete counters[name];
            else counters[name] = value;
            return { ...card, counters };
        }),
    };
}

/**
 * Puts a token onto the battlefield
 *
 * @param game the game
 * @param source what the token is
 * @param count how many
 *
 * @returns the game after
 */
export function createToken(game: GoldfishGame, source: TokenSource, count: number = 1): GoldfishGame {
    let nextId = game.nextId;
    const tokens: Array<GoldfishCard> = [];
    for (let made = 0; made < count; made++) {
        tokens.push({
            id: `t${nextId++}`,
            printing: source.printing,
            name: source.name,
            typeLine: source.typeLine,
            manaCost: "",
            image: source.image,
            backImage: source.backImage,
            token: true,
            finish: "Nonfoil",
            zone: "battlefield",
            tapped: false,
            flipped: false,
            counters: {},
        });
    }
    return { ...game, nextId, cards: [...game.cards, ...tokens] };
}

/**
 * Puts a token copy of a permanent next to it
 *
 * @param game the game
 * @param id the card to copy
 *
 * @returns the game after
 */
export function copyCard(game: GoldfishGame, id: string): GoldfishGame {
    const card = game.cards.find((entry) => entry.id === id);
    if (card === undefined) return game;
    return createToken(game, {
        printing: card.printing ?? "",
        name: card.name,
        typeLine: card.typeLine,
        image: card.image,
        backImage: card.backImage,
    });
}

/**
 * Whether a card on the battlefield belongs in the land row
 *
 * @param card the card
 *
 * @returns whether it is a land
 */
export function isLand(card: GoldfishCard): boolean {
    const front = card.typeLine.split(" // ")[0] ?? "";
    return /\bLand\b/.test(front);
}

/** What the page remembers between reloads */
type StoredGame = {
    version: 2;
    game: GoldfishGame;
};

/**
 * Where a deck's game is kept
 *
 * @param deck the deck
 *
 * @returns the storage key
 */
function storageKey(deck: string): string {
    return `mtg.goldfish.${deck}`;
}

/**
 * The game this deck was in the middle of, if any
 *
 * @param deck the deck
 *
 * @returns the game, or `null`
 */
export function loadGame(deck: string): GoldfishGame | null {
    try {
        const raw = window.localStorage.getItem(storageKey(deck));
        if (raw === null) return null;
        const stored = JSON.parse(raw) as Partial<StoredGame>;
        if (stored.version !== 2 || stored.game === undefined) return null;
        return stored.game;
    } catch {
        return null;
    }
}

/**
 * Keeps a game for the next visit, or forgets it
 *
 * @param deck the deck
 * @param game the game, `null` to forget
 */
export function saveGame(deck: string, game: GoldfishGame | null): void {
    try {
        if (game === null) window.localStorage.removeItem(storageKey(deck));
        else window.localStorage.setItem(storageKey(deck), JSON.stringify({ version: 2, game } satisfies StoredGame));
    } catch {
        return;
    }
}

/**
 * What a format starts its players at
 *
 * @param format the deck's format slug
 *
 * @returns the life total
 */
export function startingLifeFor(format: string): number {
    if (format === "commander" || format === "oathbreaker") return 40;
    if (format === "brawl") return 25;
    return 20;
}
