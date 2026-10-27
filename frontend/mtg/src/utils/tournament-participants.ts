import type { DropErrors, SignUpErrors } from "src/api/generated";

/** The message of each reason a Self sign-up with an Account was refused */
const SIGN_UP_ERRORS: Record<keyof SignUpErrors, string> = {
    closed: "error.sign-up-closed",
    already_participant: "error.sign-up-already",
    full: "error.sign-up-full",
};

/** The message of each reason a Drop was refused */
const DROP_ERRORS: Record<keyof DropErrors, string> = {
    not_started: "error.drop-not-started",
    tournament_over: "error.tournament-over",
};

/**
 * The message of the first reason set in `error`, from `messages`
 *
 * @param error service refusal flags
 * @param messages one message per flag
 * @returns the Tournament translation key, `null` when no flag is set
 */
function firstReason<E extends { [Key in keyof E]: boolean }>(
    error: E,
    messages: Record<keyof E, string>,
): string | null {
    const reasons = Object.entries(messages) as Array<[keyof E, string]>;
    return reasons.find(([flag]) => error[flag])?.[1] ?? null;
}

/**
 * Explains why signing up with an Account was refused, with one message per reason.
 *
 * @param error service refusal flags
 * @returns the Tournament translation key
 */
export function signUpErrorKey(error: SignUpErrors): string {
    return firstReason(error, SIGN_UP_ERRORS) ?? "error.sign-up-closed";
}

/**
 * Explains why a Drop was refused, with one message per reason.
 *
 * @param error service refusal flags
 * @returns the Tournament translation key
 */
export function dropErrorKey(error: DropErrors): string {
    return firstReason(error, DROP_ERRORS) ?? "error.tournament-over";
}
