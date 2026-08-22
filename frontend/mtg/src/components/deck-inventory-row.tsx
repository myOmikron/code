import { ArrowUturnLeftIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Listbox, ListboxLabel, ListboxOption, StackedListFlexRow, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CollectionOverviewResponse, SourcedStackResponse } from "src/api/generated";
import { FoilMark, conditionLabel, finishLabel } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CollectionMarker } from "src/components/collection-marker";

/**
 * The properties for {@link DeckInventoryRow}
 */
export type DeckInventoryRowProps = {
    /** The stack lying in the deck */
    stack: SourcedStackResponse;
    /** The collections a stack without an origin could be sorted into */
    collections: Array<CollectionOverviewResponse>;
    /** Whether the deck list still asks for this card */
    wanted: boolean;
    /** Sorts the copies out of the deck and into a collection */
    onReturn: (stack: SourcedStackResponse, target: string | null) => void;
    /** Whether a write is in flight for this row */
    busy: boolean;
};

/**
 * One stack lying in the deck, and the way back out of it.
 *
 * A stack that remembers where it came from needs no decision: the button puts
 * it back there. One that was bought straight into the deck has nowhere to
 * return to, so it asks for a collection first — and a stack the list no longer wants
 * says so, because that is the pile somebody forgot to sort back.
 *
 * @returns the row
 */
export function DeckInventoryRow({ stack, collections, wanted, onReturn, busy }: DeckInventoryRowProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const [target, setTarget] = useState<string>(collections[0]?.collection.uuid ?? "");

    const card = stack.card;
    const homeless = stack.origin == null;

    return (
        <StackedListFlexRow className={"flex-wrap items-center gap-x-4 gap-y-3"}>
            <CardThumbnail
                name={card?.name ?? ""}
                image={card?.image_small ?? null}
                finish={stack.finish}
                className={"h-20 shrink-0 rounded-lg sm:h-24"}
            />

            <div className={"flex min-w-0 flex-1 flex-col gap-1"}>
                <span className={"flex min-w-0 items-center gap-1.5"}>
                    <span className={"truncate font-medium text-zinc-950 dark:text-white"}>
                        {stack.quantity}× {card?.name ?? t("label.unknown-printing")}
                    </span>
                    <FoilMark finish={stack.finish} />
                </span>
                <Text className={"truncate text-xs"}>
                    {card != null && `${card.set_name} · `}
                    {conditionLabel(tg, stack.condition)} · {finishLabel(tg, stack.finish)}
                </Text>
                <div className={"flex flex-wrap items-center gap-1.5"}>
                    {stack.origin_name != null ? (
                        <span className={"flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                            <CollectionMarker
                                color={stack.origin_color ?? ""}
                                icon={stack.origin_icon ?? ""}
                                size={"sm"}
                            />
                            {t("label.origin", { name: stack.origin_name })}
                        </span>
                    ) : (
                        <Badge color={"zinc"}>{t("label.no-origin")}</Badge>
                    )}
                    {!wanted && (
                        <Badge color={"amber"}>
                            <ExclamationTriangleIcon className={"size-3.5"} />
                            {t("label.not-in-list")}
                        </Badge>
                    )}
                </div>
            </div>

            <div className={"flex shrink-0 flex-wrap items-center gap-2"}>
                {homeless && collections.length > 0 && (
                    <Listbox
                        value={target}
                        onChange={setTarget}
                        aria-label={t("label.return-target")}
                        className={"min-w-40"}
                    >
                        {collections.map((collection) => (
                            <ListboxOption key={collection.collection.uuid} value={collection.collection.uuid}>
                                <ListboxLabel>{collection.collection.name}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                )}
                <Button
                    outline={true}
                    disabled={busy || (homeless && target === "")}
                    onClick={() => onReturn(stack, homeless ? target : null)}
                >
                    <ArrowUturnLeftIcon />
                    {t("button.return-card")}
                </Button>
            </div>
        </StackedListFlexRow>
    );
}
