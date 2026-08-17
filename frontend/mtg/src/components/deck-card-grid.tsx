import {
    ExclamationTriangleIcon,
    MinusIcon,
    PlusIcon,
    StarIcon,
    TrashIcon,
    TrophyIcon,
} from "@heroicons/react/20/solid";
import { Strong } from "components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import type { DeckGroup, DeckGrouping } from "src/utils/deck-grouping";
import type { SlotViolation } from "src/utils/deck-rules";

/**
 * The properties for {@link DeckCardGrid}
 */
export type DeckCardGridProps = {
    /** The groups, already broken up and ordered */
    groups: Array<DeckGroup>;
    /** What the list is broken up by, which decides how a heading is named */
    grouping: DeckGrouping;
    /** What the format has to say, keyed by slot */
    violations: Map<string, Array<SlotViolation>>;
    /** The tags that exist */
    tags: Array<DeckTagResponse>;
    /** Opens a card's dialog */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count, left out where the deck is only being looked at */
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    /** Takes a card out, left out where the deck is only being looked at */
    onDelete?: (card: DeckCardResponse) => void;
};

/**
 * The deck as cards, which is how a deck is actually looked at.
 *
 * Counts change on the tile itself: hovering one raises a row of controls over
 * the artwork, so a second copy or a cut costs one click and no dialog. Touch
 * has no hover, so the tile still opens the card in full.
 *
 * @returns the grid
 */
