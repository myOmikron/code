//! Client-side mirror of the backend's username rules.

// The backend rejects a malformed username while parsing the request body, which answers
// with a plain 400 instead of a form error. Checking the same rules here keeps such a
// request from ever leaving the browser, so the form can name the offending rule.

/** The shortest permitted username, mirroring `Username::MIN_LEN` */
export const USERNAME_MIN_LEN = 3;

/** The longest permitted username, mirroring `Username::MAX_LEN` */
export const USERNAME_MAX_LEN = 32;

/** Reason a string is not a valid username, mirroring the backend's `InvalidUsername` */
export type UsernameError = "length" | "charset" | "start";

/**
 * Validates a string against the backend's username rules
 *
 * @param username the string to validate
 * @returns the first rule the string breaks, or `null` if it is a valid username
 */
export function validateUsername(username: string): UsernameError | null {
    // Checked in the same order as `Username::new`, so both sides name the same rule
    if (!/^[a-zA-Z0-9_.-]*$/.test(username)) return "charset";
    if (username.length < USERNAME_MIN_LEN || username.length > USERNAME_MAX_LEN) return "length";
    if (!/^[a-zA-Z0-9]/.test(username)) return "start";
    return null;
}
