import { ArrowRightIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Badge, Button } from "components";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { CutCandidate, Swap } from "src/api/graph-generated";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { CardThumbnail } from "src/components/card-thumbnail";
import { DeckAdvisorReasonChip, reasonItems } from "src/components/deck-advisor-reason-chip";
import { InlineError } from "src/components/inline-error";
import { formatCurrency } from "src/utils/format";
import { roleLabel } from "src/utils/graph-vocabulary";
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

/** One card to let go, and everything offered in its place */
type Exchange = {
    /** The card being given up */
    cut: CutCandidate;
    /** What could take its slot, best first */
    adds: Array<SwapAdd>;
    /**
     * True when at least one offer here trades this card for a stronger one
     * in the same bucket rather than answering a shape gap — `score_cuts`
     * would never have offered this card as a bare cut on its own; only the
     * pairing against a stronger add makes it fair game (see `cuts.py`'s
     * `upgrade_candidates`).
     *
     * Served by the graph since the same-bucket upgrade pairing landed;
     * typed here until the next gen-api run carries the field into the
     * generated client.
     */
    upgrade: boolean;
};

/**
 * The properties for {@link DeckAdvisorCuts}
 */
export type DeckAdvisorCutsProps = {
    /** The proposed pairings between adds and cuts */
    swaps: Array<Swap>;
    /** Resolved card data by name, for artwork and prices */
    cards: Map<string, Printing>;
    /** What the card lookup behind `cards` knows right now */
    cardsState: "loading" | "ready" | "error";
    /** Retries the card lookup after a failure */
    onRetryCards: () => void;
    /** Called to take the cut out and put the add in */
    onSwap: (cut: CutCandidate, add: SwapAdd) => void;
    /** Called to take the cut out and put nothing in */
    onCut: (cut: CutCandidate) => void;
    /** Called when the card is staying, exchange and all */
    onKeep: (cut: CutCandidate) => void;
    /** Called when a card offered for the slot should never be offered again */
    onIgnoreAdd: (add: SwapAdd) => void;
    /** The oracle id of the card currently moving, or nothing */
    busyOracle: string | null;
    /**
     * Show the cuts without their offers — no replacements, no swap buttons.
     *
     * The trim phase's contract: a deck over its size needs cards out, not
     * traded, and a replacement beside every cut would grow it right back one
     * swap at a time. The service's pairings still decide *which* cuts appear;
     * only the offers stay off screen.
     */
    cutsOnly?: boolean;
};

/**
 * Groups the service's add-centric pairings by the card being given up.
 *
 * The service pairs each add with the cuts that would make room for it, which
 * is the right question when ranking adds and the wrong way round to act on:
 * a deck is trimmed one card at a time, and the reader wants to know what
 * their slot buys. On a real list this folds ~29 pairings into ~7 exchanges.
 *
 * @param swaps the pairings as the service returned them
 *
 * @returns one entry per card that could go, in the order the service ranked
 *   the cuts
 */
function exchanges(swaps: Array<Swap>): Array<Exchange> {
    const byCut = new Map<string, Exchange>();
    for (const swap of swaps) {
        const held = byCut.get(swap.cut.oracle_id) ?? { cut: swap.cut, adds: [], upgrade: false };
        // One tile per add within a row, whatever the service sent: a doubled
        // exchange rendered as two identical offers (observed live) reads as
        // a glitch, and the second tile adds nothing the first did not.
        if (held.adds.some((add) => add.oracle_id === swap.add_oracle_id)) continue;
        held.adds.push({
            oracle_id: swap.add_oracle_id,
            name: swap.add_name,
            shared_roles: swap.shared_roles ?? [],
            fills: swap.fills ?? [],
        });
        held.upgrade ||= (swap as Swap & { upgrade?: boolean }).upgrade ?? false;
        byCut.set(swap.cut.oracle_id, held);
    }
    return [...byCut.values()];
}

/**
 * What to give up, and what it buys.
 *
 * A ranking of someone's worst cards is an opinion with nothing attached to
 * it — the service says as much, and returns cuts only alongside the adds
 * they make room for. So the exchange is the unit here: one card on the left,
 * what could take its slot on the right, and a single action that does both.
 * Cuts the service could pair with nothing are not shown at all; a list of
 * cards to delete is not advice.
 *
 * Except while trimming: `cutsOnly` hides the offers, because there the deck
 * is over its size and the reason a slot is worth freeing has to stand on its
 * own — see the prop's comment.
 *
 * @returns the exchange list
 */
