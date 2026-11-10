import i18n from "i18next";
import { ResponseError } from "src/api/generated";

/**
 * The message for a request refused because the session impersonates an Account
 *
 * Passkeys, the Account's own Deletion and Rename, Bug reports and push subscriptions
 * answer `403` with `impersonation_active` during an Impersonation.
 *
 * @param error what the request threw
 * @returns the translated message for that refusal, `undefined` for any other failure
 */
export async function impersonationRefusal(error: unknown): Promise<string | undefined> {
    if (!(error instanceof ResponseError) || error.response.status !== 403) return undefined;
    try {
        const body: unknown = await error.response.clone().json();
        if (typeof body === "object" && body !== null && "impersonation_active" in body) {
            return i18n.t("error.impersonation-active");
        }
    } catch {
        return undefined;
    }
    return undefined;
}

/**
 * Errors that are returned to tanstack's form validator to display them
 */
export type ValidationErrors = {
    /** Errors occurred on fields */
    fields: Record<string, string>;
    /** Error on the form */
    form: string | undefined;
};

/**
 * Handle errors of FormErrors
 *
 * @param formError The error to handle
 * @param handler Handler to populate the ValidationErrors
 *
 * @returns ValidationErrors
 */
export function handleFormError<FormError extends { [Key in keyof FormError]: boolean }>(
    formError: FormError,
    handler: {
        [Key in keyof FormError]: (errors: ValidationErrors) => void;
    },
): ValidationErrors {
    const errors = {
        fields: {},
        form: undefined,
    };
    for (const [key, value] of Object.entries(formError)) {
        if (value) {
            if (key in handler) handler[key as keyof FormError](errors);
            else throw new Error("Unreachable");
        }
    }
    return errors;
}

/**
 * Helper to check if a server response is a form error
 *
 * @param res Response of the server
 * @returns the form error
 */
export function isFormError<
    T,
    E extends {
        /** Match errors that include result: Err */
        result: "Err";
    },
>(res: T | E): res is E {
    return typeof res === "object" && res !== null && "result" in res && res.result === "Err";
}
