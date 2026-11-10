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
import { addCard, addDeck, changeCopies, copiesOf, dropCard, dropDeck } from "src/utils/proxy-list";
import type { ProxyGroup } from "src/utils/proxy-list";
import { deckProxyCards, isBasicLand, missingProxyCards, printableImage } from "src/utils/proxy-print";
import type { ProxyCard } from "src/utils/proxy-print";
import type { Printing } from "src/utils/scryfall";

/** How a page opens the list */
export type ProxyPickOptions = {
    /** The deck to start with, as a deck page links it over */
    deck?: string;
    /** Whether that deck is taken with only the copies its Physical deck lacks */
    missing?: boolean;
    /** Whether a card the catalog has no picture of is dropped, which printing needs */
    needsImage: boolean;
};

/** What {@link useProxyPicks} hands back */
export type ProxyPicks = {
    /** What is on the list, deck by deck */
    groups: Array<ProxyGroup>;
    /** The same, as one list */
    picked: Array<ProxyCard>;
    /** The decks the account may take from, empty without one */
    decks: Array<DeckOverviewResponse>;
    /** The deck the combobox stands on, `null` while none is chosen */
    deck: DeckOverviewResponse | null;
    /** Chooses a deck, without taking it yet */
    setDeck: (deck: DeckOverviewResponse | null) => void;
    /** Whether a deck is taken with only the copies its Physical deck lacks, or with all its lines */
    onlyMissing: boolean;
    /** Switches that over, for the next deck taken */
    setOnlyMissing: (only: boolean) => void;
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
    /** Adds the chosen deck to the list, or tops it up when it is already on it */
    addChosenDeck: () => void;
};

/**
 * The cards a proxy run is made of, and everything that puts them there.
 *
 * @param options what the page was opened on
 * @param options.deck the deck to start with, nothing when the page was opened on none
 * @param options.missing whether that deck is taken with only the copies its Physical deck lacks
 * @param options.needsImage whether a card the catalog has no picture of is dropped
 *
 * @returns the list and its mutators
 */
export function useProxyPicks({ deck: opened, missing, needsImage }: ProxyPickOptions): ProxyPicks {
    const [t] = useTranslation("game-utils");

    // A deck handed over in the url is taken once. Without the mark, going back
    // to the tab would file the deck a second time.
    const taken = useRef<string | null>(null);
    const reading = useRef(new Set<string>());

    const [groups, setGroups] = useState<Array<ProxyGroup>>([]);
    const [decks, setDecks] = useState<Array<DeckOverviewResponse>>([]);
    const [deck, setDeck] = useState<DeckOverviewResponse | null>(null);
    const [onlyMissing, setOnlyMissing] = useState(missing === true);
    const [loading, setLoading] = useState(0);
    const { account } = useAccount();

    /**
     * Adds a deck to the list, or tops up one already on it
     *
     * A deck without a Physical deck, or one only its owner may see the
     * Physical deck of, has no missing copies to tell: it is taken with all its
     * lines, and the toast says so.
     *
     * @param chosen the deck to take
     * @param onlyLacking whether to take only the copies its Physical deck lacks
     */
    async function loadDeck(chosen: DeckOverviewResponse, onlyLacking: boolean) {
        const { uuid, name } = chosen.deck;
        reading.current.add(uuid);
        setLoading((count) => count + 1);
        try {
            const [{ cards }, deviation] = await Promise.all([
                Api.decks.cards.list(uuid),
                onlyLacking ? Api.decks.deviation(uuid) : null,
            ]);
            if (!reading.current.delete(uuid)) return;

            const lacking = deviation === null ? null : missingProxyCards(cards, deviation);
            if (onlyLacking && lacking === null) notify.info(t("toast.deck-without-physical-deck", { name }));

            const added = (lacking ?? deckProxyCards(cards)).filter((card) => !needsImage || card.front !== null);
            if (added.length === 0) {
                notify.info(t(lacking === null ? "toast.deck-nothing-to-add" : "toast.deck-nothing-missing", { name }));
            }

            setGroups((previous) => addDeck(previous, { uuid, name }, added));
            setDeck((current) => (current?.deck.uuid === uuid ? null : current));
        } finally {
            setLoading((count) => count - 1);
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

    useEffect(() => {
        if (opened === undefined || taken.current === opened) return;

        const listed = decks.find((overview) => overview.deck.uuid === opened);
        if (listed === undefined) return;

        taken.current = opened;
        setOnlyMissing(missing === true);
        void loadDeck(listed, missing === true);
        // Deliberately not keyed on `loadDeck`, which is rebuilt on every render.
    }, [decks, opened, missing]);

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
            }),
        );
    }

    return {
        groups,
        picked: groups.flatMap((group) => group.cards),
        decks,
        deck,
        setDeck,
        onlyMissing,
        setOnlyMissing,
        loading: loading > 0,
        countOf: (key) => copiesOf(groups, key),
        add,
        more: (key) => setGroups((previous) => changeCopies(previous, key, 1)),
        fewer: (key) => setGroups((previous) => changeCopies(previous, key, -1)),
        drop: (key) => setGroups((previous) => dropCard(previous, key)),
        dropDeck: (uuid) => {
            if (uuid !== null) reading.current.delete(uuid);
            setGroups((previous) => dropDeck(previous, uuid));
        },
        clear: () => {
            reading.current.clear();
            setGroups([]);
        },
        addChosenDeck: () => {
            if (deck !== null) void loadDeck(deck, onlyMissing);
        },
    };
}
