import {
    ArrowsRightLeftIcon,
    CheckIcon,
    SparklesIcon,
    MagnifyingGlassIcon,
    MinusIcon,
    PhotoIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { useDeckLabels, ZONE_ORDER } from "src/components/deck-labels";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import { canFoil, finishOf, onlyFoil } from "src/utils/deck-foil";

/** What the menu is assumed to take until it has been measured */
const ESTIMATE = { width: 260, height: 420 };

/** Below this the menu is a sheet at the bottom edge rather than a box at a point */
const SHEET_BELOW = 640;

/** Where a menu was opened */
export type MenuAt = {
    /** Distance from the left edge of the window */
    x: number;
    /** Distance from the top edge of the window */
    y: number;
};

/**
 * The properties for {@link DeckCardMenu}
 */
export type DeckCardMenuProps = {
    /** The slot the menu belongs to, `null` while no menu is open */
    card: DeckCardResponse | null;
    /** Where it was opened, `null` while no menu is open */
    at: MenuAt | null;
    /** Every tag that can go on the card */
    tags: Array<DeckTagResponse>;
    /** The zones this card may be moved to */
    zones?: Array<DeckZone>;
    /** Opens the card in full */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count */
    onChangeQuantity: (card: DeckCardResponse, quantity: number) => void;
    /** Moves the card into another zone */
    onMoveTo: (card: DeckCardResponse, zone: DeckZone) => void;
    /** Opens the print picker */
    onChangePrinting: (card: DeckCardResponse) => void;
    /** Sleeves the slot in foil, or takes the sheen off again */
    onToggleFoil: (card: DeckCardResponse, foil: boolean) => void;
    /** Puts a tag on the card or takes it off */
    onToggleTag: (card: DeckCardResponse, tag: DeckTagResponse, on: boolean) => void;
    /** Takes the card out of the deck */
    onDelete: (card: DeckCardResponse) => void;
    /** Called when the menu should close */
    onClose: () => void;
};

/**
 * Everything one card can be told, where the pointer already is.
 *
 * Right-clicking a card is the fastest route to the things that used to cost a
 * dialog: the count, the zone, the tags, the print. The menu is written here
 * rather than taken from the component library because it is anchored to a
 * point rather than to a button, which no menu in the library does.
 *
 * @returns the menu
 */
export function DeckCardMenu({
    card,
    at,
    tags,
    zones = ZONE_ORDER,
    onInspect,
    onChangeQuantity,
    onMoveTo,
    onChangePrinting,
    onToggleFoil,
    onToggleTag,
    onDelete,
    onClose,
}: DeckCardMenuProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const panel = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState(ESTIMATE);

    // Measured rather than guessed: the menu grows with the tags, and a guess
    // that is too small puts the lines at the bottom of it off the screen — on
    // the cards at the bottom of a deck, which is where it was reached for.
    useLayoutEffect(() => {
        const element = panel.current;
        if (element === null) return;
        setBox({ width: element.offsetWidth, height: element.offsetHeight });
    }, [card, tags.length]);

    useEffect(() => {
        if (card === null) return;

        /**
         * Closes the menu when the window moves under it
         *
         * @param event the keypress, for `Escape`
         */
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        // Scrolling the page moves the menu away from what it belongs to, so it
        // closes — but scrolling the menu itself is how a long one is read on a
        // phone, and that has to be left alone.
        const onScroll = (event: Event) => {
            const target = event.target;
            if (target instanceof Node && panel.current?.contains(target) === true) return;
            onClose();
        };

        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onClose);
        window.addEventListener("scroll", onScroll, true);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onClose);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [card, onClose]);

    if (card === null || at === null) return null;

    const sheet = window.innerWidth < SHEET_BELOW;
    const left = Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8));
    const top = Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8));
    const name = card.card?.name ?? t("label.unknown-printing");

    return createPortal(
        <div
            className={"fixed inset-0 z-50"}
            onClick={onClose}
            onContextMenu={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <div
                ref={panel}
                role={"menu"}
                aria-label={name}
                style={sheet ? undefined : { left, top }}
                onClick={(event) => event.stopPropagation()}
                className={clsx(
                    "fixed flex flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-zinc-950/10 backdrop-blur-xl dark:bg-zinc-800/95 dark:ring-white/10",
                    sheet
                        ? "inset-x-0 bottom-0 max-h-[55vh] rounded-b-none pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                        : "max-h-[80vh] w-64",
                )}
            >
                <p className={"shrink-0 truncate px-2.5 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400"}>
                    {name}
                </p>

                <Item icon={<PlusIcon />} onClose={onClose} onSelect={() => onChangeQuantity(card, card.quantity + 1)}>
                    {t("button.add-one")}
                </Item>
                <Item icon={<MinusIcon />} onClose={onClose} onSelect={() => onChangeQuantity(card, card.quantity - 1)}>
                    {t("button.remove-one")}
                </Item>
                <Item icon={<MagnifyingGlassIcon />} onClose={onClose} onSelect={() => onInspect(card)}>
                    {t("button.inspect-card")}
                </Item>
                <Item icon={<PhotoIcon />} shortcut={"P"} onClose={onClose} onSelect={() => onChangePrinting(card)}>
                    {t("button.change-printing")}
                </Item>
                <Item
                    icon={finishOf(card) === "Nonfoil" ? <SparklesIcon /> : <CheckIcon />}
                    shortcut={"F"}
                    disabled={!canFoil(card) || onlyFoil(card)}
                    onClose={onClose}
                    onSelect={() => onToggleFoil(card, !card.foil)}
                >
                    {t("button.use-foil")}
                </Item>

                <Divider />
                <Heading>{t("label.zone")}</Heading>
                {zones
                    .filter((zone) => zone !== card.zone)
                    .map((zone) => (
                        <Item
                            key={zone}
                            icon={<ArrowsRightLeftIcon />}
                            onClose={onClose}
                            onSelect={() => onMoveTo(card, zone)}
                        >
                            {labels.zone(zone)}
                        </Item>
                    ))}

                {tags.length > 0 && (
                    <>
                        <Divider />
                        <Heading>{t("label.tags")}</Heading>
                        {tags.map((tag, index) => (
                            <Item
                                key={tag.uuid}
                                icon={
                                    card.tags.includes(tag.uuid) ? (
                                        <CheckIcon />
                                    ) : (
                                        <DeckTagMarker color={tag.color} icon={tag.icon} size={"sm"} />
                                    )
                                }
                                shortcut={index < 9 ? String(index + 1) : undefined}
                                keepOpen={true}
                                onClose={onClose}
                                onSelect={() => onToggleTag(card, tag, !card.tags.includes(tag.uuid))}
                            >
                                {tag.name}
                            </Item>
                        ))}
                    </>
                )}

                <Divider />
                <Item icon={<TrashIcon />} tone={"danger"} onClose={onClose} onSelect={() => onDelete(card)}>
                    {t("button.remove-card")}
                </Item>
            </div>
        </div>,
        document.body,
    );
}

