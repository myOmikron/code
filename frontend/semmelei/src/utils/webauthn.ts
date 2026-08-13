import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/**
 * Shape of the WebAuthn options objects produced by webauthn-rs:
 * the browser-facing options live under `publicKey`.
 */
type WebauthnOptions = {
    /** The `PublicKeyCredential*Options` consumed by the browser */
    publicKey: never;
};

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
