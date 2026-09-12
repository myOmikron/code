import { ChevronDownIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeckAdvisorAddRow } from "src/components/deck-advisor-add-row";
import { Printing } from "src/utils/scryfall";

/** A card offered for a freed slot */
export type SwapAdd = {
    /** Its oracle identity, which is what the deck files */
    oracle_id: string;
    /** Its name, which is how the artwork is looked up */
    name: string;
    /** The roles it shares with the card going out, so the fit is visible */
    shared_roles: Array<string>;
    /**
     * Short buckets this card joins, when the exchange is a shape fix rather
     * than a like-for-like replacement.
     *
     * The two are alternatives, not extras: a card taking a slot in the bucket
     * the deck is short of shares no role with the one it replaces — doing
     * something *different* is the entire reason it is offered — so without
     * this the row would carry no explanation at all.
     */
    fills: Array<string>;
};

/**
 * How many offers stand without asking on a phone.
 *
 * Two plus the reveal is about the height of the card being given up, which
 * keeps a whole exchange — the cut, its argument, and what it buys — inside
 * one thumb's worth of screen. A third would push the next exchange off it.
 */
const VISIBLE = 2;

/**
 * How many offers stand without asking from `sm` up.
 *
 * The offers sit beside the card being given up rather than under it, so a
 * desk has room for more of them — but only about as many as that card is
 * tall. Past four the exchange stops being a choice and becomes a list: a
 * single cut has been seen to arrive with twenty-six offers, which buries
 * every other exchange under one card's runners-up.
 */
const VISIBLE_WIDE = 4;

/**
 * The properties for {@link DeckAdvisorOfferList}
 */
export type DeckAdvisorOfferListProps = {
    /** Everything offered for this slot, best first */
    adds: Array<SwapAdd>;
    /** The card whose slot is on offer, named on every row */
    replaces: string;
    /** Resolved card data by name, for artwork and prices */
    cards: Map<string, Printing>;
    /** Opens a card, its rules text and its printing */
    onOpen: (printing: Printing) => void;
    /** Called when an offer should never be made again, anywhere */
    onIgnore: (add: SwapAdd) => void;
    /** Called to put this card in the slot and take the other one out */
    onSwap: (add: SwapAdd) => void;
    /** Whether a card is already moving, which holds every row's actions */
    busy: boolean;
};

/**
 * What one freed slot buys — the best two on a phone, the best four on a desk.
 *
 * The service happily returns five offers against a single cut, and against
 * a well-stocked one many more than that: three exchanges' worth of offers is
 * more scrolling than the deck has cards worth changing. So the tail folds
 * away at both widths, behind a row that says how much of it there is —
 * `VISIBLE` deep on a phone, `VISIBLE_WIDE` on a desk, which is why the row's
 * count is written twice and each copy shown at one width.
 *
 * Folded on arrival every time, not just the first: the reader came to see
 * their deck's exchanges, not one exchange's runners-up. Everything is still
 * in the DOM — the fold is a width thing, and a card that only exists at one
 * breakpoint is a card that cannot be found by search or read aloud.
 *
 * @returns the offers
 */
export function DeckAdvisorOfferList({
    adds,
    replaces,
    cards,
    onOpen,
    onIgnore,
    onSwap,
    busy,
}: DeckAdvisorOfferListProps) {
    const [t] = useTranslation("advisor");
    const [open, setOpen] = useState(false);

    // Two depths, so the counts on the reveal row are two counts.
    const folded = adds.length - VISIBLE;
    const foldedWide = adds.length - VISIBLE_WIDE;

    return (
        <div>
            <div className={"divide-y divide-zinc-950/5 dark:divide-white/10"}>
                {adds.map((add, index) => (
                    // Hidden by width, not by mounting: the parent exchange
                    // animates its own height, so revealing these grows the
                    // card rather than snapping it.
                    <div
                        key={add.oracle_id}
                        className={clsx(
                            !open && index >= VISIBLE && (index >= VISIBLE_WIDE ? "hidden" : "hidden sm:block"),
                        )}
                    >
                        <DeckAdvisorAddRow
                            name={add.name}
                            replaces={replaces}
                            printing={cards.get(add.name)}
                            fills={add.fills}
                            sharedRoles={add.shared_roles}
                            onOpen={onOpen}
                            onIgnore={() => onIgnore(add)}
                            onSwap={() => onSwap(add)}
                            busy={busy}
                        />
                    </div>
                ))}
            </div>

            {/* A row rather than a chevron: it sits between two other buttons
                on a touch screen, and it is the only one of the three that is
                about the list rather than about a card. Gone from `sm` up when
                the wider fold left nothing folded there. */}
            {folded > 0 && (
                <button
                    type={"button"}
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    className={clsx(
                        "mt-1 flex w-full items-center justify-center gap-1.5 rounded-(--radius-control) bg-zinc-950/4 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-950/7 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200",
                        foldedWide <= 0 && "sm:hidden",
                    )}
                >
                    {open ? (
                        t("button.fewer-offers")
                    ) : (
                        <>
                            {/* One count per width: the same row folds two
                                offers away on a phone and four on a desk, and
                                a number that is wrong at one of them is worse
                                than no number at all. */}
                            <span className={clsx(foldedWide > 0 && "sm:hidden")}>
                                {t("button.more-offers", { count: folded })}
                            </span>
                            {foldedWide > 0 && (
                                <span className={"hidden sm:inline"}>
                                    {t("button.more-offers", { count: foldedWide })}
                                </span>
                            )}
                        </>
                    )}
                    <ChevronDownIcon
                        className={clsx("size-4 transition-transform duration-200", open && "rotate-180")}
                    />
                </button>
            )}
        </div>
    );
}
