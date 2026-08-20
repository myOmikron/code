import { ExclamationTriangleIcon, MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Button, Strong, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { CardFlipButton } from "src/components/card-flip-button";
import { CardmarketLink } from "src/components/cardmarket-link";
import { GroupHeading } from "src/components/deck-card-grid";
import { violationLabel } from "src/components/deck-card-row";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckTagBadge, DeckTagPicker } from "src/components/deck-tag-picker";
import { ManaCost } from "src/components/mana-cost";
import { hasBack } from "src/utils/card-artwork";
import type { DeckGroup, DeckGrouping } from "src/utils/deck-grouping";
import type { SlotViolation } from "src/utils/deck-rules";
import { finishOf, priceOf } from "src/utils/deck-foil";
import { formatCurrency } from "src/utils/format";

/** Properties for the compact table representation of a deck. */
export type DeckCardTableProps = {
    groups: Array<DeckGroup>;
    grouping: DeckGrouping;
    violations: Map<string, Array<SlotViolation>>;
    tags: Array<DeckTagResponse>;
    onInspect: (card: DeckCardResponse) => void;
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    onDelete?: (card: DeckCardResponse) => void;
    onToggleTag?: (card: DeckCardResponse, tag: DeckTagResponse, on: boolean) => void;
    onManageTags?: () => void;
    onActivate?: (card: DeckCardResponse | null) => void;
    onMenu?: (card: DeckCardResponse, at: { x: number; y: number }) => void;
    isFlipped: (card: DeckCardResponse) => boolean;
    onFlip: (card: DeckCardResponse) => void;
};