export function DeckAdvisorCuts({
    swaps,
    cards,
    cardsState,
    onRetryCards,
    onSwap,
    onCut,
    onKeep,
    onIgnoreAdd,
    busyOracle,
    cutsOnly = false,
}: DeckAdvisorCutsProps) {
    const [t] = useTranslation("advisor");
    // Whichever card was last clicked. Every piece of artwork on this panel
    // opens it, the same way the gallery of adds does — a card being argued
    // about is a card somebody may want to read.
    const [opened, setOpened] = useState<Printing | null>(null);
    const rows = exchanges(swaps);

    if (rows.length === 0) {
        return <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{t("description.no-swaps")}</p>;
    }

    return (
        <div className={"flex flex-col gap-4"}>
            {/* The trim headline above the panel already says what this list
                is; the exchange explainer would promise offers it hides. */}
            {!cutsOnly && <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.swaps")}</p>}
            {/* Once per panel, not per row: a failed lookup grays out every
                Swap button below, and repeating the same explanation on each
                one would just be noise beside the actual problem. */}
            {cardsState === "error" && (
                <div className={"flex items-center justify-between gap-3"}>
                    <InlineError>{t("label.card-lookup-failed")}</InlineError>
                    <Button plain onClick={onRetryCards}>
                        {t("button.retry")}
                    </Button>
                </div>
            )}

            <ul className={"flex flex-col gap-3"}>
                <AnimatePresence mode={"popLayout"}>
                    {rows.map(({ cut, adds, upgrade }) => {
                        const going = cards.get(cut.name);
                        return (
                            <motion.li
                                key={cut.oracle_id}
                                layout
                                layoutId={cut.oracle_id}
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.97 }}
                                className={clsx(
                                    "grid gap-4 rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10",
                                    !cutsOnly && "sm:grid-cols-[minmax(0,17rem)_auto_minmax(0,1fr)] sm:items-start",
                                )}
                            >
                                {/* Left: the card being given up */}
                                <div className={"flex items-start gap-3"}>
                                    <button
                                        type={"button"}
                                        disabled={going === undefined}
                                        onClick={() => setOpened(going ?? null)}
                                        aria-label={t("accessibility.open-card", { name: cut.name })}
                                        title={t("accessibility.open-card", { name: cut.name })}
                                        className={
                                            "w-16 shrink-0 cursor-zoom-in rounded-(--radius-control) transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-default"
                                        }
                                    >
                                        <CardThumbnail
                                            name={cut.name}
                                            image={going?.largeImageUrl ?? null}
                                            thumbnail={going?.imageUrl ?? null}
                                            sizes={"64px"}
                                            finish={CardFinish.Nonfoil}
                                            className={"w-full"}
                                        />
                                    </button>
                                    <div className={"min-w-0"}>
                                        <div className={"flex items-center gap-1.5"}>
                                            <div
                                                className={
                                                    "truncate text-sm font-medium text-zinc-950 dark:text-white"
                                                }
                                            >
                                                {cut.name}
                                            </div>
                                            {/* Only a stronger same-bucket add makes this
                                            card fair game — `score_cuts` would never have
                                            offered it as a bare cut on its own. */}
                                            {upgrade && (
                                                <Badge color={"blue"} className={"shrink-0"}>
                                                    {t("label.swap-upgrade")}
                                                </Badge>
                                            )}
                                        </div>
                                        {cut.type_line !== undefined && (
                                            <div className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                                {cut.type_line}
                                            </div>
                                        )}
                                        {/* The service's own account of why this
                                        card is the one to let go — chips, so
                                        the direction of each argument reads
                                        before its wording, and so this side of
                                        the exchange speaks the same visual
                                        language as the offers opposite. */}
                                        {cut.reasons !== undefined && cut.reasons.length > 0 && (
                                            <ul className={"mt-1 flex flex-wrap gap-1"}>
                                                {cut.reasons.flatMap((reason) =>
                                                    reasonItems(reason).map((item) => (
                                                        <li key={`${reason.code}-${item ?? ""}`}>
                                                            <DeckAdvisorReasonChip reason={reason} item={item} />
                                                        </li>
                                                    )),
                                                )}
                                            </ul>
                                        )}
                                        {/* The other two answers to an exchange.
                                        Both sit under the card they are about,
                                        because both are about the card on this
                                        side of the arrow and neither has
                                        anything to do with what is offered. */}
                                        <div className={"mt-2 flex flex-wrap items-center gap-2"}>
                                            {/* With no offers on the row, cutting
                                            is the action the row exists for and
                                            dresses like it; beside offers it
                                            stays quiet and the Swap buttons
                                            carry the emphasis. */}
                                            <Button
                                                plain={!cutsOnly}
                                                outline={cutsOnly}
                                                disabled={busyOracle !== null}
                                                title={t("accessibility.cut-card", { name: cut.name })}
                                                onClick={() => onCut(cut)}
                                            >
                                                {t("button.cut-only")}
                                            </Button>
                                            <Button
                                                plain={true}
                                                disabled={busyOracle !== null}
                                                title={t("accessibility.keep-card", { name: cut.name })}
                                                onClick={() => onKeep(cut)}
                                            >
                                                {t("button.keep")}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {!cutsOnly && (
                                    <ArrowRightIcon
                                        className={
                                            "hidden size-4 self-center text-zinc-400 sm:block dark:text-zinc-500"
                                        }
                                    />
                                )}

                                {/* Right: what the freed slot buys */}
                                {!cutsOnly && (
                                    <div className={"divide-y divide-zinc-950/5 dark:divide-white/10"}>
                                        {adds.map((add) => {
                                            const coming = cards.get(add.name);
                                            return (
                                                <div key={add.oracle_id} className={"flex items-center gap-2.5 py-2"}>
                                                    <button
                                                        type={"button"}
                                                        disabled={coming === undefined}
                                                        onClick={() => setOpened(coming ?? null)}
                                                        aria-label={t("accessibility.open-card", { name: add.name })}
                                                        title={t("accessibility.open-card", { name: add.name })}
                                                        className={
                                                            "w-11 shrink-0 cursor-zoom-in rounded-(--radius-control) transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-default"
                                                        }
                                                    >
                                                        <CardThumbnail
                                                            name={add.name}
                                                            image={coming?.largeImageUrl ?? null}
                                                            thumbnail={coming?.imageUrl ?? null}
                                                            sizes={"44px"}
                                                            finish={CardFinish.Nonfoil}
                                                            className={"w-full"}
                                                        />
                                                    </button>
                                                    <div className={"min-w-0 flex-1"}>
                                                        <div
                                                            className={
                                                                "truncate text-sm font-medium text-zinc-950 dark:text-white"
                                                            }
                                                        >
                                                            {add.name}
                                                        </div>
                                                        {(add.fills.length > 0 || add.shared_roles.length > 0) && (
                                                            <div className={"mt-0.5 flex flex-wrap gap-1"}>
                                                                {/* Why this add fits this
                                                            slot rather than any.
                                                            A shortfall it answers
                                                            outranks a role it
                                                            merely shares. */}
                                                                {add.fills.map((bucket) => (
                                                                    <Badge key={bucket} color={"lime"}>
                                                                        {t("label.swap-fills", {
                                                                            bucket: t(
                                                                                `label.bucket-${bucket.replace(/_/g, "-")}`,
                                                                            ),
                                                                        })}
                                                                    </Badge>
                                                                ))}
                                                                {add.fills.length === 0 &&
                                                                    add.shared_roles.map((role) => (
                                                                        <Badge key={role} color={"zinc"}>
                                                                            {roleLabel(t, role)}
                                                                        </Badge>
                                                                    ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {coming?.priceEur != null && (
                                                        <span
                                                            className={
                                                                "shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
                                                            }
                                                        >
                                                            {formatCurrency(coming.priceEur)}
                                                        </span>
                                                    )}
                                                    {/* Same eye as the adds list, and
                                                the same meaning: this card,
                                                never again — not "not for this
                                                slot". */}
                                                    <Button
                                                        plain={true}
                                                        title={t("accessibility.ignore-card", { name: add.name })}
                                                        aria-label={t("accessibility.ignore-card", { name: add.name })}
                                                        onClick={() => onIgnoreAdd(add)}
                                                    >
                                                        <EyeSlashIcon />
                                                    </Button>
                                                    <Button
                                                        outline={true}
                                                        disabled={busyOracle !== null || coming === undefined}
                                                        onClick={() => onSwap(cut, add)}
                                                    >
                                                        {t("button.swap")}
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.li>
                        );
                    })}
                </AnimatePresence>
            </ul>

            <CardDetailDialog printing={opened} onClose={() => setOpened(null)} />
        </div>
    );
}
