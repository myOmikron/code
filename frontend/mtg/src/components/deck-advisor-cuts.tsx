import { MinusIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import { useTranslation } from "react-i18next";
import { CutCandidate, Swap } from "src/api/graph-generated";

/**
 * The properties for {@link DeckAdvisorCuts}
 */
export type DeckAdvisorCutsProps = {
    /** The cut candidates, weakest fit first */
    cuts: Array<CutCandidate>;
    /** The proposed pairings between adds and cuts */
    swaps: Array<Swap>;
    /** Called with the candidate to take one copy of out of the deck */
    onCut: (cut: CutCandidate) => void;
    /** The oracle id of the card currently being removed, or nothing */
    busyOracle: string | null;
};

/**
 * The cut candidates, and the add-for-cut pairings beneath them.
 *
 * Cuts ride along with the swaps rather than as a headline of their own: the
 * product commitment is "to add X, let one of these go", never a standalone
 * ranking of someone's deck from worst to best. The reasons come from the
 * graph service as prose and are shown as data, like the group labels.
 *
 * @returns the cut list with its pairings
 */
export function DeckAdvisorCuts({ cuts, swaps, onCut, busyOracle }: DeckAdvisorCutsProps) {
    const [t] = useTranslation("advisor");

    if (cuts.length === 0) {
        return <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>{t("description.no-cuts")}</p>;
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"divide-y divide-zinc-950/5 dark:divide-white/10"}>
                {cuts.map((cut) => (
                    <div key={cut.oracle_id} className={"flex items-center gap-3 py-2"}>
                        <div className={"min-w-0 flex-1"}>
                            <div className={"truncate text-sm font-medium text-zinc-950 dark:text-white"}>
                                {cut.name}
                            </div>
                            {cut.type_line !== undefined && (
                                <div className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                    {cut.type_line}
                                </div>
                            )}
                            {cut.reasons !== undefined && cut.reasons.length > 0 && (
                                <div className={"mt-1 flex flex-wrap gap-1"}>
                                    {cut.reasons.map((reason) => (
                                        <Badge key={reason} color={"zinc"}>
                                            {reason}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Button
                            plain={true}
                            disabled={busyOracle !== null}
                            onClick={() => onCut(cut)}
                            aria-label={t("accessibility.cut-card", { name: cut.name })}
                        >
                            <MinusIcon />
                        </Button>
                    </div>
                ))}
            </div>
            {swaps.length > 0 && (
                <section>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.swaps")}</h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.swaps")}</p>
                    <div className={"mt-1 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {swaps.map((swap) => (
                            <div
                                key={`${swap.add_oracle_id}-${swap.cut.oracle_id}`}
                                className={"flex flex-wrap items-center gap-2 py-2 text-sm"}
                            >
                                <span className={"font-medium text-zinc-950 dark:text-white"}>+ {swap.add_name}</span>
                                <span className={"text-zinc-500 dark:text-zinc-400"}>− {swap.cut.name}</span>
                                {swap.shared_roles !== undefined &&
                                    swap.shared_roles.map((role) => (
                                        <Badge key={role} color={"zinc"}>
                                            {role.replace(/_/g, " ")}
                                        </Badge>
                                    ))}
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
