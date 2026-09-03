import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { GroupHeading, Tile } from "src/components/deck-card-grid";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import type { DeckTileSize } from "src/components/deck-view-controls";
import { isMaybeGroup } from "src/utils/deck-grouping";
import type { DeckGroup, DeckGrouping } from "src/utils/deck-grouping";
import type { SlotViolation } from "src/utils/deck-rules";
import { useMediaQuery } from "src/utils/use-media-query";

/**
 * How many stacks stand side by side, per step of the size slider.
 *
 * The slider sets a count rather than a width here: a stack is read as a
 * column, and what matters is how many columns the screen holds.
 */
const STACKS: Record<DeckTileSize, number> = {
    "3xs": 12,
    xxs: 10,
    xs: 8,
    s: 6,
    m: 5,
    l: 4,
    xl: 3,
};

/**
 * How much of a card shows above the next one, in hundredths of the stack's width.
 *
 * A card's name band is the top eleven percent of its height, which is a
 * seventh higher than it is wide. This is that band, plus a hair so the frame
 * line under the name stays visible.
 */
const PEEK = 16;

/** A card's height in hundredths of its width */
const HEIGHT = 140;

/** What a tile carries under its artwork: the remark line and the tag strip */
const STRIP = "1.75rem";

/** What a heading adds to a stack's height, in the same hundredths */
const HEADING = 40;

/**
 * Deals the groups onto columns, each onto the shortest so far.
 *
 * Heights are estimated from the card counts alone, which is all that decides
 * them before anything opens, so the result is the same on every render.
 *
 * @param groups the groups, in reading order
 * @param count how many columns
 *
 * @returns the columns, each with its groups in reading order
 */
function distribute(groups: Array<DeckGroup>, count: number): Array<Array<DeckGroup>> {
    const columns: Array<Array<DeckGroup>> = Array.from({ length: Math.max(1, count) }, () => []);
    const heights = columns.map(() => 0);
    for (const group of groups) {
        let shortest = 0;
        for (let index = 1; index < heights.length; index++) {
            if ((heights[index] ?? 0) < (heights[shortest] ?? 0)) shortest = index;
        }
        columns[shortest]?.push(group);
        heights[shortest] = (heights[shortest] ?? 0) + HEADING + HEIGHT + PEEK * Math.max(0, group.cards.length - 1);
    }
    return columns;
}

/** What every stack is handed about the deck around it */
type StackContext = {
    /** What is wrong with each slot, by slot uuid */
    violations: Map<string, Array<SlotViolation>>;
    /** The tags that exist */
    tags: Array<DeckTagResponse>;
    /** How the tiles pick their scan, as a share of the viewport */
    width: string;
    /** Whether taps stand in for hovers */
    touch: boolean;
    /** Opens a card's details */
    onInspect: (card: DeckCardResponse) => void;
    /** Changes how many copies a slot holds */
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    /** Takes a slot out of the deck */
    onDelete?: (card: DeckCardResponse) => void;
    /** Puts a tag on a slot, or takes it off */
    onToggleTag?: (card: DeckCardResponse, tag: DeckTagResponse, on: boolean) => void;
    /** Opens the tag management */
    onManageTags?: () => void;
    /** Told which card the pointer rests on, `null` when none */
    onActivate?: (card: DeckCardResponse | null) => void;
    /** Whether a card shows its back */
    isFlipped: (card: DeckCardResponse) => boolean;
    /** Turns a card over */
    onFlip: (card: DeckCardResponse) => void;
    /** Opens a card's menu at a point */
    onMenu?: (card: DeckCardResponse, at: { x: number; y: number }) => void;
};

/**
 * The properties for {@link DeckCardStacks}
 */
export type DeckCardStacksProps = Omit<StackContext, "width" | "touch"> & {
    /** The deck, already grouped and ordered */
    groups: Array<DeckGroup>;
    /** What the groups are grouped by, which decides how they are named */
    grouping: DeckGrouping;
    /** How many stacks stand side by side, as a step of the size slider */
    size?: DeckTileSize;
    /** Whether a group is folded away */
    isCollapsed?: (key: string) => boolean;
    /** Folds a group away, or opens it again */
    onToggleGroup?: (key: string) => void;
};

/**
 * The deck as columns of cards tucked under each other, one stack per group.
 *
 * Only the name band of every card shows, the way a pile on the table reads,
 * so a whole deck fits on one screen. The stacks are dealt onto the columns
 * shortest-column-first, so a tall stack leaves no hole beside a short one,
 * and the dealing never changes while a stack opens: a stack only ever moves
 * when the deck or the column count does. Resting the pointer on a card
 * slides the cards under it down and shows it whole; on a touch screen a tap
 * does the same, and a second tap opens the card.
 *
 * @returns the stacks
 */
