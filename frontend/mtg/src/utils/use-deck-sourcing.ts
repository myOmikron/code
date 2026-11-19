import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Api } from "src/api/api";
import type {
    CollectionOverviewResponse,
    DeckCardResponse,
    SourcedStackResponse,
    SourcingCandidateResponse,
} from "src/api/generated";
import { linesByEntry } from "src/utils/deck-deviation";
import { proxyToggle, sourcingOffers } from "src/utils/deck-sourcing";
import type { SourcingOffer } from "src/utils/deck-sourcing";
import { readShelfCollections } from "src/utils/shelf-collections";
import type { DeckPhysical } from "src/utils/use-deck-physical";
import type { WriteQueue } from "src/utils/use-write-queue";

/** One "Besorgen" offer as the card list knows it */
export type DeckSourcingOffer = SourcingOffer<SourcingCandidateResponse, SourcedStackResponse>;

/** The owner's hand on the Physical deck from the card list, see {@link useDeckSourcing} */
export type DeckSourcing = {
    /** What "Besorgen" offers for a card, empty until the sourcing is read */
    offers: (card: DeckCardResponse) => Array<DeckSourcingOffer>;
    /** Carries out an offer; `target` is the collection real copies without an origin go into */
    carryOut: (card: DeckCardResponse, offer: DeckSourcingOffer, target?: string | null) => void;
    /** What `X` does on a card: Proxies in for its gap, or its Proxies thrown away again */
    toggleProxy: (card: DeckCardResponse) => void;
    /** The collections real copies without an origin can be sorted back into */
    shelf: Array<CollectionOverviewResponse>;
};

/**
 * The owner's hand on the Physical deck from the card list: the offers of a
 * card's "Besorgen" section and the `X` key.
 *
 * Writes go out through the card list's queue and say nothing when they succeed:
 * the card's badge is the feedback. `X` decides on what the service answers at
 * the moment it runs, so a quick second `X` undoes the first instead of
 * repeating it. The collections to sort into are read as soon as the Physical
 * deck holds a real card without an origin, so the menu offers them on first open.
 *
 * @param deckUuid the deck
 * @param physical the Physical deck as the card list holds it
 * @param owner whether the reader owns the deck, the only one who may touch its Physical deck
 * @param serial the card list's write queue
 *
 * @returns the offers and the actions, `undefined` for a reader who is not the owner
 */
export function useDeckSourcing(
    deckUuid: string,
    physical: DeckPhysical,
    owner: boolean,
    serial: WriteQueue,
): DeckSourcing | undefined {
    const router = useRouter();
    const [shelf, setShelf] = useState<Array<CollectionOverviewResponse> | null>(null);
    const { readSourcing, setOn, sourcing, deviation } = physical;
    const homeless = sourcing?.filed.some((stack) => !stack.proxy && stack.origin == null) === true;

    useEffect(() => {
        if (!owner || !homeless || shelf !== null) return;
        void readShelfCollections()
            .then(setShelf)
            .catch(() => undefined);
    }, [owner, homeless, shelf]);

    if (!owner) return undefined;

    /**
     * Runs a write after the ones before it, then reads the deck back
     *
     * @param work the write
     */
    function write(work: () => Promise<unknown>) {
        serial(async () => {
            await work();
            await router.invalidate();
        }).catch(() => undefined);
    }

    /**
     * Puts Proxies in for a card's gap, or throws its Proxies away again
     *
     * @param card the Deck entry
     */
    function toggleProxy(card: DeckCardResponse) {
        if (card.zone === "Maybe") return;
        setOn?.(true);
        write(async () => {
            const [now, where] = await Promise.all([Api.decks.deviation(deckUuid), readSourcing()]);
            const toggle = proxyToggle(card, linesByEntry(now).get(card.uuid), where?.filed ?? []);
            if (toggle === null) return;
            if (toggle.kind === "put") {
                await Api.decks.sourcing.putProxies(deckUuid, card.uuid, toggle.quantity);
                return;
            }
            for (const { stack, quantity } of toggle.stacks) {
                await Api.decks.sourcing.returnCards(deckUuid, stack.uuid, quantity);
            }
        });
    }

    /**
     * Carries out one offer
     *
     * @param card the Deck entry
     * @param offer what was picked
     * @param target the collection real copies without an origin go into
     */
    function carryOut(card: DeckCardResponse, offer: DeckSourcingOffer, target: string | null = null) {
        switch (offer.kind) {
            case "take":
                write(() => Api.decks.sourcing.take(deckUuid, offer.candidate.uuid, offer.quantity));
                return;
            case "bought":
                write(() => Api.decks.sourcing.fill(deckUuid, card.uuid));
                return;
            case "proxy":
                toggleProxy(card);
                return;
            case "replace":
                write(() =>
                    Api.decks.sourcing.replaceProxy(deckUuid, offer.proxy.uuid, offer.candidate.uuid, offer.quantity),
                );
                return;
            case "return":
                write(() => Api.decks.sourcing.returnCards(deckUuid, offer.stack.uuid, offer.quantity, target));
                return;
        }
    }

    /**
     * What "Besorgen" offers for a card
     *
     * @param card the Deck entry
     *
     * @returns the offers, empty until the sourcing is read
     */
    function offers(card: DeckCardResponse): Array<DeckSourcingOffer> {
        if (sourcing === null) return [];
        return sourcingOffers(card, linesByEntry(deviation).get(card.uuid), sourcing.filed, sourcing.candidates);
    }

    return { offers, carryOut, toggleProxy, shelf: shelf ?? [] };
}
