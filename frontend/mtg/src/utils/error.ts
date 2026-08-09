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