/** A dense deck view for comparing card facts down columns. */
export function DeckCardTable({
    groups,
    grouping,
    violations,
    tags,
    onInspect,
    onChangeQuantity,
    onDelete,
    onToggleTag,
    onManageTags,
    onActivate,
    onMenu,
    isFlipped,
    onFlip,
}: DeckCardTableProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    /**
     * Names a group the way the active grouping spells its keys
     *
     * @param key the group's key, e.g. a zone, a mana value or a tag id
     *
     * @returns the heading to draw over the group
     */
    function heading(key: string): ReactNode {
        switch (grouping) {
            case "zone":
                return labels.zone(key as DeckZone);
            case "mana":
                return key === "7" ? t("label.mana-value-cap", { value: key }) : t("label.mana-value", { value: key });
            case "color":
                if (key === "multicolor") return t("label.color-multicolor");
                if (key === "colorless") return <ManaCost value={"{C}"} />;
                return <ManaCost value={`{${key}}`} />;
            case "tag":
                if (key.startsWith("zone:")) return labels.zone(key.slice("zone:".length) as DeckZone);
                return tags.find((tag) => tag.uuid === key)?.name ?? t("label.untagged");
            case "type":
                return key.startsWith("zone:") ? labels.zone(key.slice("zone:".length) as DeckZone) : labels.type(key);
        }
    }

    return (
        <div className={"flex flex-col gap-8"}>
            {groups.map((group) => (
                <section key={group.key} className={"flex flex-col gap-2"}>
                    <GroupHeading commander={group.key === "zone:Commander"} copies={group.copies}>
                        {heading(group.key)}
                    </GroupHeading>
                    <Table dense striped className={"[--gutter:0px] [&_table]:min-w-[64rem] [&_table]:table-fixed"}>
                        <colgroup>
                            <col className={"w-[30%]"} />
                            <col className={"w-40"} />
                            <col className={"w-[30%]"} />
                            <col className={"w-36"} />
                            <col className={"w-28"} />
                            <col className={"w-10"} />
                            <col className={"w-20"} />
                        </colgroup>
                        <TableHead>
                            <TableRow>
                                <TableHeader>{t("label.name")}</TableHeader>
                                <TableHeader>{t("label.mana-cost")}</TableHeader>
                                <TableHeader>{t("label.tags")}</TableHeader>
                                <TableHeader className={"text-right"}>{t("label.quantity")}</TableHeader>
                                <TableHeader className={"hidden text-right md:table-cell"}>
                                    {t("label.value")}
                                </TableHeader>
                                <TableHeader className={"w-0"}>
                                    <span className={"sr-only"}>{t("label.remarks", { count: 1 })}</span>
                                </TableHeader>
                                <TableHeader className={"w-0"} />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {group.cards.map((card) => {
                                const printing = card.card;
                                const remarks = violations.get(card.uuid) ?? [];
                                const price = priceOf(card);
                                return (
                                    <TableRow
                                        key={card.uuid}
                                        className={CONTEXT_MENU_TARGET}
                                        onMouseEnter={() => onActivate?.(card)}
                                        onMouseLeave={() => onActivate?.(null)}
                                        onFocus={() => onActivate?.(card)}
                                        onBlur={() => onActivate?.(null)}
                                        {...(onMenu === undefined ? {} : contextMenuTrigger((at) => onMenu(card, at)))}
                                    >
                                        <TableCell>
                                            <span className={"flex items-center gap-2"}>
                                                <button
                                                    type={"button"}
                                                    onClick={() => onInspect(card)}
                                                    className={
                                                        "max-w-56 truncate text-left font-medium hover:underline"
                                                    }
                                                >
                                                    {printing?.name ?? t("label.unknown-printing")}
                                                </button>
                                                {hasBack(printing) && (
                                                    <CardFlipButton
                                                        flipped={isFlipped(card)}
                                                        overlay={false}
                                                        onFlip={() => onFlip(card)}
                                                        className={"p-1"}
                                                    />
                                                )}
                                            </span>
                                            {printing != null && (
                                                <Text
                                                    className={"text-xs"}
                                                >{`${printing.set_code} #${printing.collector_number}`}</Text>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {printing != null && printing.mana_cost !== "" ? (
                                                <ManaCost value={printing.mana_cost} />
                                            ) : (
                                                "—"
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className={"flex flex-wrap items-center gap-1 whitespace-normal"}>
                                                {tags
                                                    .filter((tag) => card.tags.includes(tag.uuid))
                                                    .map((tag) => (
                                                        <DeckTagBadge key={tag.uuid} tag={tag} />
                                                    ))}
                                                {onToggleTag !== undefined && card.tags.length === 0 && (
                                                    <DeckTagPicker
                                                        tags={tags}
                                                        assigned={card.tags}
                                                        onToggle={(tag, on) => onToggleTag(card, tag, on)}
                                                        onManage={onManageTags}
                                                    />
                                                )}
                                            </span>
                                        </TableCell>
                                        <TableCell className={"text-right"}>
                                            {onChangeQuantity === undefined ? (
                                                <Strong className={"tabular-nums"}>{card.quantity}</Strong>
                                            ) : (
                                                <span className={"inline-flex items-center gap-1"}>
                                                    <Button
                                                        plain
                                                        aria-label={t("accessibility.decrease-quantity")}
                                                        onClick={() => onChangeQuantity(card, card.quantity - 1)}
                                                    >
                                                        <MinusIcon className={"size-4"} />
                                                    </Button>
                                                    <Strong className={"w-6 text-center tabular-nums"}>
                                                        {card.quantity}
                                                    </Strong>
                                                    <Button
                                                        plain
                                                        aria-label={t("accessibility.increase-quantity")}
                                                        onClick={() => onChangeQuantity(card, card.quantity + 1)}
                                                    >
                                                        <PlusIcon className={"size-4"} />
                                                    </Button>
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className={"hidden text-right font-medium md:table-cell"}>
                                            {price === null ? "—" : formatCurrency((price * card.quantity) / 100)}
                                        </TableCell>
                                        <TableCell>
                                            {remarks.length > 0 && (
                                                <ExclamationTriangleIcon
                                                    className={"size-5 text-amber-500"}
                                                    title={violationLabel(t, remarks[0], card.zone)}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className={"flex items-center gap-1"}>
                                                <CardmarketLink card={printing} finish={finishOf(card)} />
                                                {onDelete !== undefined && (
                                                    <Button
                                                        plain
                                                        aria-label={t("accessibility.remove-card")}
                                                        onClick={() => onDelete(card)}
                                                    >
                                                        <TrashIcon className={"size-4"} />
                                                    </Button>
                                                )}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </section>
            ))}
        </div>
    );
}
