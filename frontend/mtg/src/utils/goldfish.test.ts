import { describe, expect, it } from "vitest";
import type { DeckCardResponse, DeckZone } from "src/api/generated";
import type { Printing } from "src/utils/scryfall";
import {
    attachCard,
    attachmentsOf,
    changeCounter,
    detachCard,
    copyCard,
    groupTokens,
    tokenCaption,
    createToken,
    draw,
    inZone,
    isLand,
    moveCard,
    mulligan,
    newGame,
    nextTurn,
    shuffleLibrary,
    toggleTapped,
    zoneCounts,
} from "src/utils/goldfish";

/**
 * A deck slot with only what the table reads
 *
 * @param name the card
 * @param quantity how many copies
 * @param zone where the deck keeps it
 * @param typeLine what it is
 *
 * @returns the slot
 */
function slot(name: string, quantity: number, zone: DeckZone = "Main", typeLine = "Creature"): DeckCardResponse {
    return {
        uuid: name,
        printing: `print-${name}`,
        quantity,
        zone,
        foil: false,
        proxy: false,
        tags: [],
        card: {
            name,
            type_line: typeLine,
            mana_cost: "",
            image_normal: `${name}.jpg`,
            collector_number: "1",
            color_identity: "",
            extra_turns: false,
            finishes: [],
            game_changer: false,
            lang: "en",
            legal_formats: [],
            mana_value: 0,
            mass_land_denial: false,
            produced_mana: [],
            rarity: "Common",
            reserved: false,
            set_code: "tst",
            set_name: "Test",
        },
    };
}

/** A deck of ten distinct cards with a commander and a sideboard */
const DECK = [
    ...Array.from({ length: 10 }, (_, index) => slot(`card-${index}`, 1)),
    slot("commander", 1, "Commander"),
    slot("side", 2, "Side"),
];

/**
 * Never shuffles, so the library keeps the deck order
 *
 * @returns zero
 */
function still(): number {
    return 0;
}

describe("newGame", () => {
    it("draws seven from the main deck and seats the commander", () => {
        const game = newGame(DECK, new Map(), 40);
        const counts = zoneCounts(game);
        expect(counts.hand).toBe(7);
        expect(counts.library).toBe(3);
        expect(counts.command).toBe(1);
        expect(game.cards.length).toBe(11);
        expect(game.life).toBe(40);
    });

    it("deals every copy of a slot", () => {
        const game = newGame([slot("forest", 4)], new Map(), 20);
        expect(game.cards.filter((card) => card.name === "forest").length).toBe(4);
    });
});

describe("draw", () => {
    it("takes from the top and stops at an empty library", () => {
        const game = newGame(DECK, new Map(), 20, still);
        const after = draw(game, 5);
        expect(zoneCounts(after).hand).toBe(10);
        expect(zoneCounts(after).library).toBe(0);
    });
});

describe("moveCard", () => {
    it("cleans a permanent as it leaves the battlefield", () => {
        let game = newGame(DECK, new Map(), 20, still);
        const card = inZone(game, "hand")[0]!;
        game = moveCard(game, card.id, "battlefield");
        game = toggleTapped(game, card.id);
        game = changeCounter(game, card.id, "+1/+1", 2);
        game = moveCard(game, card.id, "graveyard");
        const moved = game.cards.find((entry) => entry.id === card.id)!;
        expect(moved.zone).toBe("graveyard");
        expect(moved.tapped).toBe(false);
        expect(moved.counters).toEqual({});
    });

    it("puts a card on top or on the bottom of the library", () => {
        let game = newGame(DECK, new Map(), 20, still);
        const [first, second] = inZone(game, "hand");
        game = moveCard(game, first!.id, "library", "top");
        game = moveCard(game, second!.id, "library", "bottom");
        const deck = inZone(game, "library");
        expect(deck[0]!.id).toBe(first!.id);
        expect(deck[deck.length - 1]!.id).toBe(second!.id);
    });

    it("keeps a card's place in the library when nothing else is there", () => {
        let game = newGame(DECK, new Map(), 20, still);
        game = draw(game, 3);
        const card = inZone(game, "hand")[0]!;
        game = moveCard(game, card.id, "library", "bottom");
        expect(inZone(game, "library").map((entry) => entry.id)).toEqual([card.id]);
    });

    it("lets a token cease to exist off the battlefield", () => {
        let game = newGame(DECK, new Map(), 20, still);
        game = createToken(game, {
            printing: "tok",
            name: "Treasure",
            typeLine: "Token",
            image: null,
            backImage: null,
        });
        const token = game.cards.find((card) => card.token)!;
        game = moveCard(game, token.id, "graveyard");
        expect(game.cards.some((card) => card.token)).toBe(false);
    });
});