export function DeckCardStacks({
    groups,
    grouping,
    size = "m",
    tags,
    isCollapsed,
    onToggleGroup,
    ...context
}: DeckCardStacksProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const touch = useMediaQuery("(pointer: coarse)");
    const narrow = useMediaQuery("(max-width: 639px)");

    const across = narrow ? 2 : STACKS[size];
    const columns = distribute(groups, across);

    /**
     * What a heading shows
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
        <div className={"flex items-start gap-x-3 sm:gap-x-4"}>
            {columns.map((column, columnIndex) => (
                <div key={columnIndex} className={"flex min-w-0 flex-1 flex-col gap-8"}>
                    {column.map((group) => {
                        const maybe = isMaybeGroup(group.key);
                        const collapsed = isCollapsed?.(group.key) === true;
                        return (
                            <div
                                key={group.key}
                                className={clsx("@container flex min-w-0 flex-col gap-3", maybe && "opacity-75")}
                            >
                                <GroupHeading
                                    commander={group.key === "zone:Commander"}
                                    maybe={maybe}
                                    copies={group.copies}
                                    withMdfcs={group.withMdfcs}
                                    collapsed={collapsed}
                                    onToggle={onToggleGroup === undefined ? undefined : () => onToggleGroup(group.key)}
                                >
                                    {heading(group.key)}
                                </GroupHeading>
                                {!collapsed && (
                                    <Stack
                                        group={group}
                                        tags={tags}
                                        width={`${Math.round(100 / across)}vw`}
                                        touch={touch}
                                        {...context}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

/**
 * The properties for {@link Stack}
 */
type StackProps = StackContext & {
    /** The group the stack shows */
    group: DeckGroup;
};

/**
 * One stack: the group's cards tucked under each other, one of them open.
 *
 * Keeps which card is open to itself, so a pointer moving through one stack
 * redraws that stack and nothing else on the page.
 *
 * @returns the stack
 */
function Stack({
    group,
    violations,
    tags,
    width,
    touch,
    onInspect,
    onChangeQuantity,
    onDelete,
    onToggleTag,
    onManageTags,
    onActivate,
    isFlipped,
    onFlip,
    onMenu,
}: StackProps) {
    const [opened, setOpened] = useState<string | null>(null);
    const frame = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
        },
        [],
    );

    const cards = group.cards.length;
    const openIndex = group.cards.findIndex((card) => card.uuid === opened);
    const peek = `${PEEK}cqw`;
    const height = `${HEIGHT}cqw`;

    /**
     * Opens the card under the pointer, read off the pointer's place in the stack.
     *
     * Not from which card reports the pointer entering it: the cards move while
     * one opens, the browser reports the card that slid under the resting
     * pointer, and that card opens in turn. Working from the pointer's height
     * against where the cards are laid out breaks the chain, and a pointer
     * that has not moved never changes its mind. Read once per frame: the
     * pointer reports far more often than the screen can show, and every read
     * of the layout mid-transition costs a layout.
     *
     * @param element the list the stack is drawn in
     * @param clientY where the pointer is
     */
    function follow(element: HTMLUListElement, clientY: number) {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            const rect = element.getBoundingClientRect();
            const peekPx = (rect.width * PEEK) / 100;
            const heightPx = (rect.width * HEIGHT) / 100;
            const y = clientY - rect.top;
            let index: number;
            if (openIndex === -1) {
                index = Math.min(cards - 1, Math.floor(y / peekPx));
            } else if (y < openIndex * peekPx) {
                index = Math.floor(y / peekPx);
            } else if (y < openIndex * peekPx + heightPx) {
                index = openIndex;
            } else {
                index = Math.min(cards - 1, Math.floor((y - (heightPx - peekPx)) / peekPx));
            }
            const card = group.cards[Math.max(0, index)];
            if (card === undefined || card.uuid === opened) return;
            setOpened(card.uuid);
            onActivate?.(card);
        });
    }

    return (
        <ul
            className={"relative isolate transition-[height] duration-200 ease-out"}
            style={{
                height:
                    openIndex === -1
                        ? `calc(${peek} * ${cards - 1} + ${height} + ${STRIP})`
                        : `calc(${peek} * ${cards - 2} + ${height} * 2 + ${STRIP} * 2)`,
            }}
            onMouseMove={(event) => {
                if (!touch) follow(event.currentTarget, event.clientY);
            }}
            onMouseLeave={() => {
                if (touch) return;
                setOpened(null);
                onActivate?.(null);
            }}
        >
            {group.cards.map((card, index) => {
                const pushed = openIndex !== -1 && index > openIndex;
                const open = card.uuid === opened;
                return (
                    <Tile
                        key={card.uuid}
                        card={card}
                        remarks={violations.get(card.uuid) ?? []}
                        tags={tags}
                        strip={onToggleTag !== undefined || tags.length > 0}
                        width={width}
                        onInspect={(picked) => {
                            if (touch && !open) {
                                setOpened(picked.uuid);
                                onActivate?.(picked);
                                return;
                            }
                            onInspect(picked);
                        }}
                        onChangeQuantity={onChangeQuantity}
                        onDelete={onDelete}
                        onToggleTag={onToggleTag}
                        onManageTags={onManageTags}
                        flipped={isFlipped(card)}
                        onFlip={() => onFlip(card)}
                        onMenu={onMenu}
                        className={clsx(
                            "absolute inset-x-0 transition-transform duration-200 ease-out",
                            open && "shadow-2xl",
                        )}
                        style={{
                            top: `calc(${peek} * ${index})`,
                            zIndex: open ? cards + 1 : index,
                            transform: pushed ? `translateY(calc(${height} - ${peek} + ${STRIP}))` : undefined,
                        }}
                    />
                );
            })}
        </ul>
    );
}
