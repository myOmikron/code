import { ArrowTopRightOnSquareIcon, BookmarkIcon, PlusIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { ComboEntry, CombosResponse } from "src/api/graph-generated";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { CardThumbnail } from "src/components/card-thumbnail";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { InlineError } from "src/components/inline-error";
import { Printing } from "src/utils/scryfall";

/** The surface each combo list sits on, the same one the diagnostics use */
const PANEL =
    "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10";

/**
 * The properties for {@link DeckAdvisorCombos}
 */
export type DeckAdvisorCombosProps = {
    /** What the graph found, complete and one card short */
    combos: CombosResponse;
    /** Resolved card data by name, for artwork and the printing an add files */
    cards: Map<string, Printing>;
    /** What the card lookup behind `cards` knows right now */
    cardsState: "loading" | "ready" | "error";
    /** Retries the card lookup after a failure */
    onRetryCards: () => void;
    /** Called with the name and oracle id of the missing piece to add */
    onAdd: (name: string, oracleId: string) => void;
    /** Called with the name and oracle id of the missing piece to park on the maybe list */
    onAddToMaybe: (name: string, oracleId: string) => void;
    /** Oracle ids already on the maybe list, per the route loader's card list */
    maybeOracles: ReadonlySet<string>;
    /** The oracle id of the card currently being added, or nothing */
    busyOracle: string | null;
};

/**
 * One combo: its pieces, what it produces, and — when it is one card short —
 * the piece that would complete it.
 *
 * @param combo the combo, with any missing piece named
 *
 * @returns the pieces and produces line
 */
function pieces(combo: ComboEntry): string {
    return combo.card_names.filter((name) => !combo.missing.includes(name)).join(" + ");
}

/** The properties for {@link ComboThumbnails} */
type ComboThumbnailsProps = {
    /** The combo whose pieces get artwork */
    combo: ComboEntry;
    /** Resolved card data by name */
    cards: Map<string, Printing>;
    /** Opens the full card dialog for a resolved piece */
    onOpen: (printing: Printing) => void;
};

/**
 * Every piece of one combo, as artwork rather than a name in a sentence.
 *
 * The missing piece gets an accent ring and a badge instead of blending into
 * the row — it is the one piece not already in the deck, and the whole point
 * of the one-short list is to make that piece easy to add. A solid ring, not
 * a dashed one: rings are box-shadows and cannot dash.
 *
 * @returns the thumbnail strip
 */
function ComboThumbnails({ combo, cards, onOpen }: ComboThumbnailsProps) {
    const [t] = useTranslation("advisor");

    return (
        <div className={"flex flex-wrap gap-2"}>
            {combo.card_names.map((name) => {
                const printing = cards.get(name);
                const missing = combo.missing.includes(name);
                return (
                    <div key={name} className={"flex flex-col items-center gap-1"}>
                        <button
                            type={"button"}
                            disabled={printing === undefined}
                            onClick={() => printing !== undefined && onOpen(printing)}
                            aria-label={t("accessibility.open-card", { name })}
                            title={t("accessibility.open-card", { name })}
                            className={clsx(
                                "w-16 shrink-0 cursor-zoom-in rounded-(--radius-control) transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-default",
                                missing && "ring-2 ring-(--color-accent)",
                            )}
                        >
                            <CardThumbnail
                                name={name}
                                image={printing?.largeImageUrl ?? null}
                                thumbnail={printing?.imageUrl ?? null}
                                sizes={"64px"}
                                finish={CardFinish.Nonfoil}
                                className={"w-full"}
                            />
                        </button>
                        {missing && <Badge color={"amber"}>{t("label.combo-missing")}</Badge>}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * How often this combo is played, and a link to the rest of the argument.
 *
 * "How it works" genuinely is not in the payload yet — Spellbook's own
 * description is discarded at ingest — so the honest answer today is a deep
 * link to the entry it came from rather than a made-up summary.
 *
 * @returns the metadata line
 */
function ComboMeta({ combo }: { combo: ComboEntry }) {
    const [t] = useTranslation("advisor");

    return (
        <div className={"mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"}>
            <span>{t("label.combo-popularity", { count: combo.popularity })}</span>
            <a
                href={`https://commanderspellbook.com/combo/${combo.id}/`}
                target={"_blank"}
                rel={"noreferrer noopener"}
                className={"inline-flex items-center gap-1 hover:underline"}
            >
                {t("button.combo-spellbook")}
                <ArrowTopRightOnSquareIcon className={"size-3.5"} aria-hidden={"true"} />
            </a>
        </div>
    );
}

/**
 * The deck's combos, ground truth from Commander Spellbook — never inferred.
 *
 * Complete combos first, then the ones a single card short, most played
 * first, each with the missing piece one click from being in the deck.
 * Every piece is artwork, not a name in a sentence, so recognising one is as
 * fast as it is on the suggestion gallery — and every piece opens the same
 * full card dialog when clicked.
 *
 * Each list is its own panel rather than a heading inside one shared
 * surface: "in the deck" and "one card away" are different claims — a fact
 * against an offer — and the heading alone did not keep a reader from
 * scrolling one into the other.
 *
 * @returns the combo lists
 */
export function DeckAdvisorCombos({
    combos,
    cards,
    cardsState,
    onRetryCards,
    onAdd,
    onAddToMaybe,
    maybeOracles,
    busyOracle,
}: DeckAdvisorCombosProps) {
    const [t] = useTranslation("advisor");
    // Whichever piece was last clicked, across either list — the same
    // "one dialog, opened from any artwork" pattern as the cuts panel.
    const [opened, setOpened] = useState<Printing | null>(null);

    if (combos.complete.length === 0 && combos.one_short.length === 0) {
        return (
            <div className={clsx(PANEL, "gap-2")}>
                {/* A failed lookup is not the same as a deck without combos. */}
                {combos.notes.length === 0 && (
                    <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{t("description.no-combos")}</p>
                )}
                <DeckAdvisorNotes notes={combos.notes} />
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <DeckAdvisorNotes notes={combos.notes} />
            {/* Once per panel, not per row: a failed lookup grays out every
                thumbnail below, and repeating the same explanation on each
                one would just be noise beside the actual problem. */}
            {cardsState === "error" && (
                <div className={"flex items-center justify-between gap-3"}>
                    <InlineError>{t("label.card-lookup-failed")}</InlineError>
                    <Button plain onClick={onRetryCards}>
                        {t("button.retry")}
                    </Button>
                </div>
            )}
            {combos.complete.length > 0 && (
                <section className={PANEL}>
                    <h3 className={"flex items-center gap-2 text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                        {t("heading.combos-complete")}
                        <Badge color={"zinc"}>{combos.complete.length}</Badge>
                    </h3>
                    <div className={"mt-2 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {combos.complete.map((combo) => (
                            <div key={combo.id} className={"py-3"}>
                                <ComboThumbnails combo={combo} cards={cards} onOpen={setOpened} />
                                <div className={"mt-2 text-sm font-medium text-zinc-950 dark:text-white"}>
                                    {pieces(combo)}
                                </div>
                                <div className={"mt-0.5 flex flex-wrap gap-1"}>
                                    {combo.produces.map((product) => (
                                        <Badge key={product} color={"zinc"}>
                                            {product}
                                        </Badge>
                                    ))}
                                </div>
                                <ComboMeta combo={combo} />
                            </div>
                        ))}
                    </div>
                </section>
            )}
            {combos.one_short.length > 0 && (
                <section className={PANEL}>
                    <h3 className={"flex items-center gap-2 text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                        {t("heading.combos-one-short")}
                        <Badge color={"zinc"}>{combos.one_short.length}</Badge>
                    </h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("description.combos-one-short")}
                    </p>
                    <div className={"mt-2 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {combos.one_short.map((combo) => (
                            <div key={combo.id} className={"py-3"}>
                                <ComboThumbnails combo={combo} cards={cards} onOpen={setOpened} />
                                <div className={"mt-2 flex items-center gap-3"}>
                                    <div className={"min-w-0 flex-1"}>
                                        <div className={"text-sm font-medium text-zinc-950 dark:text-white"}>
                                            {combo.missing[0]}
                                        </div>
                                        <div className={"mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                            {t("label.combo-completes", { pieces: pieces(combo) })}
                                        </div>
                                        <div className={"mt-1 flex flex-wrap gap-1"}>
                                            {combo.produces.map((product) => (
                                                <Badge key={product} color={"zinc"}>
                                                    {product}
                                                </Badge>
                                            ))}
                                        </div>
                                        <ComboMeta combo={combo} />
                                    </div>
                                    <Button
                                        plain={true}
                                        disabled={
                                            busyOracle !== null ||
                                            combo.missing_oracle_id === null ||
                                            maybeOracles.has(combo.missing_oracle_id ?? "")
                                        }
                                        onClick={() => onAddToMaybe(combo.missing[0], combo.missing_oracle_id ?? "")}
                                        aria-label={t("accessibility.maybe-card", { name: combo.missing[0] })}
                                    >
                                        <BookmarkIcon />
                                    </Button>
                                    <Button
                                        plain={true}
                                        // Without an oracle id the piece cannot be
                                        // filed — the graph did not place it.
                                        disabled={busyOracle !== null || combo.missing_oracle_id === null}
                                        onClick={() => onAdd(combo.missing[0], combo.missing_oracle_id ?? "")}
                                        aria-label={t("accessibility.add-card", { name: combo.missing[0] })}
                                    >
                                        <PlusIcon />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <CardDetailDialog printing={opened} onClose={() => setOpened(null)} />
        </div>
    );
}
