import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Api } from "src/api/api";
import type { BracketRulesResponse } from "src/api/generated";
import type { BracketCandidate, BracketCounts, BracketRuleCheck } from "src/utils/deck-rules";
import { bracketBreaks, withoutCard } from "src/utils/deck-rules";

/** How many printings one flag request asks about, the service's own limit */
const FLAG_CHUNK = 500;

/** The answer for a card that breaks nothing, one stable reference */
const NONE: Array<BracketRuleCheck> = [];

/** A card that might go into the deck */
export type MarkCandidate = {
    /** The card's name */
    name: string;
    /** Scryfall's id of the printing that would be filed */
    printing: string;
};

/**
 * The rules of the deck's Bracket claim one card would break.
 *
 * @param name the card going in
 * @param cut the card it takes the place of, for a swap
 *
 * @returns the rules, read as if the card were in; empty when it breaks none
 */
export type BracketMarks = (name: string, cut?: string) => Array<BracketRuleCheck>;

/**
 * The candidates the catalog flags for any bracket rule.
 *
 * @param rules what the claimed bracket asks, `undefined` when none is claimed
 * @param candidates the cards that might go in
 *
 * @returns the flagged ones, empty while the answer is out or nothing is claimed
 */
function useFlagged(
    rules: BracketRulesResponse | undefined,
    candidates: Array<MarkCandidate>,
): Array<BracketCandidate> {
    const printings = [...new Set(candidates.map((card) => card.printing))].sort();
    const flags = useQuery({
        queryKey: ["bracket-flags", printings.join(",")],
        queryFn: async () => {
            const found = new Map<string, Omit<BracketCandidate, "name">>();
            for (let at = 0; at < printings.length; at += FLAG_CHUNK) {
                const answer = await Api.printings.bracketFlags(printings.slice(at, at + FLAG_CHUNK));
                for (const entry of answer.printings) {
                    found.set(entry.id, {
                        gameChanger: entry.game_changer,
                        massLandDenial: entry.mass_land_denial,
                        extraTurns: entry.extra_turns,
                    });
                }
            }
            return found;
        },
        enabled: rules !== undefined && printings.length > 0,
        staleTime: Infinity,
        placeholderData: keepPreviousData,
    });

    return useMemo(() => {
        if (rules === undefined || flags.data === undefined) return [];
        return candidates.flatMap((card) => {
            const found = flags.data.get(card.printing);
            return found === undefined ? [] : [{ name: card.name, ...found }];
        });
    }, [rules, flags.data, candidates]);
}

/**
 * What each candidate would do to the deck's Bracket claim, one card at a time.
 *
 * Search hits, suggestions and swap offers each stand alone: one card goes in
 * and, for a swap, one goes out. Nothing is marked for a deck that claims no
 * bracket.
 *
 * @param counts what the deck holds now
 * @param rules what the claimed bracket asks, `undefined` when none is claimed
 * @param candidates the cards that might go in, a stable reference
 *
 * @returns the lookup, stable while its inputs are, and stable in what it answers
 */
export function useBracketMarks(
    counts: BracketCounts,
    rules: BracketRulesResponse | undefined,
    candidates: Array<MarkCandidate>,
): BracketMarks {
    const flagged = useFlagged(rules, candidates);
    return useMemo(() => {
        const read = new Map<string, Array<BracketRuleCheck>>();
        return (name, cut) => {
            const card = flagged.find((entry) => entry.name === name);
            if (rules === undefined || card === undefined) return NONE;
            const key = `${name}\n${cut ?? ""}`;
            let breaks = read.get(key);
            if (breaks === undefined) {
                const before = cut === undefined ? counts : withoutCard(counts, cut);
                breaks = bracketBreaks(before, rules, [card]).get(name) ?? NONE;
                read.set(key, breaks);
            }
            return breaks;
        };
    }, [flagged, counts, rules]);
}

/**
 * What a fill would do to the deck's Bracket claim, its cards read as one step.
 *
 * @param counts what the deck holds now
 * @param rules what the claimed bracket asks, `undefined` when none is claimed
 * @param candidates the cards the fill files
 *
 * @returns per card name, the rules it breaks; a card breaking none is absent
 */
export function useBracketFillMarks(
    counts: BracketCounts,
    rules: BracketRulesResponse | undefined,
    candidates: Array<MarkCandidate>,
): Map<string, Array<BracketRuleCheck>> {
    const flagged = useFlagged(rules, candidates);
    return useMemo(
        () => (rules === undefined || flagged.length === 0 ? new Map() : bracketBreaks(counts, rules, flagged)),
        [flagged, counts, rules],
    );
}
