import {
    browserSupportsWebAuthn,
    startAuthentication,
    startRegistration,
    WebAuthnError,
} from "@simplewebauthn/browser";

/**
 * Shape of the WebAuthn options objects produced by webauthn-rs:
 * the browser-facing options live under `publicKey`.
 */
type WebauthnOptions = {
    /** The `PublicKeyCredential*Options` consumed by the browser */
    publicKey: never;
};

/**
 * Why a passkey ceremony did not go through, at the granularity a user can act on
 *
 * Shaped like the server's form errors — a struct of booleans — so the same
 * `handleFormError` maps both onto a form's validation result.
 *
 * `no_passkey_or_aborted` covers both a cancelled prompt and an authenticator that holds none
 * of the allowed credentials: the platform reports them as the same `NotAllowedError`, on
 * purpose, so that a website cannot probe which passkeys a device carries.
 */
export type PasskeyErrors = {
    /** The browser has no WebAuthn at all */
    unsupported: boolean;
    /** Not a secure context — plain http on something other than localhost */
    insecure_context: boolean;
    /** The credential belongs to a different origin than the page is running under */
    wrong_domain: boolean;
    /** Cancelled, or no matching credential on this device */
    no_passkey_or_aborted: boolean;
    /** This authenticator already holds a credential for the account */
    already_registered: boolean;
    /** The authenticator refused — no user verification set up, or an internal failure */
    authenticator_error: boolean;
    /** Nothing above matched */
    unknown: boolean;
};

/** No flag set — the starting point every classification builds on */
const NO_PASSKEY_ERROR: PasskeyErrors = {
    unsupported: false,
    insecure_context: false,
    wrong_domain: false,
    no_passkey_or_aborted: false,
    already_registered: false,
    authenticator_error: false,
    unknown: false,
};

/**
 * Classify anything thrown by a passkey ceremony
 *
 * @param error whatever the ceremony rejected with
 *
 * @returns the reason, as far as the browser lets us tell them apart
 */
export function classifyPasskeyError(error: unknown): PasskeyErrors {
    if (!browserSupportsWebAuthn()) return { ...NO_PASSKEY_ERROR, unsupported: true };
    // WebAuthn only runs in a secure context. Plain http on a LAN ip is the usual way to trip
    // over this.
    if (!window.isSecureContext) return { ...NO_PASSKEY_ERROR, insecure_context: true };

    if (error instanceof WebAuthnError) {
        switch (error.code) {
            case "ERROR_CEREMONY_ABORTED":
                return { ...NO_PASSKEY_ERROR, no_passkey_or_aborted: true };
            case "ERROR_INVALID_DOMAIN":
            case "ERROR_INVALID_RP_ID":
                return { ...NO_PASSKEY_ERROR, wrong_domain: true };
            case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
                return { ...NO_PASSKEY_ERROR, already_registered: true };
            case "ERROR_AUTHENTICATOR_GENERAL_ERROR":
            case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
            case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
            case "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG":
            case "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE":
                return { ...NO_PASSKEY_ERROR, authenticator_error: true };
            // Malformed options — the server built the challenge wrong, nothing the user can
            // do about it, so it stays a generic failure.
            case "ERROR_INVALID_USER_ID_LENGTH":
            case "ERROR_MALFORMED_PUBKEYCREDPARAMS":
                return { ...NO_PASSKEY_ERROR, unknown: true };
            // Raised verbatim by the platform; the real reason is the DOMException below.
            case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
                break;
        }
        error = error.cause;
    }

    if (error instanceof DOMException) {
        switch (error.name) {
            case "NotAllowedError":
            case "AbortError":
                return { ...NO_PASSKEY_ERROR, no_passkey_or_aborted: true };
            case "SecurityError":
                return { ...NO_PASSKEY_ERROR, wrong_domain: true };
            case "NotSupportedError":
                return { ...NO_PASSKEY_ERROR, unsupported: true };
            case "InvalidStateError":
            case "ConstraintError":
                return { ...NO_PASSKEY_ERROR, authenticator_error: true };
            default:
                break;
        }
    }

    return { ...NO_PASSKEY_ERROR, unknown: true };
}

/**
 * Run the browser part of a WebAuthn registration ceremony
 *
 * @param options the `options` object returned by the backend's register/start
 *
 * @returns the credential to pass to register/finish
 */
export async function registerPasskey(options: unknown): Promise<unknown> {
    const { publicKey } = options as WebauthnOptions;
    return await startRegistration({ optionsJSON: publicKey });
}

/**
 * Run the browser part of a WebAuthn login ceremony
 *
 * @param options the `options` object returned by the backend's login/start
 *
 * @returns the credential to pass to login/finish
 */
export async function authenticatePasskey(options: unknown): Promise<unknown> {
    const { publicKey } = options as WebauthnOptions;
    return await startAuthentication({ optionsJSON: publicKey });
}
