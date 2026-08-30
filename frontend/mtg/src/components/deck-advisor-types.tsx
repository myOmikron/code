import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { TypeReport } from "src/api/graph-generated";
import { DeckAdvisorCountCards } from "src/components/deck-advisor-count-cards";
import { TargetCorridor } from "src/components/target-corridor";
import { CardArt } from "src/utils/deck-art";

/**
 * The properties for {@link DeckAdvisorTypes}
 */
export type DeckAdvisorTypesProps = {
    /** The primary-type counts as the advisor reports them */
    types: Array<TypeReport>;
    /** The deck's own artwork, for the cards behind each count */
    art: Map<string, CardArt>;
};

/**
 * Formats a weighted count without a pointless `.0`
 *
 * @param value the count, possibly fractional
 *
 * @returns the count with at most one decimal
 */
function count(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * What the deck is made of, against targets measured from decks like it.
 *
 * The material axis beside the functional one: a creature can be ramp, so a
 * deck can sit inside every role quota while holding forty creatures. The
 * rows read like the role meters so the two tabs compare at a glance, but
 * these corridors draw without handles — the targets are the service's
 * empirical read, not (yet) the builder's to move.
 *
 * @returns the meter list
 */
export function DeckAdvisorTypes({ types, art }: DeckAdvisorTypesProps) {
    const [t] = useTranslation("advisor");

    return (
        <div className={"flex flex-col gap-4"}>
            {types.map((report) => {
                // Read off the target and the deck alone, like the role
                // meters' scale — the same numbers should land at the same
                // spot on either tab.
                const scale = Math.ceil(Math.max(report.high * 1.6, report.count * 1.15, 6));
                const label = t(`label.type-${report.type.toLowerCase()}`, { defaultValue: report.type });
                const verdict =
                    report.status === "ok"
                        ? t("label.quota-inside")
                        : report.status === "low"
                          ? t("label.quota-short", { amount: count(report.deviation) })
                          : t("label.quota-over", { amount: count(report.deviation) });

                return (
                    <div key={report.type} className={"flex flex-col gap-2"}>
                        <div className={"flex items-baseline justify-between gap-x-3"}>
                            <span className={"truncate text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                                {label}
                            </span>
                            <span className={"flex shrink-0 items-baseline gap-1.5 text-xs/5 tabular-nums"}>
                                <span className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                                    <DeckAdvisorCountCards
                                        count={count(report.count)}
                                        cards={report.cards ?? []}
                                        label={t("accessibility.counted-cards", { name: label })}
                                        art={art}
                                    />
                                </span>
                                <span className={"text-zinc-400 dark:text-zinc-500"}>
                                    {t("label.quota-target", {
                                        low: count(report.low),
                                        high: count(report.high),
                                    })}
                                </span>
                            </span>
                        </div>
                        <TargetCorridor
                            low={report.low}
                            high={report.high}
                            scale={scale}
                            coverage={report.count}
                            missing={report.status !== "ok"}
                        />
                        {/* The same fixed-height verdict line as the role
                            meters, so switching tabs moves no row. */}
                        <div className={"-mt-0.5 flex h-5 items-center"}>
                            <span
                                className={clsx(
                                    "truncate text-xs/5",
                                    report.status === "ok"
                                        ? "text-zinc-400 dark:text-zinc-500"
                                        : "text-zinc-500 dark:text-zinc-400",
                                )}
                            >
                                {verdict}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
