import {
    ExclamationTriangleIcon,
    MinusIcon,
    PlusIcon,
    StarIcon,
    TagIcon,
    TrashIcon,
    TrophyIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Strong } from "components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { CardFlipButton } from "src/components/card-flip-button";
import { CardThumbnail } from "src/components/card-thumbnail";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckTagDots, DeckTagPicker } from "src/components/deck-tag-picker";
import { ManaCost } from "src/components/mana-cost";
import type { DeckTileSize } from "src/components/deck-view-controls";
import { artworkOf } from "src/utils/card-artwork";
import type { DeckGroup, DeckGrouping } from "src/utils/deck-grouping";
import type { SlotViolation } from "src/utils/deck-rules";
import { finishOf } from "src/utils/deck-foil";
import { tagsOn } from "src/utils/deck-tags";
import { pointerCard } from "src/utils/use-pointer-card";

/**
 * How wide a card is drawn, per step
 *
 * Given as a width rather than as a column count: the readable range turned out
 * to be narrower than one column is wide, so counting columns cannot land in
 * it. The row fills itself with as many of these as the screen holds, which
 * also drops the breakpoints — the tile size is the setting, and the layout
 * follows from it at every width.
 *
 * The same numbers twice: once for the browser to lay out with, once to tell it
 * which of the two scans of a card to fetch.
 */
const WIDTHS: Record<DeckTileSize, string> = {
    xs: "9rem",
    s: "13rem",
    m: "17rem",
    l: "19rem",
    xl: "21rem",
};

/**
 * The grid a row is laid out with, per step
 *
 * Spelled out because Tailwind reads the class names out of the source; a width
 * put together at runtime is never generated.
 */
