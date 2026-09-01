import { ArrowPathIcon, BookmarkIcon, EyeSlashIcon, PlusIcon } from "@heroicons/react/20/solid";
import { Badge } from "components";
import { motion } from "motion/react";
import { Ref, memo } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { Suggestion } from "src/api/graph-generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { ManaCost } from "src/components/mana-cost";
import { RadarGlyph } from "src/components/charts/radar-glyph";
import { GameChangerMarker } from "src/components/game-changer-marker";
import { formatCurrency } from "src/utils/format";
import { Printing } from "src/utils/scryfall";
import { sayWhy } from "src/utils/advisor-phrase";
import { pointerCard } from "src/utils/use-pointer-card";
import { suggestionRadar } from "src/utils/suggestion-radar";

/**
 * The properties for {@link DeckAdvisorSuggestionTile}
 */
export type DeckAdvisorSuggestionTileProps = {
    /** The suggestion, as the graph ranked it */
    suggestion: Suggestion;
    /** The batch's per-axis peaks, which every axis is normalised against */
    peaks: Record<string, number>;
    /** The resolved card, once the catalog has placed the name */
    printing?: Printing;
    /**
     * Opens the card, its rules text and the full scoring breakdown
     *
     * Suggestion-typed rather than bound in the gallery's `.map()`, along
     * with `onAdd` and `onIgnore` below: a fresh closure per tile per render
     * would change every tile's props on every render, which defeats the
     * {@link memo} this component is wrapped in. See the gallery for the
     * stable callbacks this is called with.
     */
    onOpen: (suggestion: Suggestion) => void;
    /** Called when the card should go into the deck */
    onAdd: (suggestion: Suggestion) => void;
    /** Called when the card should be parked on the maybe list instead */
    onAddToMaybe: (suggestion: Suggestion) => void;
    /** Whether this card is already on the maybe list */
    inMaybe: boolean;
    /** Called when the card should never be suggested again */
    onIgnore: (suggestion: Suggestion) => void;
    /** Whether an add is in flight for this card, disabling the button */
    busy: boolean;
    /**
     * Handed through to the root `motion.li`.
     *
     * `AnimatePresence`'s `popLayout` mode measures an exiting tile through
     * this ref to pin it in place while it fades — a custom component sitting
     * directly under the presence has to pass it on, or the pop silently
     * cannot happen and the exit shoves the surviving tiles around.
     */
    ref?: Ref<HTMLLIElement>;
};

/**
 * The strongest single argument for a card.
 *
 * One clause, not four. The row this replaced printed every provenance entry
 * joined by a middle dot — "+0.05 synergy · in 30% of decks · Fills mana
 * sources — deck is 20.5 short at this speed · Fills synergy wincon — deck is
 * 20.3 short at this speed" — which is a paragraph of small grey text per
 * card, and nobody reads four reasons to decide one thing. The rest are on
 * the card itself, with their points.
 *
 * @param suggestion the suggestion to read
 *
 * @returns the highest-scoring positive provenance entry, or nothing
 */
function headline(suggestion: Suggestion) {
    return suggestion.provenance
        .filter((entry) => entry.score > 0)
        .reduce<
            (typeof suggestion.provenance)[number] | undefined
        >((best, entry) => (best === undefined || entry.score > best.score ? entry : best), undefined);
}

/**
 * One suggested card, artwork first.
 *
 * The card *is* the artwork — that is how a Magic player recognises one, and
 * a 40-pixel stamp beside three lines of grey text was asking them to read
 * their way to a decision they could have made by looking. Clicking it opens
 * the card properly, which is the other thing a list of cards has to allow.
 *
 * The radar glyph rides in the footer beside the reason instead of behind a
 * disclosure: whether several channels agreed about a card or one shouted is
 * the fastest signal on the tile, and it was hidden one click away while four
 * clauses of prose sat in the open.
 *
 * Adding is the one thing this whole page exists to make happen, and it used
 * to be a sixteen-pixel plus in the corner of the footer, the same size as the
 * two actions that decline the card. It is now the artwork itself: a scrim and
 * a circular button in the middle of the picture on hover or focus, so the
 * target is the card rather than a corner of it. Touch screens have no hover
 * to reveal it, so there the button sits permanently in the corner of the
 * artwork instead and the scrim never appears — a picture the reader is
 * choosing by cannot be dimmed the whole time.
 *
 * Wrapped in {@link memo}: a gallery holds ~45 of these, and a single tile
 * going busy or a report refreshing must not re-render every other one — see
 * the gallery for the stable props that make the memo comparison hold.
 *
 * `layout` plus a stable `key`/`layoutId` (the caller sets both to the oracle
 * id) is what turns a reorder or a cross-group move into a slide instead of a
 * teleport; the enter/exit spec is what a card leaving or joining the list
 * fades through instead of popping.
 *
 * @returns the tile
 */
