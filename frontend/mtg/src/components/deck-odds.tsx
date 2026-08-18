import { Label, Strong, Switch, SwitchField, Text } from "components";
import { useTranslation } from "react-i18next";
import { ManaCost } from "src/components/mana-cost";
import { useDeckFreeMulligan } from "src/utils/deck-mulligan-settings";
import type { DeckOdds, HandVerdict } from "src/utils/deck-odds";
import { verdictFor } from "src/utils/deck-odds";

/** The bar colour of each verdict */
const BAR: Record<HandVerdict, string> = {
    screwed: "bg-red-500",
    half: "bg-amber-500",
    good: "bg-(--color-success)",
    flooded: "bg-red-500",
};

/**
 * The properties for {@link DeckOddsPanel}
 */
export type DeckOddsPanelProps = {
    /** The deck whose house rule is remembered */
    deckId: string;
    /** What the deck is likely to do */
    odds: DeckOdds;
};

/**
 * What the deck is likely to do on turn one, and what it cannot pay for.
 *
 * Counting cards says what a deck holds; this says whether it works. The
 * opening hand numbers are exact rather than simulated, and the list below
 * them names the cards whose colours are not there when they are wanted, which
 * is the one mana base problem that never shows up in a curve.
 *
 * @returns the panel
 */
export function DeckOddsPanel({ deckId, odds }: DeckOddsPanelProps) {
    const [t] = useTranslation("deck");
    const [freeMulligan, setFreeMulligan] = useDeckFreeMulligan(deckId);

    if (odds.opening.deckSize === 0) return null;

    const hand = freeMulligan ? odds.opening.mulliganed : odds.opening.first;
    const label: Record<HandVerdict, string> = {
        screwed: t("label.hand-screwed"),
        half: t("label.hand-half"),
        good: t("label.hand-good"),
        flooded: t("label.hand-flooded"),
    };

    return (
        <div className={"grid gap-6 lg:grid-cols-2"}>
            <section
                className={
                    "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                }
            >
                <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.opening-hand")}</h3>
                <Text className={"mt-1 text-xs"}>
                    {t("description.opening-hand", { lands: odds.opening.lands, cards: odds.opening.deckSize })}
                </Text>

                <SwitchField className={"mt-4"}>
                    <Label className={"text-xs!"}>{t("label.free-mulligan")}</Label>
                    <Switch
                        name={"free-mulligan"}
                        color={"emerald"}
                        checked={freeMulligan}
                        onChange={setFreeMulligan}
                    />
                </SwitchField>

                <div className={"mt-4 flex flex-col gap-1.5"}>
                    <Text className={"text-xs"}>
                        {freeMulligan ? t("description.hand-mulliganed") : t("description.hand-distribution")}
                    </Text>
                    {hand.distribution.map((entry) => {
                        const verdict = verdictFor(entry.lands);
                        return (
                            <div key={entry.lands} className={"flex items-center gap-2"}>
                                <Text
                                    className={
                                        verdict === "good"
                                            ? "w-10 shrink-0 text-right text-xs font-medium text-zinc-950 tabular-nums dark:text-white"
                                            : "w-10 shrink-0 text-right text-xs tabular-nums"
                                    }
                                >
                                    {entry.lands}
                                </Text>
                                <div
                                    className={
                                        "h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"
                                    }
                                >
                                    <div
                                        className={`h-full rounded-full ${BAR[verdict]}`}
                                        style={{ width: `${Math.max(entry.chance * 100, entry.chance > 0 ? 1 : 0)}%` }}
                                    />
                                </div>
                                <Strong className={"w-12 shrink-0 text-right text-xs tabular-nums"}>
                                    {percent(entry.chance)}
                                </Strong>
                            </div>
                        );
                    })}
                </div>

                <div className={"mt-4 flex flex-col gap-3 border-t border-zinc-950/5 pt-4 dark:border-white/10"}>
                    {hand.summary.map((entry) => (
                        <Odds
                            key={entry.verdict}
                            label={label[entry.verdict]}
                            chance={entry.chance}
                            verdict={entry.verdict}
                        />
                    ))}
                </div>

                {odds.opening.colors.length > 0 && (
                    <div className={"mt-5 flex flex-col gap-2 border-t border-zinc-950/5 pt-4 dark:border-white/10"}>
                        <Text className={"text-xs"}>{t("description.opening-colors")}</Text>
                        <div className={"flex flex-wrap gap-3"}>
                            {odds.opening.colors.map((color) => (
                                <span key={color.key} className={"flex items-center gap-1.5"}>
                                    <ManaCost value={`{${color.key}}`} />
                                    <Strong className={"text-xs tabular-nums"}>{percent(color.chance)}</Strong>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <section
                className={
                    "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                }
            >
                <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.thin-support")}</h3>
                <Text className={"mt-1 text-xs"}>{t("description.thin-support")}</Text>

                {odds.thin.length === 0 ? (
                    <Text className={"mt-4 text-sm"}>{t("label.support-fine", { count: odds.checked })}</Text>
                ) : (
                    <ul className={"mt-4 flex flex-col gap-2"}>
                        {odds.thin.map((card) => (
                            <li key={`${card.uuid}-${card.color}`} className={"flex items-center gap-3"}>
                                <ManaCost value={`{${card.color}}`.repeat(card.wanted)} className={"shrink-0"} />
                                <span className={"flex min-w-0 flex-1 flex-col"}>
                                    <Strong className={"truncate text-sm"}>{card.name}</Strong>
                                    <Text className={"text-xs"}>
                                        {t("label.support-detail", {
                                            turn: card.turn,
                                            sources: card.sources,
                                        })}
                                    </Text>
                                </span>
                                <Strong className={"shrink-0 text-sm text-amber-700 tabular-nums dark:text-amber-300"}>
                                    {percent(card.chance)}
                                </Strong>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

/**
 * The properties for {@link Odds}
 */
type OddsProps = {
    /** What the number is about */
    label: string;
    /** How likely it is, between zero and one */
    chance: number;
    /** Which kind of hand it counts */
    verdict: HandVerdict;
};

/**
 * One probability as a bar and a number
 *
 * @returns the row
 */
function Odds({ label, chance, verdict }: OddsProps) {
    return (
        <div className={"flex flex-col gap-1"}>
            <div className={"flex items-baseline justify-between gap-3"}>
                <Text className={"text-xs"}>{label}</Text>
                <Strong className={"text-sm tabular-nums"}>{percent(chance)}</Strong>
            </div>
            <div className={"h-1.5 w-full overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                <div className={`h-full rounded-full ${BAR[verdict]}`} style={{ width: `${chance * 100}%` }} />
            </div>
        </div>
    );
}

/**
 * A probability as a percentage
 *
 * @param chance the probability, between zero and one
 *
 * @returns the percentage, without decimals below a tenth of a percent
 */
function percent(chance: number): string {
    return `${(chance * 100).toFixed(chance > 0 && chance < 0.01 ? 1 : 0)} %`;
}