const COLUMNS: Record<DeckTileSize, string> = {
    xs: "grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-2 sm:gap-3",
    s: "grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-3",
    m: "grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 sm:gap-4",
    l: "grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3 sm:gap-4",
    xl: "grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-4",
};

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
    /** How big the cards are drawn */
    size?: DeckTileSize;
    /** Opens a card's dialog */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count, left out where the deck is only being looked at */
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    /** Takes a card out, left out where the deck is only being looked at */
    onDelete?: (card: DeckCardResponse) => void;
    /** Puts a tag on a card or takes it off, left out where it is only looked at */
    onToggleTag?: (card: DeckCardResponse, tag: DeckTagResponse, on: boolean) => void;
    /** Opens the tag manager */
    onManageTags?: () => void;
    /** Reports which card the pointer or the focus is on, for the number keys */
    onActivate?: (card: DeckCardResponse | null) => void;
    /** Whether a card is showing its back */
    isFlipped: (card: DeckCardResponse) => boolean;
    /** Turns a card over */
    onFlip: (card: DeckCardResponse) => void;
    /** Opens the card's menu where it was asked for */
    onMenu?: (card: DeckCardResponse, at: { x: number; y: number }) => void;
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
    size = "m",
    onInspect,
    onChangeQuantity,
    onDelete,
    onToggleTag,
    onManageTags,
    onActivate,
    isFlipped,
    onFlip,
    onMenu,
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
                if (key.startsWith("zone:")) return labels.zone(key.slice("zone:".length) as DeckZone);
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
                        className={clsx("grid", group.key === "zone:Commander" ? COLUMNS[bigger(size)] : COLUMNS[size])}
                    >
                        {group.cards.map((card) => (
                            <Tile
                                key={card.uuid}
                                card={card}
                                remarks={violations.get(card.uuid) ?? []}
                                tags={tags}
                                strip={onToggleTag !== undefined || tags.length > 0}
                                width={group.key === "zone:Commander" ? WIDTHS[bigger(size)] : WIDTHS[size]}
                                onInspect={onInspect}
                                onChangeQuantity={onChangeQuantity}
                                onDelete={onDelete}
                                onToggleTag={onToggleTag}
                                onManageTags={onManageTags}
                                onActivate={onActivate}
                                flipped={isFlipped(card)}
                                onFlip={() => onFlip(card)}
                                onMenu={onMenu}
                            />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

/**
 * The size a step up from this one, for the command zone
 *
 * @param size how big the deck's cards are drawn
 *
 * @returns the next size up, the largest staying where it is
 */
function bigger(size: DeckTileSize): DeckTileSize {
    switch (size) {
        case "xs":
            return "s";
        case "s":
            return "m";
        case "m":
            return "l";
        case "l":
            return "xl";
        case "xl":
            return "xl";
    }
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
    /** The tags that exist */
    tags: Array<DeckTagResponse>;
    /** Whether the line under the tile is drawn, which keeps a row even */
    strip: boolean;
    /** How wide the card ends up, so the sharper scan is only fetched where it shows */
    width: string;
    /** Opens the card's dialog */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count */
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    /** Takes the card out */
    onDelete?: (card: DeckCardResponse) => void;
    /** Puts a tag on the card or takes it off */
    onToggleTag?: (card: DeckCardResponse, tag: DeckTagResponse, on: boolean) => void;
    /** Opens the tag manager */
    onManageTags?: () => void;
    /** Reports that the pointer or the focus is on this card */
    onActivate?: (card: DeckCardResponse | null) => void;
    /** Whether this card is showing its back */
    flipped: boolean;
    /** Turns this card over */
    onFlip: () => void;
    /** Opens the card's menu where it was asked for */
    onMenu?: (card: DeckCardResponse, at: { x: number; y: number }) => void;
};

/**
 * One card of the deck, with its controls a hover away
 *
 * @returns the tile
 */
function Tile({
    card,
    remarks,
    tags,
    strip,
    width,
    onInspect,
    onChangeQuantity,
    onDelete,
    onToggleTag,
    onManageTags,
    onActivate,
    flipped,
    onFlip,
    onMenu,
}: TileProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const onSlot = tagsOn(card, tags);

    const zoneName = labels.zone(card.zone);
    const printing = card.card;
    const gameChanger = printing?.game_changer === true;
    const back = artworkOf(printing, "back");
    const showBack = back.image !== null && flipped;
    const artwork = showBack ? back : artworkOf(printing, "front");

    return (
        <li
            className={clsx("group/tile flex flex-col gap-1", CONTEXT_MENU_TARGET)}
            {...pointerCard(card.uuid)}
            onMouseEnter={() => onActivate?.(card)}
            onMouseLeave={() => onActivate?.(null)}
            onFocus={() => onActivate?.(card)}
            onBlur={() => onActivate?.(null)}
            {...(onMenu === undefined ? {} : contextMenuTrigger((at) => onMenu(card, at)))}
        >
            <div className={"relative"}>
                <button
                    type={"button"}
                    onClick={() => onInspect(card)}
                    aria-label={t("accessibility.inspect-card", {
                        name: printing?.name ?? t("label.unknown-printing"),
                    })}
                    className={
                        gameChanger
                            ? "block w-full rounded-xl ring-2 ring-amber-400/70 transition group-hover/tile:ring-amber-400 dark:ring-amber-300/60"
                            : "block w-full rounded-xl ring-1 ring-transparent transition group-focus-within/tile:ring-2 group-focus-within/tile:ring-(--color-brand-500)/70 group-hover/tile:ring-2 group-hover/tile:ring-(--color-brand-500)/70"
                    }
                >
                    <CardThumbnail
                        name={printing?.name ?? ""}
                        image={artwork.image}
                        thumbnail={artwork.thumbnail}
                        sizes={width}
                        finish={finishOf(card)}
                        className={"w-full rounded-xl"}
                    />
                </button>

                {/* Every overlay owns a fixed slot. Keeping the flip action in
                    the second slot even without a count stops it jumping when
                    quantities change. */}
                {back.image !== null && (
                    <CardFlipButton flipped={showBack} onFlip={onFlip} className={"absolute top-12 right-2"} />
                )}

                {card.zone !== "Main" && card.zone !== "Commander" && (
                    <span
                        className={
                            "pointer-events-none absolute bottom-2 left-2 rounded-(--radius-pill) bg-zinc-950/85 px-2.5 py-1 text-[0.6875rem] font-semibold text-white shadow-lg ring-1 ring-white/60 backdrop-blur-sm"
                        }
                    >
                        {zoneName}
                    </span>
                )}

                {card.quantity > 1 && (
                    <span
                        className={
                            "pointer-events-none absolute top-2 right-2 rounded-full bg-zinc-950/85 px-2.5 py-1 text-xs font-bold text-white tabular-nums shadow-lg ring-2 ring-white/75 backdrop-blur-sm"
                        }
                    >
                        ×{card.quantity}
                    </span>
                )}

                {gameChanger && (
                    <span
                        className={
                            "pointer-events-none absolute top-2 left-2 rounded-full bg-amber-400 p-1.5 text-amber-950 shadow-lg ring-2 ring-white/75"
                        }
                        title={t("label.game-changer")}
                    >
                        <TrophyIcon className={"size-4"} />
                    </span>
                )}

                {remarks.length > 0 && (
                    <span
                        className={
                            "pointer-events-none absolute top-12 left-2 rounded-full bg-amber-500 p-1.5 text-white shadow-lg ring-2 ring-white/75"
                        }
                        title={t("label.has-remark")}
                    >
                        <ExclamationTriangleIcon className={"size-4"} />
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
            </div>

            {strip && (
                <div className={"flex h-6 items-center"}>
                    {onToggleTag === undefined ? (
                        onSlot.length > 0 && (
                            <span className={"px-1.5"}>
                                <DeckTagDots tags={onSlot} />
                            </span>
                        )
                    ) : (
                        <DeckTagPicker
                            tags={tags}
                            assigned={card.tags}
                            onToggle={(tag, on) => onToggleTag(card, tag, on)}
                            onManage={onManageTags}
                            className={
                                onSlot.length > 0
                                    ? undefined
                                    : "opacity-0 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100"
                            }
                        >
                            {onSlot.length > 0 ? <DeckTagDots tags={onSlot} /> : <TagIcon className={"size-5"} />}
                        </DeckTagPicker>
                    )}
                </div>
            )}
        </li>
    );
}
