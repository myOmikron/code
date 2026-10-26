/**
 * What Rulesets, Tournament states and Visibilities are called on the tournament pages.
 *
 * Written as `switch` statements over spelled-out translate calls, like
 * `deck-labels.ts`: the translation scanner only sees keys written inside a
 * `t(...)`.
 */

import { useTranslation } from "react-i18next";
import { BestOf, RoundState, Ruleset, Tiebreaker, TournamentState, Visibility } from "src/api/generated";

/**
 * The labels the tournament pages need
 *
 * @returns one function per thing that needs naming
 */
export function useTournamentLabels() {
    const [t] = useTranslation("tournament");

    return {
        /**
         * What a Ruleset is called
         *
         * @param ruleset the Ruleset
         *
         * @returns its name
         */
        ruleset: (ruleset: Ruleset): string => {
            switch (ruleset) {
                case Ruleset.Mtr:
                    return t("label.ruleset-mtr");
                case Ruleset.TopDeck:
                    return t("label.ruleset-top-deck");
                case Ruleset.MultiplayerAddendum:
                    return t("label.ruleset-multiplayer-addendum");
            }
        },

        /**
         * The one line under a Ruleset saying how it scores
         *
         * @param ruleset the Ruleset
         *
         * @returns its summary
         */
        rulesetDescription: (ruleset: Ruleset): string => {
            switch (ruleset) {
                case Ruleset.Mtr:
                    return t("description.ruleset-mtr");
                case Ruleset.TopDeck:
                    return t("description.ruleset-top-deck");
                case Ruleset.MultiplayerAddendum:
                    return t("description.ruleset-multiplayer-addendum");
            }
        },

        /**
         * What a Tournament state is called
         *
         * @param state the state
         *
         * @returns its name
         */
        state: (state: TournamentState): string => {
            switch (state) {
                case TournamentState.Registration:
                    return t("label.state-registration");
                case TournamentState.Swiss:
                    return t("label.state-swiss");
                case TournamentState.TopCut:
                    return t("label.state-top-cut");
                case TournamentState.Finished:
                    return t("label.state-finished");
                case TournamentState.Cancelled:
                    return t("label.state-cancelled");
            }
        },

        /**
         * How many Games a one-on-one Match is played to
         *
         * @param bestOf best of one or of three
         *
         * @returns its name
         */
        bestOf: (bestOf: BestOf): string => {
            switch (bestOf) {
                case BestOf.One:
                    return t("label.best-of-one");
                case BestOf.Three:
                    return t("label.best-of-three");
            }
        },

        /**
         * How far a Round got
         *
         * @param state the Round's state
         *
         * @returns its name
         */
        roundState: (state: RoundState): string => {
            switch (state) {
                case RoundState.Previewed:
                    return t("label.round-previewed");
                case RoundState.Running:
                    return t("label.round-running");
                case RoundState.Ended:
                    return t("label.round-ended");
            }
        },

        /**
         * How many Participants a full Match seats, as a phrase
         *
         * @param tableSize the Table size
         *
         * @returns e.g. "4 players at a table"
         */
        tableSize: (tableSize: number): string => t("label.table-size-value", { count: tableSize }),

        /**
         * What a Visibility is called
         *
         * @param visibility the Visibility
         *
         * @returns its name
         */
        visibility: (visibility: Visibility): string => {
            switch (visibility) {
                case Visibility.Private:
                    return t("label.visibility-private");
                case Visibility.Unlisted:
                    return t("label.visibility-unlisted");
                case Visibility.Public:
                    return t("label.visibility-public");
            }
        },

        /**
         * The short name of a Tiebreaker, as a column heading
         *
         * @param tiebreaker the Tiebreaker
         *
         * @returns its abbreviation, e.g. "OMW%"
         */
        tiebreaker: (tiebreaker: Tiebreaker): string => {
            switch (tiebreaker) {
                case Tiebreaker.OpponentMatchWinPercentage:
                    return t("label.tiebreaker-omw");
                case Tiebreaker.GameWinPercentage:
                    return t("label.tiebreaker-gw");
                case Tiebreaker.OpponentGameWinPercentage:
                    return t("label.tiebreaker-ogw");
            }
        },

        /**
         * What a Tiebreaker measures, in one line
         *
         * @param tiebreaker the Tiebreaker
         *
         * @returns its explanation
         */
        tiebreakerDescription: (tiebreaker: Tiebreaker): string => {
            switch (tiebreaker) {
                case Tiebreaker.OpponentMatchWinPercentage:
                    return t("description.tiebreaker-omw");
                case Tiebreaker.GameWinPercentage:
                    return t("description.tiebreaker-gw");
                case Tiebreaker.OpponentGameWinPercentage:
                    return t("description.tiebreaker-ogw");
            }
        },

        /**
         * Who a Tournament belongs to
         *
         * @param owner the Owner's username, `null` while the Tombstone holds it
         *
         * @returns the byline
         */
        organizedBy: (owner: string | null | undefined): string =>
            t("label.organized-by", { owner: owner ?? t("label.tombstone") }),
    };
}

/**
 * When a Tournament starts, as its pages show it
 *
 * @param startsAt the instant, as the api sends it
 *
 * @returns the date and the start time
 */
export function formatStart(startsAt: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(startsAt));
}
