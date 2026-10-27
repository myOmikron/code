/** The search params of a route showing a Wizard */
export type WizardSearch = {
    /** ID of the current Wizard Step */
    step?: string;
};

/**
 * Parse a Wizard route's search params; use it as the route's `validateSearch`
 *
 * @param search The raw search params
 * @returns The current step, if one is given
 */
export function wizardSearchSchema(search: Record<string, unknown>): WizardSearch {
    return typeof search.step === "string" && search.step !== "" ? { step: search.step } : {};
}