describe("counters", () => {
    it("drops a counter kind at zero and ignores empty names", () => {
        let game = newGame(DECK, new Map(), 20, still);
        const card = inZone(game, "hand")[0]!;
        game = changeCounter(game, card.id, "charge", 1);
        game = changeCounter(game, card.id, "   ", 1);
        expect(game.cards.find((entry) => entry.id === card.id)!.counters).toEqual({ charge: 1 });
        game = changeCounter(game, card.id, "charge", -3);
        expect(game.cards.find((entry) => entry.id === card.id)!.counters).toEqual({});
    });
});

describe("turns", () => {
    it("untaps everything and draws one", () => {
        let game = newGame(DECK, new Map(), 20, still);
        const card = inZone(game, "hand")[0]!;
        game = moveCard(game, card.id, "battlefield");
        game = toggleTapped(game, card.id);
        game = nextTurn(game);
        expect(game.turn).toBe(2);
        expect(game.cards.find((entry) => entry.id === card.id)!.tapped).toBe(false);
        expect(zoneCounts(game).hand).toBe(7);
    });

    it("mulligans back to seven and counts it", () => {
        let game = newGame(DECK, new Map(), 20, still);
        game = draw(game, 2);
        game = mulligan(game, still);
        expect(game.mulligans).toBe(1);
        expect(zoneCounts(game).hand).toBe(7);
        expect(zoneCounts(game).library).toBe(3);
    });

    it("shuffles only the library", () => {
        const game = newGame(DECK, new Map(), 20, still);
        const shuffledGame = shuffleLibrary(game, () => 0.99);
        expect(inZone(shuffledGame, "hand").map((card) => card.id)).toEqual(
            inZone(game, "hand").map((card) => card.id),
        );
        expect(inZone(shuffledGame, "library").length).toBe(3);
    });
});

describe("tokens", () => {
    it("copies a permanent as a token", () => {
        let game = newGame(DECK, new Map(), 20, still);
        const card = inZone(game, "hand")[0]!;
        game = moveCard(game, card.id, "battlefield");
        game = copyCard(game, card.id);
        const copies = game.cards.filter((entry) => entry.name === card.name);
        expect(copies.length).toBe(2);
        expect(copies.filter((entry) => entry.token).length).toBe(1);
    });

    it("copies a permanent without what was attached to it", () => {
        let game = newGame(DECK, new Map(), 20, still);
        const [host, aura] = inZone(game, "hand");
        game = moveCard(game, host!.id, "battlefield");
        game = moveCard(game, aura!.id, "battlefield");
        game = attachCard(game, aura!.id, host!.id);
        game = copyCard(game, host!.id);
        const copy = game.cards.find((card) => card.token)!;
        expect(attachmentsOf(game, copy.id)).toEqual([]);
    });

    it("hands every token its own id", () => {
        let game = newGame(DECK, new Map(), 20, still);
        game = createToken(
            game,
            { printing: "tok", name: "Soldier", typeLine: "Token", image: null, backImage: null },
            3,
        );
        const ids = new Set(game.cards.map((card) => card.id));
        expect(ids.size).toBe(game.cards.length);
    });
});

describe("attachments", () => {
    /**
     * A deck with a creature, an Aura and an Equipment on top
     *
     * @returns the game, all three in hand
     */
    function table() {
        const deck = [
            slot("bear", 1, "Main", "Creature — Bear"),
            slot("pacifism", 1, "Main", "Enchantment — Aura"),
            slot("sword", 1, "Main", "Artifact — Equipment"),
            ...Array.from({ length: 5 }, (_, index) => slot(`filler-${index}`, 1)),
        ];
        let game = newGame(deck, new Map(), 20, still);
        for (const name of ["bear", "pacifism", "sword"]) {
            const card = game.cards.find((entry) => entry.name === name)!;
            game = moveCard(game, card.id, "battlefield");
        }
        return game;
    }

    /**
     * The card of a name
     *
     * @param game the game
     * @param name the name
     *
     * @returns the card, or `undefined` once it is gone
     */
    function named(game: ReturnType<typeof table>, name: string) {
        return game.cards.find((entry) => entry.name === name);
    }

    it("attaches and detaches on the battlefield only", () => {
        let game = table();
        game = attachCard(game, named(game, "sword")!.id, named(game, "bear")!.id);
        expect(named(game, "sword")!.attachedTo).toBe(named(game, "bear")!.id);
        expect(attachmentsOf(game, named(game, "bear")!.id).map((card) => card.name)).toEqual(["sword"]);
        game = detachCard(game, named(game, "sword")!.id);
        expect(named(game, "sword")!.attachedTo).toBeNull();
        const inHand = inZone(game, "hand")[0]!;
        game = attachCard(game, inHand.id, named(game, "bear")!.id);
        expect(game.cards.find((entry) => entry.id === inHand.id)!.attachedTo).toBeNull();
    });

    it("keeps stacks one level deep", () => {
        let game = table();
        game = attachCard(game, named(game, "sword")!.id, named(game, "bear")!.id);
        game = attachCard(game, named(game, "pacifism")!.id, named(game, "sword")!.id);
        expect(named(game, "pacifism")!.attachedTo).toBe(named(game, "bear")!.id);
    });

    it("buries the Aura and frees the Equipment when the host dies", () => {
        let game = table();
        const bear = named(game, "bear")!.id;
        game = attachCard(game, named(game, "sword")!.id, bear);
        game = attachCard(game, named(game, "pacifism")!.id, bear);
        game = moveCard(game, bear, "graveyard");
        expect(named(game, "pacifism")!.zone).toBe("graveyard");
        expect(named(game, "sword")!.zone).toBe("battlefield");
        expect(named(game, "sword")!.attachedTo).toBeNull();
    });

    it("lets an attachment leave on its own", () => {
        let game = table();
        game = attachCard(game, named(game, "sword")!.id, named(game, "bear")!.id);
        game = moveCard(game, named(game, "sword")!.id, "hand");
        expect(named(game, "sword")!.attachedTo).toBeNull();
        expect(named(game, "bear")!.zone).toBe("battlefield");
    });
});

