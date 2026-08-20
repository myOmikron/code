import { PlusIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import { useTranslation } from "react-i18next";
import { ComboEntry, CombosResponse } from "src/api/graph-generated";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";

/**
 * The properties for {@link DeckAdvisorCombos}
 */
export type DeckAdvisorCombosProps = {
    /** What the graph found, complete and one card short */
    combos: CombosResponse;
    /** Called with the name and oracle id of the missing piece to add */
    onAdd: (name: string, oracleId: string) => void;
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

/**
 * The deck's combos, ground truth from Commander Spellbook — never inferred.
 *
 * Complete combos first, then the ones a single card short, most played
 * first, each with the missing piece one click from being in the deck.
 *
 * @returns the combo lists
 */
export function DeckAdvisorCombos({ combos, onAdd, busyOracle }: DeckAdvisorCombosProps) {
    const [t] = useTranslation("advisor");

    if (combos.complete.length === 0 && combos.one_short.length === 0) {
        return (
            <div className={"flex flex-col gap-2"}>
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
            {combos.complete.length > 0 && (
                <section>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                        {t("heading.combos-complete", { amount: combos.complete.length })}
                    </h3>
                    <div className={"mt-1 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {combos.complete.map((combo) => (
                            <div key={combo.id} className={"py-2"}>
                                <div className={"text-sm font-medium text-zinc-950 dark:text-white"}>
                                    {pieces(combo)}
                                </div>
                                <div className={"mt-0.5 flex flex-wrap gap-1"}>
                                    {combo.produces.map((product) => (
                                        <Badge key={product} color={"zinc"}>
                                            {product}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            {combos.one_short.length > 0 && (
                <section>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                        {t("heading.combos-one-short", { amount: combos.one_short.length })}
                    </h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("description.combos-one-short")}
                    </p>
                    <div className={"mt-1 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {combos.one_short.map((combo) => (
                            <div key={combo.id} className={"flex items-center gap-3 py-2"}>
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
                                </div>
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
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
