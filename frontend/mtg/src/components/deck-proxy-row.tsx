import { ChevronDownIcon, ChevronRightIcon, ShoppingCartIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, StackedListFlexRow, Text } from "components";
import { useTranslation } from "react-i18next";
import type { SourcedStackResponse, SourcingCandidateResponse } from "src/api/generated";
import { FoilMark, ProxyBadge } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardmarketLink } from "src/components/cardmarket-link";
import { DeckSourcingCandidate } from "src/components/deck-sourcing-candidate";
import type { ProxyReplacement } from "src/utils/deck-sourcing";
import { formatCurrency } from "src/utils/format";

/**
 * The properties for {@link DeckProxyRow}
 */
export type DeckProxyRowProps = {
    /** The Proxy stack, the owner's copies of its card and the price of buying it */
    replacement: ProxyReplacement<SourcedStackResponse, SourcingCandidateResponse>;
    /** Whether the copies under this row are unfolded */
    open: boolean;
    /** Folds this row open, and every other one shut */
    onToggle: () => void;
    /** Moves real copies out of a collection in place of as many Proxies */
    onReplace: (proxy: SourcedStackResponse, candidate: SourcingCandidateResponse, quantity: number) => void;
    /** Throws the Proxies away */
    onDiscard: (proxy: SourcedStackResponse) => void;
    /** Whether a write is in flight for this row */
    busy: boolean;
};

/**
 * One Proxy stack in the Physical deck, what buying its printing costs, and on demand the owner's
 * copies that could take its place.
 *
 * @returns the row
 */
export function DeckProxyRow({ replacement, open, onToggle, onReplace, onDiscard, busy }: DeckProxyRowProps) {
    const [t] = useTranslation("collection");
    const { proxy, candidates, cost } = replacement;
    const card = proxy.card;
    const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

    return (
        <StackedListFlexRow className={"flex-col items-stretch gap-2"}>
            <div className={"flex flex-wrap items-center gap-x-3 gap-y-2"}>
                <button
                    type={"button"}
                    aria-expanded={open}
                    onClick={onToggle}
                    className={"flex min-w-0 flex-1 items-center gap-3 text-left"}
                >
                    <Chevron className={"size-4 shrink-0 text-zinc-400 dark:text-zinc-500"} />
                    <CardThumbnail
                        name={card?.name ?? ""}
                        image={card?.image_small ?? null}
                        finish={proxy.finish}
                        compact={true}
                        muted={true}
                        className={"h-12 shrink-0 rounded"}
                    />
                    <span className={"flex min-w-0 flex-1 flex-col gap-0.5"}>
                        <span className={"flex min-w-0 items-center gap-1.5"}>
                            <span className={"truncate font-medium text-zinc-950 dark:text-white"}>
                                {proxy.quantity}× {card?.name ?? t("label.unknown-printing")}
                            </span>
                            <FoilMark finish={proxy.finish} />
                            <ProxyBadge proxy={true} />
                        </span>
                        <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                            {card != null && `${card.set_name} · ${card.collector_number}`}
                        </span>
                    </span>
                </button>

                <div className={"flex shrink-0 flex-wrap items-center justify-end gap-1.5"}>
                    {cost != null && (
                        <Badge color={"amber"}>
                            <ShoppingCartIcon className={"size-3.5"} />
                            {t("label.replace-cost", { price: formatCurrency(cost / 100) })}
                        </Badge>
                    )}
                    <CardmarketLink card={card ?? null} finish={proxy.finish} />
                    <Button plain={true} disabled={busy} onClick={() => onDiscard(proxy)}>
                        <TrashIcon />
                        {t("button.discard-proxies")}
                    </Button>
                </div>
            </div>

            {open &&
                (candidates.length === 0 ? (
                    <Text className={"pl-7 text-xs"}>{t("description.no-copies-owned")}</Text>
                ) : (
                    <ul className={"grid grid-cols-2 gap-3 pl-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}>
                        {candidates.map((candidate) => (
                            <DeckSourcingCandidate
                                key={candidate.uuid}
                                candidate={candidate}
                                exact={candidate.printing === proxy.printing && candidate.finish === proxy.finish}
                                counts={true}
                                takeable={Math.min(candidate.quantity, proxy.quantity)}
                                onTake={(taken, quantity) => onReplace(proxy, taken, quantity)}
                                busy={busy}
                            />
                        ))}
                    </ul>
                ))}
        </StackedListFlexRow>
    );
}
