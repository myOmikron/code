import {
    ArrowDownTrayIcon,
    ArrowPathRoundedSquareIcon,
    ArrowUturnLeftIcon,
    DocumentDuplicateIcon,
    ShoppingCartIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, SourcingCandidateResponse } from "src/api/generated";
import { conditionLabel, finishLabel } from "src/components/card-attribute-badge";
import type { ContextMenuItem, ContextMenuSection } from "src/components/context-menu";
import type { DeckSourcing, DeckSourcingOffer } from "src/utils/use-deck-sourcing";

/**
 * The "Besorgen" section of a card's menu, built from the owner's offers.
 *
 * @param sourcing the owner's hand on the Physical deck, `undefined` for a reader who is not the owner
 *
 * @returns the section for a card, `null` where it offers nothing; `undefined` for a reader who is not the owner
 */
export function useDeckSourcingMenu(
    sourcing: DeckSourcing | undefined,
): ((card: DeckCardResponse) => ContextMenuSection | null) | undefined {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    if (sourcing === undefined) return undefined;
    const actions = sourcing;

    /**
     * Where a shelf stack lies and what it is, behind an offer's verb
     *
     * @param candidate the stack on the shelf
     * @param exact whether it is the Deck entry's printing and finish
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
    function items(card: DeckCardResponse, offer: DeckSourcingOffer, index: number): Array<ContextMenuItem> {
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
                        onSelect: () => actions.carryOut(card, offer),
                    },
                ];
            case "bought":
                return [
                    {
                        key,
                        label: t("button.record-bought", { count: offer.quantity }),
                        icon: <ShoppingCartIcon />,
                        onSelect: () => actions.carryOut(card, offer),
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
                        onSelect: () => actions.carryOut(card, offer),
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
                        onSelect: () => actions.carryOut(card, offer),
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
                            onSelect: () => actions.carryOut(card, offer),
                        },
                    ];
                }
                return actions.shelf.map((target) => ({
                    key: `${key}-${target.collection.uuid}`,
                    label: t("button.return-to", { count: offer.quantity, collection: target.collection.name }),
                    icon: <ArrowUturnLeftIcon />,
                    onSelect: () => actions.carryOut(card, offer, target.collection.uuid),
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
        const offers = actions.offers(card);
        if (offers.length === 0) return null;
        return {
            key: "sourcing",
            heading: t("label.sourcing-menu"),
            items: offers.flatMap((offer, index) => items(card, offer, index)),
        };
    }

    return section;
}
