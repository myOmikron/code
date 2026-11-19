import { ArrowUturnLeftIcon, TrashIcon } from "@heroicons/react/20/solid";
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
    /** Sorts the copies out of the deck and into a collection, or throws Proxies away */
    onReturn: (stack: SourcedStackResponse, target: string | null) => void;
    /** Takes the copies out of the account altogether */
    onDelete: (stack: SourcedStackResponse) => void;
    /** Whether a write is in flight for this row */
    busy: boolean;
};

/**
 * One stack lying in the deck that the list does not name, and the way back out of it.
 *
 * A stack that remembers where it came from needs no decision: the button puts
 * it back there. One that was bought straight into the deck has nowhere to
 * return to, so it asks for a collection first. Proxies have nowhere to go and
 * are thrown away.
 *
 * @returns the row
 */
export function DeckInventoryRow({ stack, collections, onReturn, onDelete, busy }: DeckInventoryRowProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const [picked, setTarget] = useState<string>("");

    const card = stack.card;
    const homeless = !stack.proxy && stack.origin == null;
    const target = picked !== "" ? picked : (collections[0]?.collection.uuid ?? "");

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
                    {stack.proxy ? (
                        <Badge color={"purple"}>{t("label.proxy")}</Badge>
                    ) : stack.origin_name != null ? (
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
                    {stack.proxy ? <TrashIcon /> : <ArrowUturnLeftIcon />}
                    {stack.proxy ? t("button.discard-proxies") : t("button.return-card")}
                </Button>
                {!stack.proxy && (
                    <Button
                        plain={true}
                        disabled={busy}
                        aria-label={t("button.delete-card")}
                        title={t("button.delete-card")}
                        onClick={() => onDelete(stack)}
                    >
                        <TrashIcon />
                    </Button>
                )}
            </div>
        </StackedListFlexRow>
    );
}
