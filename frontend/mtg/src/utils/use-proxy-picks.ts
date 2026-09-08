/**
 * The list a proxy run is picked into.
 *
 * Both proxy tools work the same way up to the point where the cards leave:
 * search a card or take a deck, count the copies up and down, and end up with a
 * list of prints. Only what happens then differs — nine to a sheet of A4, or a
 * text list handed to MPCFill — so the picking is held here and the pages keep
 * nothing but their own output.
 */

import { useEffect, useRef, useState } from "react";
import { Api } from "src/api/api";
import type { DeckOverviewResponse } from "src/api/generated";
import { useAccount } from "src/context/account";
import { MAX_COPIES, deckProxyCards, isBasicLand, printableImage } from "src/utils/proxy-print";
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
    /** What is on the list */
    picked: Array<ProxyCard>;
    /** The decks the account may take from, empty without one */
    decks: Array<DeckOverviewResponse>;
    /** The deck the combobox stands on, `null` while none is chosen */
    deck: DeckOverviewResponse | null;
    /** Chooses a deck, without taking it yet */
    setDeck: (deck: DeckOverviewResponse | null) => void;
    /** Whether a deck is taken with only its proxy-marked slots */
    onlyProxies: boolean;
    /** Switches that over */
    setOnlyProxies: (only: boolean) => void;
    /** Whether a deck is being read right now */
    loading: boolean;
    /** Puts one more copy of a searched card on the list */
    add: (printing: Printing) => void;
    /** Puts one more copy of a card already on the list on it */
    more: (key: string) => void;
    /** Takes one copy back off, and the row with the last of them */
    fewer: (key: string) => void;
    /** Takes a card off the list altogether */
    drop: (key: string) => void;
    /** Empties the list */
    clear: () => void;
    /** Adds everything a deck plays to the list */
    loadDeck: (chosen: DeckOverviewResponse | null, proxiesOnly: boolean) => Promise<void>;
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
    // A deck handed over in the url is taken once. Without the mark, going back
    // to the tab would file the deck a second time.
    const taken = useRef<string | null>(null);

    const [picked, setPicked] = useState<Array<ProxyCard>>([]);
    const [decks, setDecks] = useState<Array<DeckOverviewResponse>>([]);
    const [deck, setDeck] = useState<DeckOverviewResponse | null>(null);
    const [onlyProxies, setOnlyProxies] = useState(proxies === true);
    const [loading, setLoading] = useState(false);
    const { account } = useAccount();

    /**
     * Adds everything a deck plays to the list
     *
     * @param chosen the deck to take, nothing when none is picked
     * @param proxiesOnly whether to load only the slots marked as proxies
     */
    async function loadDeck(chosen: DeckOverviewResponse | null, proxiesOnly: boolean) {
        if (chosen === null) return;

        setLoading(true);
        try {
            const { cards } = await Api.decks.cards.list(chosen.deck.uuid);
            const added = deckProxyCards(cards, proxiesOnly).filter((card) => !needsImage || card.front !== null);
            // A slot already on the list is not added twice: taking a deck
            // again — after switching the proxy filter off, say — should top up
            // what is missing rather than order every card twice.
            setPicked((previous) => {
                const known = new Set(previous.map((card) => card.key));
                return [...previous, ...added.filter((card) => !known.has(card.key))];
            });
        } finally {
            setLoading(false);
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

    // Opened from a deck: it is chosen and its cards are on the list before the
    // page is looked at, which is the whole point of getting here that way.
    useEffect(() => {
        if (opened === undefined || taken.current === opened) return;

        const listed = decks.find((overview) => overview.deck.uuid === opened);
        if (listed === undefined) return;

        taken.current = opened;
        setDeck(listed);
        setOnlyProxies(proxies === true);
        void loadDeck(listed, proxies === true);
        // Deliberately not keyed on `loadDeck`, which is rebuilt on every render.
    }, [decks, opened, proxies]);

    /**
     * Puts one more copy of a searched card on the list
     *
     * @param printing the card that was picked
     */
    function add(printing: Printing) {
        setPicked((previous) => {
            const known = previous.find((card) => card.key === printing.id);
            if (known !== undefined) {
                return previous.map((card) =>
                    card.key === printing.id ? { ...card, copies: Math.min(MAX_COPIES, card.copies + 1) } : card,
                );
            }
            return [
                ...previous,
                {
                    key: printing.id,
                    name: printing.name,
                    set: printing.setCode,
                    number: printing.collectorNumber,
                    front: printableImage(printing.largeImageUrl),
                    back: printableImage(printing.backLargeImageUrl),
                    copies: 1,
                    basic: isBasicLand(printing.typeLine),
                },
            ];
        });
    }

    /**
     * Puts one more copy of a card already on the list on it
     *
     * @param key the card
     */
    function more(key: string) {
        setPicked((previous) =>
            previous.map((card) =>
                card.key === key ? { ...card, copies: Math.min(MAX_COPIES, card.copies + 1) } : card,
            ),
        );
    }

    /**
     * Takes one copy back off the list, and the row with the last of them
     *
     * @param key the card
     */
    function fewer(key: string) {
        setPicked((previous) =>
            previous
                .map((card) => (card.key === key ? { ...card, copies: card.copies - 1 } : card))
                .filter((card) => card.copies > 0),
        );
    }

    /**
     * Takes a card off the list altogether
     *
     * @param key the card
     */
    function drop(key: string) {
        setPicked((previous) => previous.filter((card) => card.key !== key));
    }

    return {
        picked,
        decks,
        deck,
        setDeck,
        onlyProxies,
        setOnlyProxies,
        loading,
        add,
        more,
        fewer,
        drop,
        clear: () => setPicked([]),
        loadDeck,
    };
}
