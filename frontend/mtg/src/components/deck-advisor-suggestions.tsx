import { Button } from "components";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Suggestion, SuggestionReport } from "src/api/graph-generated";
import { say } from "src/utils/advisor-phrase";
import { batchPeaks } from "src/utils/suggestion-radar";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { DeckAdvisorCardDialog } from "src/components/deck-advisor-card-dialog";
import { DeckAdvisorSuggestionTile } from "src/components/deck-advisor-suggestion-tile";
import { InlineError } from "src/components/inline-error";
import { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckAdvisorSuggestions}
 */
export type DeckAdvisorSuggestionsProps = {
    /**
     * The report to render, groups included.
     *
     * May already have accepted cards filtered out of it (see the route,
     * which does this so an accepted card leaves the gallery instantly) — the
     * radar normalisation deliberately does not read this, see `batch` below.
     */
    report: SuggestionReport;
    /**
     * Every suggestion the current report ranked, unfiltered — what each
     * tile's radar is normalised against.
     *
     * Kept apart from `report` on purpose: if a filtered-out card's score fed
     * into `report` were used for the peaks, the remaining tiles' radar shapes
     * would jump every time a peer left the screen, which is exactly the
     * visual noise this whole page is trying to remove.
     */
    batch: Array<Suggestion>;
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
};

/**
 * One row per oracle identity, keeping the first.
 *
 * Defensive rather than corrective: the service ranks distinct cards, and a
 * deck holding a card twice is not offered it again. But the rows are keyed by
 * oracle id, so a repeat inside one list would hand React two identical keys —
 * and a silently dropped row is a far better failure than a scrambled list.
 *
 * @param suggestions one list, as the report groups them
 *
 * @returns the same list, at most one row per card
 */
function distinct(suggestions: Array<Suggestion>): Array<Suggestion> {
    const seen = new Set<string>();
    return suggestions.filter((suggestion) => {
        if (seen.has(suggestion.oracle_id)) return false;
        seen.add(suggestion.oracle_id);
        return true;
    });
}

/**
 * The ranked adds as a gallery, gathered under the gap each group closes.
 *
 * A gallery rather than a list, because a Magic player recognises a card by
 * looking at it: the artwork carries the name, the type, the era and half the
 * rules text at a glance, and the list this replaced spent its width on four
 * clauses of grey prose beside a forty-pixel stamp. Each tile now shows the
 * silhouette of *why* it is here, one clause saying what argued loudest, and
 * opens the card properly when the artwork is clicked.
 *
 * The group labels and reasons come from the graph service as prose — they
 * are the analysis itself, shown as data like card names, not translated.
 *
 * Every tile in every group shares one `LayoutGroup`, so a card that moves
 * from one group to another between reports crossfades across that boundary
 * instead of unmounting from one list and popping into the next; within a
 * group, `AnimatePresence` is what lets a removed card fade out while its
 * neighbours slide up to close the gap.
 *
 * @returns the grouped gallery
 */
export function DeckAdvisorSuggestions({
    report,
    batch,
    cards,
    cardsState,
    onRetryCards,
    onAdd,
    onIgnore,
    busyOracle,
}: DeckAdvisorSuggestionsProps) {
    const [t] = useTranslation("advisor");
    // The card being looked at, by oracle id. Held rather than the suggestion
    // itself so a refetch that rebuilds the list keeps the dialog on the card
    // it was opened for.
    const [opened, setOpened] = useState<string | null>(null);
    // One stable function for every tile to call, rather than a fresh closure
    // per tile per render — see the tile's own doc comment for why that
    // matters for its memo.
    const openSuggestion = useCallback((suggestion: Suggestion) => setOpened(suggestion.oracle_id), []);
    // Computed once per report rather than once per tile: every axis a tile
    // draws is normalised against these same peaks, so recomputing them per
    // tile was O(n²) for no reason.
    const peaks = useMemo(() => batchPeaks(batch), [batch]);

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

    const openedSuggestion = batch.find((entry) => entry.oracle_id === opened) ?? null;

    return (
        <div className={"flex flex-col gap-6"}>
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
            <LayoutGroup>
                {groups.map((group) => (
                    <section key={group.key}>
                        <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{group.label}</h3>
                        {group.reason !== "" && (
                            <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{group.reason}</p>
                        )}
                        <ul
                            className={
                                "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                            }
                        >
                            <AnimatePresence mode={"popLayout"}>
                                {distinct(group.suggestions).map((suggestion) => (
                                    <DeckAdvisorSuggestionTile
                                        key={suggestion.oracle_id}
                                        suggestion={suggestion}
                                        peaks={peaks}
                                        printing={cards.get(suggestion.name)}
                                        onOpen={openSuggestion}
                                        onAdd={onAdd}
                                        onIgnore={onIgnore}
                                        busy={busyOracle === suggestion.oracle_id}
                                    />
                                ))}
                            </AnimatePresence>
                        </ul>
                    </section>
                ))}
            </LayoutGroup>
            <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                {t("label.considered", { amount: report.considered })}
            </p>

            <DeckAdvisorCardDialog
                suggestion={openedSuggestion}
                batch={batch}
                printing={openedSuggestion === null ? null : (cards.get(openedSuggestion.name) ?? null)}
                onAdd={onAdd}
                onIgnore={onIgnore}
                onClose={() => setOpened(null)}
                // Guarded on `opened` rather than just `busyOracle === opened`:
                // both are `null` while the dialog is closed, and the button
                // this drives is unrendered then anyway, but the comparison
                // should not read as "busy" for that reason.
                busy={opened !== null && busyOracle === opened}
            />
        </div>
    );
}
