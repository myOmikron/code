/**
 * The list a proxy run is picked into.
 *
 * Both proxy tools work the same way up to the point where the cards leave:
 * search a card or take a deck, count the copies up and down, and end up with a
 * list of prints. Only what happens then differs — nine to a sheet of A4, or a
 * text list handed to MPCFill — so the picking is held here and the pages keep
 * nothing but their own output.
 */

import { notify } from "components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckOverviewResponse } from "src/api/generated";
import { useAccount } from "src/context/account";
import { addCard, addDeck, changeCopies, copiesOf, dropCard, dropDeck, onlyProxyCards } from "src/utils/proxy-list";
import type { ProxyGroup } from "src/utils/proxy-list";
import { deckProxyCards, isBasicLand, printableImage } from "src/utils/proxy-print";
import type { ProxyCard } from "src/utils/proxy-print";
import type { Printing } from "src/utils/scryfall";

/** How a page opens the list */
export type ProxyPickOptions = {
    /** The deck to start with, as a deck page links it over */
    deck?: string;
    /** Whether that deck is taken with only its proxy-marked slots */
    proxies?: boolean;
    /** Whether a card the catalog has no picture of is dropped, which printing needs */
    needsImage: boolean;
};

/** What {@link useProxyPicks} hands back */
export type ProxyPicks = {
    /** What is on the list, deck by deck, as the proxy filter leaves it */
    groups: Array<ProxyGroup>;
    /** The same, as one list */
    picked: Array<ProxyCard>;
    /** The decks the account may take from, empty without one */
    decks: Array<DeckOverviewResponse>;
    /** The deck the combobox stands on, `null` while none is chosen */
    deck: DeckOverviewResponse | null;
    /** Chooses a deck, without taking it yet */
    setDeck: (deck: DeckOverviewResponse | null) => void;
    /** Whether the list is filtered down to its proxies */
    onlyProxies: boolean;
    /** Switches that over */
    setOnlyProxies: (only: boolean) => void;
    /** Whether a deck is being read right now */
    loading: boolean;
    /** How many copies of a card are on the list */
    countOf: (key: string) => number;
    /** Puts one more copy of a searched card on the list */
    add: (printing: Printing) => void;
    /** Puts one more copy of a card already on the list on it */
    more: (key: string) => void;
    /** Takes one copy back off, and the row with the last of them */
    fewer: (key: string) => void;
    /** Takes a card off the list altogether */
    drop: (key: string) => void;
    /** Takes a group and its cards off the list, `null` for the hand picks */
    dropDeck: (uuid: string | null) => void;
    /** Empties the list */
    clear: () => void;
    /** Adds a deck to the list, or tops up one already on it */
    loadDeck: (chosen: DeckOverviewResponse | null) => Promise<void>;
};

/**
 * The cards a proxy run is made of, and everything that puts them there.
 *
 * @param options what the page was opened on
 * @param options.deck the deck to start with, nothing when the page was opened on none
 * @param options.proxies whether that deck is taken with only its proxy-marked slots
 * @param options.needsImage whether a card the catalog has no picture of is dropped
 *
 * @returns the list and its mutators
 */
export function useProxyPicks({ deck: opened, proxies, needsImage }: ProxyPickOptions): ProxyPicks {
    const [t] = useTranslation("game-utils");

    // A deck handed over in the url is taken once. Without the mark, going back
    // to the tab would file the deck a second time.
    const taken = useRef<string | null>(null);
    // The latest read of each deck; a read that was overtaken or whose deck was
    // taken off in the meantime is thrown away.
    const reads = useRef(new Map<string, symbol>());

    const [groups, setGroups] = useState<Array<ProxyGroup>>([]);
    const [decks, setDecks] = useState<Array<DeckOverviewResponse>>([]);
    const [deck, setDeck] = useState<DeckOverviewResponse | null>(null);
    const [onlyProxies, setOnlyProxies] = useState(proxies === true);
    const [reading, setReading] = useState(0);
    const { account } = useAccount();

    /**
     * Adds a deck to the list, or tops up one already on it
     *
     * @param chosen the deck to take, nothing when none is picked
     */
    async function loadDeck(chosen: DeckOverviewResponse | null) {
        if (chosen === null) return;

        const { uuid, name } = chosen.deck;
        const read = Symbol(uuid);
        reads.current.set(uuid, read);
        setReading((count) => count + 1);
        try {
            const { cards } = await Api.decks.cards.list(uuid);
            if (reads.current.get(uuid) !== read) return;
            reads.current.delete(uuid);

            const added = deckProxyCards(cards).filter((card) => !needsImage || card.front !== null);
            if (added.length === 0) notify.info(t("toast.deck-nothing-to-add", { name }));

            setGroups((previous) => addDeck(previous, { uuid, name }, added));
            setDeck((current) => (current?.deck.uuid === uuid ? null : current));
        } finally {
            setReading((count) => count - 1);
        }
    }

    // Only what the account may see: the tools themselves work without one, on
    // whatever the search turns up.
    useEffect(() => {
        if (account === null) {
            setDecks([]);
            setDeck(null);
            return;
        }
        void Api.decks.list().then(setDecks);
    }, [account]);

    // Opened from a deck: its cards are on the list before the page is looked
    // at, which is the whole point of getting here that way.
    useEffect(() => {
        if (opened === undefined || taken.current === opened) return;

        const listed = decks.find((overview) => overview.deck.uuid === opened);
        if (listed === undefined) return;

        taken.current = opened;
        setOnlyProxies(proxies === true);
        void loadDeck(listed);
        // Deliberately not keyed on `loadDeck`, which is rebuilt on every render.
    }, [decks, opened, proxies]);

    /**
     * Puts one more copy of a searched card on the list
     *
     * @param printing the card that was picked
     */
    function add(printing: Printing) {
        setGroups((previous) =>
            addCard(previous, {
                key: printing.id,
                name: printing.name,
                set: printing.setCode,
                number: printing.collectorNumber,
                front: printableImage(printing.largeImageUrl),
                back: printableImage(printing.backLargeImageUrl),
                copies: 1,
                basic: isBasicLand(printing.typeLine),
                proxy: true,
            }),
        );
    }

    const shown = onlyProxies ? onlyProxyCards(groups) : groups;

    return {
        groups: shown,
        picked: shown.flatMap((group) => group.cards),
        decks,
        deck,
        setDeck,
        onlyProxies,
        setOnlyProxies,
        loading: reading > 0,
        countOf: (key) => copiesOf(shown, key),
        add,
        more: (key) => setGroups((previous) => changeCopies(previous, key, 1)),
        fewer: (key) => setGroups((previous) => changeCopies(previous, key, -1)),
        drop: (key) => setGroups((previous) => dropCard(previous, key)),
        dropDeck: (uuid) => {
            if (uuid !== null) reads.current.delete(uuid);
            setGroups((previous) => dropDeck(previous, uuid));
        },
        clear: () => {
            reads.current.clear();
            setGroups([]);
        },
        loadDeck,
    };
}