export const DeckAdvisorSuggestionTile = memo(function DeckAdvisorSuggestionTile({
    suggestion,
    peaks,
    printing,
    onOpen,
    onAdd,
    onAddToMaybe,
    inMaybe,
    onIgnore,
    busy,
    ref,
}: DeckAdvisorSuggestionTileProps) {
    const [t] = useTranslation("advisor");

    const axes = suggestionRadar(suggestion, peaks);
    const reason = headline(suggestion);
    const channels = [...new Set(suggestion.provenance.filter((entry) => entry.score > 0).map((e) => e.channel))];
    const named = (id: string) => t(`label.axis-${id.replace(/_/g, "-")}`, { defaultValue: id.replace(/_/g, " ") });

    return (
        <motion.li
            ref={ref}
            // How the gallery knows which card the `A` key means — see
            // `usePointerCard` there, and `pointerCard` for the attribute.
            {...pointerCard(suggestion.oracle_id)}
            layout
            layoutId={suggestion.oracle_id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={
                "group flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 transition hover:shadow-(--shadow-card-md) dark:ring-white/10"
            }
        >
            <div className={"relative bg-zinc-100 dark:bg-zinc-800"}>
                <CardThumbnail
                    name={suggestion.name}
                    image={printing?.largeImageUrl ?? null}
                    thumbnail={printing?.imageUrl ?? null}
                    sizes={"(min-width: 1024px) 220px, 45vw"}
                    finish={CardFinish.Nonfoil}
                    className={"w-full transition duration-300 group-hover:scale-[1.02]"}
                />
                {/* Laid over the artwork rather than wrapped around it: the add
                    button sits on the same picture, and a button inside a
                    button is not markup a browser will accept. It comes first
                    in the tab order all the same, so a card is looked at before
                    it is taken. */}
                <button
                    type={"button"}
                    onClick={() => onOpen(suggestion)}
                    disabled={printing === undefined}
                    title={t("accessibility.open-card", { name: suggestion.name })}
                    aria-label={t("accessibility.open-card", { name: suggestion.name })}
                    className={
                        "absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-default"
                    }
                />
                {/* Under the marker, over the artwork: the trophy stays
                    readable while the picture behind it dims. Flat rather than
                    a gradient — a scrim that pools at the bottom would put its
                    darkest part exactly over the rules text. */}
                <span
                    className={
                        "pointer-events-none absolute inset-0 bg-zinc-950/40 opacity-0 transition duration-200 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:hidden"
                    }
                />
                {suggestion.game_changer === true && <GameChangerMarker variant={"overlay"} />}
                {/* The add, at the size of the decision it makes.
                    Centred and revealed with the scrim where there is a
                    pointer to reveal it; parked in the corner and always on
                    where there is not, because a touch screen has no hover and
                    a permanent scrim would hide the card it is offering.

                    Faded rather than hidden, and held back by pointer-events
                    instead: `invisible` would take the button out of the
                    accessibility tree until something inside the tile had
                    focus, so a screen reader browsing the gallery would be
                    told about a card it could look at but not add. */}
                <div
                    className={
                        "pointer-events-none absolute inset-0 flex scale-95 items-center justify-center p-2 opacity-0 transition duration-200 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:scale-100 group-hover:opacity-100 pointer-coarse:scale-100 pointer-coarse:items-end pointer-coarse:justify-end pointer-coarse:opacity-100"
                    }
                >
                    <button
                        type={"button"}
                        onClick={() => onAdd(suggestion)}
                        disabled={busy || printing === undefined}
                        title={t("accessibility.add-card", { name: suggestion.name })}
                        aria-label={t("accessibility.add-card", { name: suggestion.name })}
                        className={
                            "pointer-events-none flex size-16 items-center justify-center rounded-full bg-(--color-accent) text-(--color-accent-fg) shadow-lg ring-2 ring-white/70 transition group-focus-within:pointer-events-auto group-hover:pointer-events-auto hover:scale-105 hover:bg-(--color-brand-500) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 disabled:opacity-50 disabled:hover:scale-100 pointer-coarse:pointer-events-auto pointer-coarse:size-12"
                        }
                    >
                        {busy ? (
                            <ArrowPathIcon className={"size-7 animate-spin pointer-coarse:size-5"} />
                        ) : (
                            <PlusIcon className={"size-8 pointer-coarse:size-6"} />
                        )}
                    </button>
                </div>
            </div>

            <div className={"flex min-w-0 flex-1 flex-col gap-2 p-3"}>
                <div className={"flex items-baseline justify-between gap-2"}>
                    <span className={"truncate text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                        {suggestion.name}
                    </span>
                    {printing !== undefined && printing.manaCost !== "" && (
                        <ManaCost value={printing.manaCost} className={"shrink-0 text-xs"} />
                    )}
                </div>

                <div className={"flex flex-wrap gap-1"}>
                    {channels.map((channel) => (
                        <Badge key={channel} color={"zinc"}>
                            {t(`label.channel-${channel.replace(/_/g, "-")}`, {
                                defaultValue: channel.replace(/_/g, " "),
                            })}
                        </Badge>
                    ))}
                </div>

                <div className={"flex flex-1 items-start gap-2"}>
                    <button
                        type={"button"}
                        onClick={() => onOpen(suggestion)}
                        disabled={printing === undefined}
                        aria-label={t("accessibility.why-card", { name: suggestion.name })}
                        className={
                            "shrink-0 rounded-(--radius-control) transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)"
                        }
                    >
                        <RadarGlyph
                            size={44}
                            values={axes.map((axis) => axis.value)}
                            label={t("accessibility.radar-glyph", {
                                axes: axes
                                    .filter((axis) => axis.score > 0)
                                    .map((axis) => named(axis.id))
                                    .join(", "),
                            })}
                        />
                    </button>
                    <p className={"line-clamp-3 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {reason === undefined ? t("description.why-unstated") : sayWhy(t, reason)}
                    </p>
                </div>

                <div
                    className={
                        "flex items-center justify-between gap-2 border-t border-zinc-950/5 pt-2 dark:border-white/10"
                    }
                >
                    <span className={"text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400"}>
                        {printing?.priceEur == null ? "" : formatCurrency(printing.priceEur)}
                    </span>
                    <span className={"flex items-center gap-1"}>
                        <button
                            type={"button"}
                            onClick={() => onIgnore(suggestion)}
                            title={t("accessibility.ignore-card", { name: suggestion.name })}
                            aria-label={t("accessibility.ignore-card", { name: suggestion.name })}
                            className={
                                "rounded-(--radius-control) p-1.5 text-zinc-400 transition hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-white pointer-coarse:p-2.5"
                            }
                        >
                            <EyeSlashIcon className={"size-4"} />
                        </button>
                        <button
                            type={"button"}
                            onClick={() => onAddToMaybe(suggestion)}
                            disabled={busy || printing === undefined || inMaybe}
                            title={
                                inMaybe ? t("label.in-maybe") : t("accessibility.maybe-card", { name: suggestion.name })
                            }
                            aria-label={
                                inMaybe ? t("label.in-maybe") : t("accessibility.maybe-card", { name: suggestion.name })
                            }
                            className={
                                "rounded-(--radius-control) p-1.5 text-zinc-400 transition hover:bg-zinc-950/5 hover:text-zinc-950 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-white pointer-coarse:p-2.5"
                            }
                        >
                            <BookmarkIcon className={"size-4"} />
                        </button>
                    </span>
                </div>
            </div>
        </motion.li>
    );
});