describe("isLand", () => {
    it("reads only the front face", () => {
        const base = {
            id: "x",
            printing: null,
            name: "",
            manaCost: "",
            image: null,
            backImage: null,
            token: false,
            finish: "Nonfoil" as const,
            attachedTo: null,
        };
        const rest = { zone: "battlefield" as const, tapped: false, flipped: false, counters: {} };
        expect(isLand({ ...base, ...rest, typeLine: "Basic Land — Forest" })).toBe(true);
        expect(isLand({ ...base, ...rest, typeLine: "Creature — Elf // Land" })).toBe(false);
        expect(isLand({ ...base, ...rest, typeLine: "Legendary Creature — Landfall" })).toBe(false);
    });
});

/**
 * A token printing with only what grouping reads
 *
 * @param id the printing
 * @param oracleId the token it is a printing of
 * @param name what it is called
 *
 * @returns the printing
 */
function token(id: string, oracleId: string, name: string): Printing {
    return {
        id,
        oracleId,
        name,
        setName: "",
        setCode: "",
        collectorNumber: "",
        imageUrl: null,
        largeImageUrl: null,
        backImageUrl: null,
        backLargeImageUrl: null,
        manaCost: "",
        typeLine: `Token Creature — ${name}`,
        oracleText: "",
        power: null,
        toughness: null,
        rarity: "common",
        scryfallUrl: "",
        colorIdentity: [],
        manaValue: 0,
        releasedAt: "",
        artist: "",
        legalities: {},
        keywords: [],
        reserved: false,
        faces: [],
        priceEur: null,
        priceEurFoil: null,
        finishes: ["nonfoil"],
    };
}

describe("groupTokens", () => {
    it("lists different tokens sharing a name separately", () => {
        const red = token("print-red", "oracle-red", "Elemental");
        const green = token("print-green", "oracle-green", "Elemental");

        const grouped = groupTokens([
            { source: "Young Pyromancer", token: red },
            { source: "Avenger of Zendikar", token: green },
        ]);

        expect(grouped).toEqual([
            { token: red, sources: ["Young Pyromancer"] },
            { token: green, sources: ["Avenger of Zendikar"] },
        ]);
    });

    it("lists one token printed in two sets once, with both makers", () => {
        const older = token("print-m19", "oracle-treasure", "Treasure");
        const newer = token("print-ltr", "oracle-treasure", "Treasure");

        const grouped = groupTokens([
            { source: "Dockside Extortionist", token: older },
            { source: "Smothering Tithe", token: newer },
        ]);

        expect(grouped).toEqual([{ token: older, sources: ["Dockside Extortionist", "Smothering Tithe"] }]);
    });

    it("names a card the deck holds several times once", () => {
        const treasure = token("print-treasure", "oracle-treasure", "Treasure");

        const grouped = groupTokens([
            { source: "Treasure Map // Treasure Cove", token: treasure },
            { source: "Treasure Map // Treasure Cove", token: treasure },
        ]);

        expect(grouped).toEqual([{ token: treasure, sources: ["Treasure Map // Treasure Cove"] }]);
    });

    it("keeps tokens apart whose oracle id is not known yet", () => {
        const goblin = token("print-goblin", "", "Goblin");
        const soldier = token("print-soldier", "", "Soldier");

        const grouped = groupTokens([
            { source: "Krenko, Mob Boss", token: goblin },
            { source: "Raise the Alarm", token: soldier },
        ]);

        expect(grouped).toEqual([
            { token: goblin, sources: ["Krenko, Mob Boss"] },
            { token: soldier, sources: ["Raise the Alarm"] },
        ]);
    });
});

describe("tokenCaption", () => {
    it("adds power and toughness to a creature token", () => {
        const elemental = { ...token("print-elemental", "oracle-elemental", "Elemental"), power: "4", toughness: "4" };

        expect(tokenCaption(elemental)).toBe("Elemental 4/4");
    });

    it("keeps the name of a token without power and toughness", () => {
        expect(tokenCaption(token("print-treasure", "oracle-treasure", "Treasure"))).toBe("Treasure");
    });
});