/**
 * The properties for {@link Item}
 */
type ItemProps = {
    /** The mark in front of the label */
    icon: ReactNode;
    /** The label */
    children: ReactNode;
    /** The key that does the same thing, if there is one */
    shortcut?: string;
    /** Whether the line is destructive */
    tone?: "danger";
    /** Whether the menu stays open after the click, for lines used in runs */
    keepOpen?: boolean;
    /** Whether the line cannot be picked, e.g. a foil that was never printed */
    disabled?: boolean;
    /** What the line does */
    onSelect: () => void;
    /** Closes the menu */
    onClose: () => void;
};

/**
 * One line of the menu
 *
 * @returns the line
 */
function Item({ icon, children, shortcut, tone, keepOpen = false, disabled = false, onSelect, onClose }: ItemProps) {
    return (
        <button
            type={"button"}
            role={"menuitem"}
            disabled={disabled}
            onClick={() => {
                onSelect();
                if (!keepOpen) onClose();
            }}
            className={clsx(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm/6 transition disabled:opacity-40 disabled:hover:bg-transparent",
                tone === "danger"
                    ? "text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
                    : "text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/10",
            )}
        >
            <span className={"flex size-4 shrink-0 items-center justify-center *:size-4"}>{icon}</span>
            <span className={"min-w-0 flex-1 truncate"}>{children}</span>
            {shortcut !== undefined && (
                <kbd className={"font-sans text-xs text-zinc-400 dark:text-zinc-500"}>{shortcut}</kbd>
            )}
        </button>
    );
}

/**
 * A hairline between two groups of lines
 *
 * @returns the divider
 */
function Divider() {
    return <span className={"my-1 h-px shrink-0 bg-zinc-950/5 dark:bg-white/10"} />;
}

/**
 * What a group of lines is about
 *
 * @param props the heading's text
 * @param props.children the text
 *
 * @returns the heading
 */
function Heading({ children }: { children: ReactNode }) {
    return <p className={"px-2.5 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"}>{children}</p>;
}
