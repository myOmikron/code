import { Button } from "components";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Phrase, Suggestion } from "src/api/graph-generated";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckAdvisorCardDialog } from "src/components/deck-advisor-card-dialog";
import { DeckAdvisorMoveTile } from "src/components/deck-advisor-move-tile";
import type { Move } from "src/utils/advisor-moves";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";
import { DeckAdvisorNotesDialog } from "src/components/deck-advisor-notes-dialog";
import { InlineError } from "src/components/inline-error";
import { say } from "src/utils/advisor-phrase";
import { splitNotes } from "src/utils/advisor-notes";
import type { BracketMarks } from "src/utils/use-bracket-marks";
import { Printing } from "src/utils/scryfall";
import { pointerCardOf, usePointerCard } from "src/utils/use-pointer-card";
import { useShortcuts } from "src/utils/use-shortcuts";

/**
 * The properties for {@link DeckAdvisorMoves}
 */
export type DeckAdvisorMovesProps = {
    /** What the advisor proposes, best first */
    moves: Array<Move>;
    /** Every suggestion of the report, for the card dialog's comparison */
    batch: Array<Suggestion>;
    /** The report's notes */
    notes: Array<Phrase>;
    /** Notes said before the report's own */
    lead: Array<string>;
    /** Resolved card data by name */
    cards: Map<string, Printing>;
    /** What the card lookup behind `cards` knows right now */
    cardsState: "loading" | "ready" | "error";
    /** Retries the card lookup after a failure */
    onRetryCards: () => void;
    onPrimary: (move: Move) => void;
    onIgnore: (move: Move) => void;
    onMaybe: (move: Move) => void;
    onKeep: (move: Move) => void;
    /** Oracle ids already on the maybe list */
    maybeOracles: ReadonlySet<string>;
    /** The oracle id of the card currently moving, or nothing */
    busyOracle: string | null;
    /** Theme id to label */
    themeLabels: Record<string, string>;
    /** The dimension the moves are filtered by */
    highlight: string | null;
    /** What each suggestion would do to the deck's Bracket claim */
    marks?: BracketMarks;
    /** The bracket the deck claims, `null` when it claims none */
    bracket?: number | null;
    /** Shown in place of the gallery when there is no move */
    empty: ReactNode;
};

/**
 * Every move the advisor proposes as one gallery, the same in every state of
 * the deck. `A` takes the move under the pointer.
 *
 * @returns the gallery
 */
export function DeckAdvisorMoves({
    moves,
    batch,
    notes,
    lead,
    cards,
    cardsState,
    onRetryCards,
    onPrimary,
    onIgnore,
    onMaybe,
    onKeep,
    maybeOracles,
    busyOracle,
    themeLabels,
    highlight,
    marks,
    bracket,
    empty,
}: DeckAdvisorMovesProps) {
    const [t] = useTranslation("advisor");
    const [opened, setOpened] = useState<Move | null>(null);
    const open = useCallback((move: Move) => setOpened(move), []);

    const hovered = useRef<string | null>(null);
    usePointerCard((key) => {
        hovered.current = key;
    });
    useShortcuts(
        {
            a: () => {
                const move = moves.find((entry) => entry.oracle_id === hovered.current);
                if (move !== undefined && busyOracle !== move.oracle_id) onPrimary(move);
            },
        },
        opened === null,
    );

    const { headline, shaping } = splitNotes(notes);
    const openedAdd = opened?.kind === "add" ? opened : null;
    const asMove = (suggestion: Suggestion) => moves.find((move) => move.oracle_id === suggestion.oracle_id);

    return (
        <div
            className={"flex flex-col gap-4"}
            onPointerOver={(event) => {
                hovered.current = pointerCardOf(event.target);
            }}
            onPointerLeave={() => {
                hovered.current = null;
            }}
        >
            {(lead.length > 0 || headline.length > 0 || shaping.length > 0) && (
                <div className={"flex flex-col gap-1"}>
                    <DeckAdvisorNotes notes={[...lead, ...headline.map((note) => say(t, "note", note))]} />
                    <DeckAdvisorNotesDialog notes={shaping} />
                </div>
            )}
            {cardsState === "error" && (
                <div className={"flex items-center justify-between gap-3"}>
                    <InlineError>{t("label.card-lookup-failed")}</InlineError>
                    <Button plain onClick={onRetryCards}>
                        {t("button.retry")}
                    </Button>
                </div>
            )}
            {moves.length === 0 ? (
                empty
            ) : (
                <LayoutGroup>
                    <ul
                        className={
                            "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                        }
                    >
                        <AnimatePresence mode={"popLayout"}>
                            {moves.map((move) => (
                                <DeckAdvisorMoveTile
                                    key={move.oracle_id}
                                    move={move}
                                    printing={cards.get(move.name)}
                                    themeLabels={themeLabels}
                                    highlight={highlight}
                                    onOpen={open}
                                    onPrimary={onPrimary}
                                    onIgnore={onIgnore}
                                    onMaybe={onMaybe}
                                    inMaybe={maybeOracles.has(move.oracle_id)}
                                    onKeep={onKeep}
                                    busy={busyOracle === move.oracle_id}
                                    breaks={move.kind === "add" ? marks?.(move.name) : undefined}
                                    bracket={bracket}
                                />
                            ))}
                        </AnimatePresence>
                    </ul>
                </LayoutGroup>
            )}

            <DeckAdvisorCardDialog
                suggestion={openedAdd?.suggestion ?? null}
                batch={batch}
                printing={openedAdd === null ? null : (cards.get(openedAdd.name) ?? null)}
                onAdd={(suggestion) => {
                    const move = asMove(suggestion);
                    if (move !== undefined) onPrimary(move);
                }}
                onAddToMaybe={(suggestion) => {
                    const move = asMove(suggestion);
                    if (move !== undefined) onMaybe(move);
                }}
                inMaybe={openedAdd !== null && maybeOracles.has(openedAdd.oracle_id)}
                onIgnore={(suggestion) => {
                    const move = asMove(suggestion);
                    if (move !== undefined) onIgnore(move);
                }}
                onClose={() => setOpened(null)}
                busy={openedAdd !== null && busyOracle === openedAdd.oracle_id}
            />
            <CardDetailDialog
                printing={opened?.kind === "cut" ? (cards.get(opened.name) ?? null) : null}
                onClose={() => setOpened(null)}
            />
        </div>
    );
}
