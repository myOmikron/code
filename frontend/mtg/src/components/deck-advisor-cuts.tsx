import { ArrowRightIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { CutCandidate, Swap } from "src/api/graph-generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { formatCurrency } from "src/utils/format";
import { say } from "src/utils/advisor-phrase";
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
};

/**
 * The properties for {@link DeckAdvisorCuts}
 */
export type DeckAdvisorCutsProps = {
    /** The proposed pairings between adds and cuts */
    swaps: Array<Swap>;
    /** Resolved card data by name, for artwork and prices */
    cards: Map<string, Printing>;
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
        const held = byCut.get(swap.cut.oracle_id) ?? { cut: swap.cut, adds: [] };
        held.adds.push({
            oracle_id: swap.add_oracle_id,
            name: swap.add_name,
            shared_roles: swap.shared_roles ?? [],
            fills: swap.fills ?? [],
        });
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
 * @returns the exchange list
 */
export function DeckAdvisorCuts({
    swaps,
    cards,
    onSwap,
    onCut,
    onKeep,
    onIgnoreAdd,
    busyOracle,
}: DeckAdvisorCutsProps) {
    const [t] = useTranslation("advisor");
    const rows = exchanges(swaps);

    if (rows.length === 0) {
        return <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{t("description.no-swaps")}</p>;
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.swaps")}</p>

            <ul className={"flex flex-col gap-3"}>
                {rows.map(({ cut, adds }) => {
                    const going = cards.get(cut.name);
                    return (
                        <li
                            key={cut.oracle_id}
                            className={
                                "grid gap-3 rounded-(--radius-card) p-3 ring-1 ring-zinc-950/5 sm:grid-cols-[minmax(0,15rem)_auto_minmax(0,1fr)] sm:items-start dark:ring-white/10"
                            }
                        >
                            {/* Left: the card being given up */}
                            <div className={"flex items-start gap-2"}>
                                <CardThumbnail
                                    name={cut.name}
                                    image={going?.largeImageUrl ?? null}
                                    thumbnail={going?.imageUrl ?? null}
                                    sizes={"40px"}
                                    finish={CardFinish.Nonfoil}
                                    className={"w-10 shrink-0"}
                                />
                                <div className={"min-w-0"}>
                                    <div className={"truncate text-sm font-medium text-zinc-950 dark:text-white"}>
                                        {cut.name}
                                    </div>
                                    {cut.type_line !== undefined && (
                                        <div className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                            {cut.type_line}
                                        </div>
                                    )}
                                    {/* The service's own account of why this
                                        card is the one to let go. */}
                                    {cut.reasons !== undefined && cut.reasons.length > 0 && (
                                        <ul className={"mt-1 flex flex-col gap-0.5"}>
                                            {cut.reasons.map((reason) => (
                                                <li
                                                    key={reason.code}
                                                    className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}
                                                >
                                                    {say(t, "cut", reason)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {/* The other two answers to an exchange.
                                        Both sit under the card they are about,
                                        because both are about the card on this
                                        side of the arrow and neither has
                                        anything to do with what is offered. */}
                                    <div className={"mt-2 flex flex-wrap items-center gap-2"}>
                                        <Button
                                            plain={true}
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

                            <ArrowRightIcon
                                className={"hidden size-4 self-center text-zinc-400 sm:block dark:text-zinc-500"}
                            />

                            {/* Right: what the freed slot buys */}
                            <div className={"divide-y divide-zinc-950/5 dark:divide-white/10"}>
                                {adds.map((add) => {
                                    const coming = cards.get(add.name);
                                    return (
                                        <div key={add.oracle_id} className={"flex items-center gap-2 py-1.5"}>
                                            <CardThumbnail
                                                name={add.name}
                                                image={coming?.largeImageUrl ?? null}
                                                thumbnail={coming?.imageUrl ?? null}
                                                sizes={"32px"}
                                                finish={CardFinish.Nonfoil}
                                                className={"w-8 shrink-0"}
                                            />
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
                                                                    {role.replace(/_/g, " ")}
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
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
