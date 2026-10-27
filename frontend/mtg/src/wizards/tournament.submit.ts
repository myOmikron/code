import type { WizardSubmitError, WizardSubmitResult, WizardValues } from "components";
import { Api } from "src/api/api";
import type { TournamentResponse, TournamentSettingsErrors, TournamentSettingsRequest } from "src/api/generated";
import { isFormError } from "src/utils/error";
import { fromLocalInput } from "src/utils/tournament-settings";
import { entryFeeAmount } from "src/wizards/field-types/entry-fee";
import type { tournamentWizard } from "src/wizards/tournament.wizard";

/** The values a completed run of the Tournament Wizard submits */
export type TournamentWizardValues = WizardValues<typeof tournamentWizard>;

/** Where each error of the service is shown, and as which key of the Wizard's namespace */
const SUBMIT_ERRORS: Record<keyof TournamentSettingsErrors, WizardSubmitError<typeof tournamentWizard>> = {
    table_size_out_of_range: { field: "rules", key: "error.table-size-out-of-range", namespace: "wizard" },
    ruleset_mismatch: { field: "rules", key: "error.ruleset-mismatch", namespace: "wizard" },
    unknown_format: { field: "rules", key: "error.unknown-format", namespace: "wizard" },
    best_of_mismatch: { field: "rules", key: "error.best-of-mismatch", namespace: "wizard" },
    top_cut_mismatch: { field: "rules", key: "error.top-cut-mismatch", namespace: "wizard" },
    top_cut_best_of_mismatch: { field: "rules", key: "error.top-cut-best-of-mismatch", namespace: "wizard" },
    rules_locked: { field: "rules", key: "error.ruleset-mismatch", namespace: "wizard" },
    top_cut_locked: { field: "rules", key: "error.top-cut-mismatch", namespace: "wizard" },
    round_minutes_out_of_range: { field: "roundMinutes", key: "error.round-minutes-out-of-range", namespace: "wizard" },
    participant_limit_too_small: {
        field: "participantLimit",
        key: "error.participant-limit-too-small",
        namespace: "wizard",
    },
    self_sign_up_needs_visibility: {
        field: "selfSignUp",
        key: "error.self-sign-up-needs-visibility",
        namespace: "wizard",
    },
    entry_fee_not_positive: { field: "entryFee", key: "error.entry-fee-invalid", namespace: "wizard" },
    unknown_currency: { field: "entryFee", key: "error.entry-fee-invalid", namespace: "wizard" },
    check_in_deck_for_limited: { field: "checkIn", key: "error.check-in-deck-for-limited", namespace: "wizard" },
};

/**
 * The settings a completed run of the Tournament Wizard asks the service for
 *
 * @param values the submitted values
 *
 * @returns the request
 */
export function tournamentRequest(values: TournamentWizardValues): TournamentSettingsRequest {
    const { rules } = values;
    const duel = rules.tableSize === 2;
    const fee = entryFeeAmount(values.entryFee);
    return {
        name: values.name,
        description: values.description === "" ? null : values.description,
        location: values.location === "" ? null : values.location,
        starts_at: fromLocalInput(values.startsAt).toISOString(),
        table_size: rules.tableSize,
        ruleset: rules.ruleset,
        format: rules.format,
        visibility: values.visibility,
        participant_limit: values.participantLimit,
        self_sign_up: values.selfSignUp ?? false,
        best_of: duel ? rules.bestOf : null,
        round_minutes: values.roundMinutes,
        top_cut: rules.topCut,
        top_cut_best_of: duel && rules.topCut !== null ? rules.topCutBestOf : null,
        entered_afterwards: values.enteredAfterwards,
        entry_fee: fee === null ? null : { amount: fee, currency: values.entryFee.currency },
        check_in: values.checkIn,
    };
}

/**
 * Create the Tournament a run of the Tournament Wizard describes
 *
 * @param values the submitted values
 * @param onCreated called with the Tournament once the service created it
 *
 * @returns the Wizard's submit result, with what the service rejected
 */
export async function createTournament(
    values: TournamentWizardValues,
    onCreated: (tournament: TournamentResponse) => void,
): Promise<WizardSubmitResult<typeof tournamentWizard>> {
    const response = await Api.tournaments.create(tournamentRequest(values));
    if (isFormError(response)) {
        const rejected = Object.entries(response.error) as Array<[keyof TournamentSettingsErrors, boolean]>;
        return { ok: false, errors: rejected.filter(([, set]) => set).map(([error]) => SUBMIT_ERRORS[error]) };
    }
    onCreated(response);
    return { ok: true };
}