export function DeckCardGrid({
    groups,
    grouping,
    violations,
    tags,
    onInspect,
    onChangeQuantity,
    onDelete,
}: DeckCardGridProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    /**
     * What a heading shows
     *
     * A colour is drawn as its mana symbol rather than spelled out: that is how
     * a decklist is read everywhere else, and five words of colour names in a
     * column of headings is noise.
     *
     * @param key the group's slug
     *
     * @returns the heading
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
                return tags.find((tag) => tag.uuid === key)?.name ?? t("label.untagged");
            case "type":
                return key.startsWith("zone:") ? labels.zone(key.slice("zone:".length) as DeckZone) : labels.type(key);
        }
    }

    return (
        <div className={"flex flex-col gap-8"}>
            {groups.map((group) => (
                <div key={group.key} className={"flex flex-col gap-3"}>
                    <GroupHeading commander={group.key === "zone:Commander"} copies={group.copies}>
                        {heading(group.key)}
                    </GroupHeading>
                    <ul
                        className={
                            group.key === "zone:Commander"
                                ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                                : "grid grid-cols-2 gap-3 min-[380px]:grid-cols-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10"
                        }
                    >
                        {group.cards.map((card) => (
                            <Tile
                                key={card.uuid}
                                card={card}
                                remarks={violations.get(card.uuid) ?? []}
                                onInspect={onInspect}
                                onChangeQuantity={onChangeQuantity}
                                onDelete={onDelete}
                            />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

/**
 * The properties for {@link GroupHeading}
 */
type GroupHeadingProps = {
    /** Whether this is the command zone, which is set apart */
    commander: boolean;
    /** How many copies sit under it */
    copies: number;
    /** What the group is called */
    children: ReactNode;
};

/**
 * The line above a group: what it is, and how much of the deck it is
 *
 * @returns the heading
 */
export function GroupHeading({ commander, copies, children }: GroupHeadingProps) {
    return (
        <div className={"flex items-center gap-3"}>
            <Strong
                className={
                    commander
                        ? "flex items-center gap-2 text-(--color-brand-700) dark:text-(--color-brand-300)"
                        : "flex items-center gap-2"
                }
            >
                {commander && <StarIcon className={"size-4"} />}
                {children}
            </Strong>
            <span
                className={
                    "rounded-(--radius-pill) bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-white/10 dark:text-zinc-300"
                }
            >
                {copies}
            </span>
            <span className={"h-px flex-1 bg-zinc-950/5 dark:bg-white/10"} />
        </div>
    );
}

/**
 * The properties for {@link Tile}
 */
type TileProps = {
    /** The slot to draw */
    card: DeckCardResponse;
    /** What the format has to say about it */
    remarks: Array<SlotViolation>;
    /** Opens the card's dialog */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count */
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    /** Takes the card out */
    onDelete?: (card: DeckCardResponse) => void;
};

/**
 * One card of the deck, with its controls a hover away
 *
 * @returns the tile
 */
function Tile({ card, remarks, onInspect, onChangeQuantity, onDelete }: TileProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const zoneName = labels.zone(card.zone);
    const printing = card.card;
    const gameChanger = printing?.game_changer === true;

    return (
        <li className={"group/tile relative"}>
            <button
                type={"button"}
                onClick={() => onInspect(card)}
                aria-label={t("accessibility.inspect-card", { name: printing?.name ?? t("label.unknown-printing") })}
                className={
                    gameChanger
                        ? "block w-full rounded-xl ring-2 ring-amber-400/70 transition group-hover/tile:ring-amber-400 dark:ring-amber-300/60"
                        : "block w-full rounded-xl ring-1 ring-transparent transition group-hover/tile:ring-zinc-950/15 dark:group-hover/tile:ring-white/20"
                }
            >
                <CardThumbnail
                    name={printing?.name ?? ""}
                    image={printing?.image_normal ?? printing?.image_small ?? null}
                    finish={"Nonfoil"}
                    className={"w-full rounded-xl"}
                />
            </button>

            {card.zone !== "Main" && card.zone !== "Commander" && (
                <span
                    className={
                        "pointer-events-none absolute bottom-2 left-2 rounded-(--radius-pill) bg-zinc-950/80 px-2 py-0.5 text-[0.625rem] font-medium text-white"
                    }
                >
                    {zoneName}
                </span>
            )}

            {card.quantity > 1 && (
                <span
                    className={
                        "pointer-events-none absolute top-2 right-2 rounded-full bg-zinc-950/80 px-2 py-0.5 text-xs font-semibold text-white tabular-nums"
                    }
                >
                    ×{card.quantity}
                </span>
            )}

            {gameChanger && (
                <span
                    className={"pointer-events-none absolute top-2 left-2 rounded-full bg-amber-400 p-1 text-amber-950"}
                    title={t("label.game-changer")}
                >
                    <TrophyIcon className={"size-3.5"} />
                </span>
            )}

            {remarks.length > 0 && (
                <span
                    className={"pointer-events-none absolute top-10 left-2 rounded-full bg-amber-500 p-1 text-white"}
                    title={t("label.has-remark")}
                >
                    <ExclamationTriangleIcon className={"size-3.5"} />
                </span>
            )}

            {onChangeQuantity !== undefined && (
                <span
                    className={
                        "invisible absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded-lg bg-zinc-950/85 px-1.5 py-1 opacity-0 backdrop-blur-sm transition group-focus-within/tile:visible group-focus-within/tile:opacity-100 group-hover/tile:visible group-hover/tile:opacity-100"
                    }
                >
                    <button
                        type={"button"}
                        aria-label={t("accessibility.decrease-quantity")}
                        onClick={() => onChangeQuantity(card, card.quantity - 1)}
                        className={"rounded p-1 text-white hover:bg-white/15"}
                    >
                        <MinusIcon className={"size-4"} />
                    </button>
                    <span className={"text-xs font-semibold text-white tabular-nums"}>{card.quantity}</span>
                    <button
                        type={"button"}
                        aria-label={t("accessibility.increase-quantity")}
                        onClick={() => onChangeQuantity(card, card.quantity + 1)}
                        className={"rounded p-1 text-white hover:bg-white/15"}
                    >
                        <PlusIcon className={"size-4"} />
                    </button>
                    {onDelete !== undefined && (
                        <button
                            type={"button"}
                            aria-label={t("accessibility.remove-card")}
                            onClick={() => onDelete(card)}
                            className={"rounded p-1 text-white hover:bg-red-500/80"}
                        >
                            <TrashIcon className={"size-4"} />
                        </button>
                    )}
                </span>
            )}
        </li>
    );
}
