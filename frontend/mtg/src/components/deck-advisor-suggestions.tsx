import { useTranslation } from "react-i18next";
import { Suggestion, SuggestionReport } from "src/api/graph-generated";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { DeckAdvisorSuggestionRow } from "src/components/deck-advisor-suggestion-row";
import { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckAdvisorSuggestions}
 */
export type DeckAdvisorSuggestionsProps = {
    /** The report, groups included */
    report: SuggestionReport;
    /** Resolved card data by name, for artwork and the printing an add files */
    cards: Map<string, Printing>;
    /** Called with the suggestion that should go into the deck */
    onAdd: (suggestion: Suggestion) => void;
    /** Called with the suggestion that should never come back */
    onIgnore: (suggestion: Suggestion) => void;
    /** The oracle id of the card currently being added, or nothing */
    busyOracle: string | null;
};

/**
 * The ranked adds, gathered under the gap each group closes.
 *
 * The group labels and reasons come from the graph service as prose — they
 * are the analysis itself, shown as data like card names, not translated.
 *
 * @returns the grouped suggestion list
 */
export function DeckAdvisorSuggestions({ report, cards, onAdd, onIgnore, busyOracle }: DeckAdvisorSuggestionsProps) {
    const [t] = useTranslation("advisor");

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
                <DeckAdvisorNotes notes={report.notes} />
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <DeckAdvisorNotes
                notes={[
                    // The service says the commander was inferred in its notes
                    // too, but only when it also rejected a nominated one.
                    ...(report.commander_inferred
                        ? [t("description.commander-inferred", { name: report.commander ?? "" })]
                        : []),
                    ...(report.notes ?? []),
                ]}
            />
            {groups.map((group) => (
                <section key={group.key}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{group.label}</h3>
                    {group.reason !== "" && (
                        <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{group.reason}</p>
                    )}
                    <div className={"mt-1 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {group.suggestions.map((suggestion) => (
                            <DeckAdvisorSuggestionRow
                                key={suggestion.oracle_id}
                                suggestion={suggestion}
                                printing={cards.get(suggestion.name)}
                                onAdd={() => onAdd(suggestion)}
                                onIgnore={() => onIgnore(suggestion)}
                                busy={busyOracle !== null}
                            />
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
