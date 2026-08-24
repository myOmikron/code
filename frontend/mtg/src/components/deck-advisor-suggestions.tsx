import { Button } from "components";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Suggestion, SuggestionReport } from "src/api/graph-generated";
import { say } from "src/utils/advisor-phrase";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { DeckAdvisorSuggestionRow } from "src/components/deck-advisor-suggestion-row";
import { DeckAdvisorWhy } from "src/components/deck-advisor-why";
import { InlineError } from "src/components/inline-error";
import { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckAdvisorSuggestions}
 */
export type DeckAdvisorSuggestionsProps = {
    /** The report, groups included */
    report: SuggestionReport;
    /** Resolved card data by name, for artwork and the printing an add files */
    cards: Map<string, Printing>;
    /** What the card lookup behind `cards` knows right now */
    cardsState: "loading" | "ready" | "error";
    /** Retries the card lookup after a failure */
    onRetryCards: () => void;
    /** Called with the suggestion that should go into the deck */
    onAdd: (suggestion: Suggestion) => void;
    /** Called with the suggestion that should never come back */
    onIgnore: (suggestion: Suggestion) => void;
    /** The oracle id of the card currently being added, or nothing */
    busyOracle: string | null;
    /** Whether this list answers the deck as it was before the last edit */
    stale?: boolean;
};

/**
 * The ranked adds, gathered under the gap each group closes.
 *
 * The group labels and reasons come from the graph service as prose — they
 * are the analysis itself, shown as data like card names, not translated.
 *
 * @returns the grouped suggestion list
 */
export function DeckAdvisorSuggestions({
    report,
    cards,
    cardsState,
    onRetryCards,
    onAdd,
    onIgnore,
    busyOracle,
    stale = false,
}: DeckAdvisorSuggestionsProps) {
    const [t] = useTranslation("advisor");
    // One breakdown open at a time: the radar is a comparison instrument, and
    // a column of them side by side is exactly the overlap it avoids.
    const [explaining, setExplaining] = useState<string | null>(null);

    // A report without groups still carries the flat ranking; one unnamed
    // group renders it the same way.
    const groups =
        report.groups !== undefined && report.groups.length > 0
            ? report.groups
            : [{ key: "all", label: t("heading.suggestions"), reason: "", suggestions: report.suggestions }];

    // An empty answer has two very different causes, and saying the wrong one
    // is the worst thing this panel can do: with no commander the service
    // could not scope the search at all, which is not the same as a deck that
    // needs nothing. The notes carry the service's own account either way.
    if (report.suggestions.length === 0) {
        return (
            <div className={"flex flex-col gap-2"}>
                <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>
                    {report.commander === null ? t("description.no-commander") : t("description.no-suggestions")}
                </p>
                <DeckAdvisorNotes notes={(report.notes ?? []).map((note) => say(t, "note", note))} />
            </div>
        );
    }

    return (
        // Dimmed while a newer answer is on its way: the list is still the
        // best thing to show, but it answers the deck as it was.
        <div className={stale ? "flex flex-col gap-6 opacity-60 transition-opacity" : "flex flex-col gap-6"}>
            <DeckAdvisorNotes
                notes={[
                    // The service says the commander was inferred in its notes
                    // too, but only when it also rejected a nominated one.
                    ...(report.commander_inferred
                        ? [t("description.commander-inferred", { name: report.commander ?? "" })]
                        : []),
                    ...(report.notes ?? []).map((note) => say(t, "note", note)),
                ]}
            />
            {/* Once per panel, not per row: a failed lookup grays out every
                Add button below, and repeating the same explanation on each
                one would just be noise beside the actual problem. */}
            {cardsState === "error" && (
                <div className={"flex items-center justify-between gap-3"}>
                    <InlineError>{t("label.card-lookup-failed")}</InlineError>
                    <Button plain onClick={onRetryCards}>
                        {t("button.retry")}
                    </Button>
                </div>
            )}
            {groups.map((group) => (
                <section key={group.key}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{group.label}</h3>
                    {group.reason !== "" && (
                        <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{group.reason}</p>
                    )}
                    <div className={"mt-1 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {group.suggestions.map((suggestion) => (
                            <Fragment key={suggestion.oracle_id}>
                                <DeckAdvisorSuggestionRow
                                    suggestion={suggestion}
                                    printing={cards.get(suggestion.name)}
                                    onAdd={() => onAdd(suggestion)}
                                    onIgnore={() => onIgnore(suggestion)}
                                    explaining={explaining === suggestion.oracle_id}
                                    onExplain={() =>
                                        setExplaining((open) =>
                                            open === suggestion.oracle_id ? null : suggestion.oracle_id,
                                        )
                                    }
                                    busy={busyOracle !== null}
                                />
                                {explaining === suggestion.oracle_id && (
                                    // Normalised against the whole report, not
                                    // this group: the peaks a card is measured
                                    // against are the batch it arrived in.
                                    <DeckAdvisorWhy suggestion={suggestion} batch={report.suggestions} />
                                )}
                            </Fragment>
                        ))}
                    </div>
                </section>
            ))}
            <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                {t("label.considered", { amount: report.considered })}
            </p>
        </div>
    );
}
