import {
    ArrowDownTrayIcon,
    ArrowPathRoundedSquareIcon,
    ArrowUturnLeftIcon,
    DocumentDuplicateIcon,
    ShoppingCartIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import { useRouter } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type {
    CollectionOverviewResponse,
    DeckCardResponse,
    SourcedStackResponse,
    SourcingCandidateResponse,
} from "src/api/generated";
import { conditionLabel, finishLabel } from "src/components/card-attribute-badge";
import type { ContextMenuItem, ContextMenuSection } from "src/components/context-menu";
import { linesByEntry } from "src/utils/deck-deviation";
import { proxyToggle, sourcingOffers } from "src/utils/deck-sourcing";
import type { SourcingOffer } from "src/utils/deck-sourcing";
import type { DeckPhysical } from "src/utils/use-deck-physical";

/** One "Besorgen" offer as the card list knows it */
type Offer = SourcingOffer<SourcingCandidateResponse, SourcedStackResponse>;

/** What the card list wires into its menu and its `X` key, see {@link useDeckSourcingMenu} */
export type DeckSourcingMenu = {
    /** The "Besorgen" section of a card's menu, `null` where it offers nothing */
    section: (card: DeckCardResponse) => ContextMenuSection | null;
    /** What `X` does on a card: Proxies in for its gap, or its Proxies thrown away again */
    toggleProxy: (card: DeckCardResponse) => void;
};

/**
 * The owner's hand on the Physical deck from the card list: the card menu's
 * "Besorgen" section and the `X` key.
 *
 * Writes go out one after another and say nothing when they succeed: the
 * card's badge is the feedback. `X` decides on what the service answers at the
 * moment it runs, so a quick second `X` undoes the first instead of repeating it.
 *
 * @param deckUuid the deck
 * @param physical the Physical deck as the card list holds it
 * @param owner whether the reader owns the deck, the only one who may touch its Physical deck
 * @param menuOpen whether a card menu is open, which is when the collections to sort into are read
 *
 * @returns the section and the toggle, `undefined` for a reader who is not the owner
 */
export function useDeckSourcingMenu(
    deckUuid: string,
    physical: DeckPhysical,
    owner: boolean,
    menuOpen: boolean,
): DeckSourcingMenu | undefined {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const router = useRouter();
    const queue = useRef<Promise<void>>(Promise.resolve());
    const [shelf, setShelf] = useState<Array<CollectionOverviewResponse> | null>(null);
    const { readSourcing, setOn, sourcing, deviation } = physical;

    useEffect(() => {
        if (!menuOpen || !owner || shelf !== null) return;
        void Api.collections
            .list()
            .then((collections) => setShelf(collections.filter((entry) => entry.collection.deck == null)));
    }, [menuOpen, owner, shelf]);

    if (!owner) return undefined;

    /**
     * Runs a write after the ones before it, then reads the deck back
     *
     * @param write the write
     */
    function serial(write: () => Promise<unknown>) {
        const next = queue.current
            .catch(() => undefined)
            .then(async () => {
                await write();
                await router.invalidate();
            });
        queue.current = next;
    }

    /**
     * Puts Proxies in for a card's gap, or throws its Proxies away again
     *
     * @param card the Deck entry
     */
    function toggleProxy(card: DeckCardResponse) {
        if (card.zone === "Maybe") return;
        setOn?.(true);
        serial(async () => {
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
    function act(card: DeckCardResponse, offer: Offer, target: string | null = null) {
        switch (offer.kind) {
            case "take":
                serial(() => Api.decks.sourcing.take(deckUuid, offer.candidate.uuid, offer.quantity));
                return;
            case "bought":
                serial(() => Api.decks.sourcing.fill(deckUuid, card.uuid));
                return;
            case "proxy":
                toggleProxy(card);
                return;
            case "replace":
                serial(() =>
                    Api.decks.sourcing.replaceProxy(deckUuid, offer.proxy.uuid, offer.candidate.uuid, offer.quantity),
                );
                return;
            case "return":
                serial(() => Api.decks.sourcing.returnCards(deckUuid, offer.stack.uuid, offer.quantity, target));
                return;
        }
    }

    /**
     * Where a shelf stack lies and what it is, behind an offer's verb
     *
     * @param candidate the stack on the shelf
     * @param exact whether it is the line's printing and finish
     *
     * @returns the label
     */
    function from(candidate: SourcingCandidateResponse, exact: boolean) {
        const parts = [candidate.collection_name, conditionLabel(tg, candidate.condition)];
        if (exact) return parts.join(" · ");
        return (
            <span className={"text-zinc-500 dark:text-zinc-400"}>
                {[
                    ...parts,
                    `${candidate.card.set_code.toUpperCase()} #${candidate.card.collector_number}`,
                    finishLabel(tg, candidate.finish),
                    t("label.counts-as-deviation"),
                ].join(" · ")}
            </span>
        );
    }

    /**
     * The menu lines one offer comes to
     *
     * @param card the Deck entry
     * @param offer the offer
     * @param index where it stands in the section
     *
     * @returns its lines, one per collection for real copies without an origin
     */
    function items(card: DeckCardResponse, offer: Offer, index: number): Array<ContextMenuItem> {
        const key = `${offer.kind}-${index}`;
        switch (offer.kind) {
            case "take":
                return [
                    {
                        key,
                        label: (
                            <span className={clsx(!offer.exact && "flex flex-col")}>
                                {t("button.take-from", { count: offer.quantity })} {from(offer.candidate, offer.exact)}
                            </span>
                        ),
                        icon: <ArrowDownTrayIcon />,
                        onSelect: () => act(card, offer),
                    },
                ];
            case "bought":
                return [
                    {
                        key,
                        label: t("button.record-bought", { count: offer.quantity }),
                        icon: <ShoppingCartIcon />,
                        onSelect: () => act(card, offer),
                    },
                ];
            case "proxy":
                return [
                    {
                        key,
                        label:
                            offer.toggle.kind === "put"
                                ? t("button.put-proxies", { count: offer.toggle.quantity })
                                : t("button.discard-proxies", { count: offer.toggle.quantity }),
                        icon: offer.toggle.kind === "put" ? <DocumentDuplicateIcon /> : <TrashIcon />,
                        shortcut: "X",
                        onSelect: () => act(card, offer),
                    },
                ];
            case "replace":
                return [
                    {
                        key,
                        label: (
                            <span className={clsx(!offer.exact && "flex flex-col")}>
                                {t("button.replace-proxies", { count: offer.quantity })}{" "}
                                {from(offer.candidate, offer.exact)}
                            </span>
                        ),
                        icon: <ArrowPathRoundedSquareIcon />,
                        onSelect: () => act(card, offer),
                    },
                ];
            case "return":
                if (offer.stack.origin != null) {
                    return [
                        {
                            key,
                            label: t("button.return-to", {
                                count: offer.quantity,
                                collection: offer.stack.origin_name ?? t("label.return-to-origin"),
                            }),
                            icon: <ArrowUturnLeftIcon />,
                            onSelect: () => act(card, offer),
                        },
                    ];
                }
                return (shelf ?? []).map((target) => ({
                    key: `${key}-${target.collection.uuid}`,
                    label: t("button.return-to", { count: offer.quantity, collection: target.collection.name }),
                    icon: <ArrowUturnLeftIcon />,
                    onSelect: () => act(card, offer, target.collection.uuid),
                }));
        }
    }

    /**
     * The "Besorgen" section for a card
     *
     * @param card the Deck entry
     *
     * @returns the section, `null` where nothing is offered
     */
    function section(card: DeckCardResponse): ContextMenuSection | null {
        if (sourcing === null) return null;
        const offers = sourcingOffers(
            card,
            linesByEntry(deviation).get(card.uuid),
            sourcing.filed,
            sourcing.candidates,
        );
        if (offers.length === 0) return null;
        return {
            key: "sourcing",
            heading: t("label.sourcing-menu"),
            items: offers.flatMap((offer, index) => items(card, offer, index)),
        };
    }

    return { section, toggleProxy };
}
