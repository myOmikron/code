import { ThemeLevel } from "src/api/generated";
import type { DateSessionResponse } from "src/api/generated";
import type { SwipeDirection } from "src/utils/dating";

/** One line of a date's chat */
export type DateMessage = {
    /** Who says it */
    from: "commander" | "player";
    /** Locale key in the dating namespace */
    key: string;
    /** The theme it is about */
    theme?: string;
    /** A level to name in it, as a locale key */
    level?: string;
    /** What it did to the chemistry */
    delta?: number;
};

/** How many proposal lines the locale files hold */
const PROPOSE_VARIANTS = 3;

/**
 * The locale key naming a level.
 *
 * @param level the level
 * @returns a `label.level-…` key
 */
export function levelKey(level: ThemeLevel): string {
    return `label.level-${level}`;
}

/** The answer each swipe of a proposal gives */
const SWIPE_LEVELS: Record<SwipeDirection, ThemeLevel> = {
    up: ThemeLevel.allin,
    right: ThemeLevel.core,
    left: ThemeLevel.avoid,
};

/**
 * The answer a swipe of the Commander's proposal gives.
 *
 * @param direction the swipe
 * @returns the level
 */
export function swipeLevel(direction: SwipeDirection): ThemeLevel {
    return SWIPE_LEVELS[direction];
}

/**
 * The way a proposal leaves after an answer.
 *
 * @param level the answer
 * @returns the swipe giving it, `null` for an answer no swipe gives
 */
export function levelSwipe(level: ThemeLevel): SwipeDirection | null {
    const directions: Array<SwipeDirection> = ["up", "right", "left"];
    return directions.find((direction) => SWIPE_LEVELS[direction] === level) ?? null;
}

/**
 * The Commander's reaction to a player's own theme, by what it did to the chemistry.
 *
 * @param delta the chemistry change
 * @returns a `description.bring-…` key
 */
export function bringReactionKey(delta: number): string {
    if (delta >= 10) return "description.bring-good";
    if (delta > 0) return "description.bring-fine";
    if (delta === 0) return "description.bring-meh";
    if (delta > -20) return "description.bring-bad";
    return "description.bring-worst";
}

/**
 * The chat a date's turns make up, ending on the Commander's open proposal.
 *
 * @param session the date
 * @returns the lines in order
 */
export function dateMessages(session: DateSessionResponse): Array<DateMessage> {
    const out: Array<DateMessage> = [];
    let proposals = 0;
    const propose = (theme: string) => {
        out.push({ from: "commander", key: `description.propose-${(proposals % PROPOSE_VARIANTS) + 1}`, theme });
        proposals += 1;
    };

    for (const turn of session.turns) {
        if (turn.by === "Commander") {
            const top = proposals === 0;
            propose(turn.label);
            out.push({ from: "player", key: levelKey(turn.level) });
            const reaction =
                turn.level === "avoid"
                    ? top
                        ? "description.react-avoid-top"
                        : "description.react-avoid"
                    : `description.react-${turn.level}`;
            out.push({ from: "commander", key: reaction, delta: turn.delta });
        } else {
            out.push({ from: "player", key: "description.bring-me", theme: turn.label, level: levelKey(turn.level) });
            out.push({ from: "commander", key: bringReactionKey(turn.delta), delta: turn.delta });
        }
    }
    if (session.next === "Commander" && session.proposal) propose(session.proposal.label);
    return out;
}
