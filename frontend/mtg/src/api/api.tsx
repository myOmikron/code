import { ERROR_STORE } from "src/context/error-context";
import {
    Configuration,
    CreateCollectionRequest,
    DefaultApi,
    NewCollectionEntry,
    RequiredError,
    ResponseError,
    SignupRequest,
    UpdateCollectionRequest,
    Visibility,
} from "src/api/generated";

/** Hyphen separated uuid */
export type UUID = string;

const configuration = new Configuration({
    basePath: window.location.origin,
});
const defaultApi = new DefaultApi(configuration);

export const Api = {
    signup: {
        begin: async (req: SignupRequest) => handleError(defaultApi.signup({ SignupRequest: req })),
    },
    // The auth ceremonies deliberately bypass `handleError`. Their callers show a message per
    // failure — an unknown username reads differently from a cancelled prompt — and
    // `handleError` would report to `ERROR_STORE` first, which replaces the entire page with
    // the router's error screen before the form ever sees the rejection.
    auth: {
        // The username picks the account; its passkeys come back as the allow-list, so the
        // authenticator knows which credential to look for.
        startLogin: (username: string) => defaultApi.startLogin({ StartLoginRequest: { username } }),
        // Answers with no body — who was logged in is read back from `account.me`, so there
        // is exactly one place the session is derived from.
        finishLogin: (credential: unknown, rememberMe: boolean) =>
            defaultApi.finishLogin({ FinishLoginRequest: { credential, remember_me: rememberMe } }),
        logout: async () => handleError(defaultApi.logout()),
    },
    accounts: {
        // Answers 401 for anyone not logged in, which is the normal case for a visitor —
        // reporting that would put the error screen in front of every public page.
        me: () => defaultApi.me(),
        passkeys: {
            list: async () => handleError(defaultApi.listPasskeys()),
            // Adding a device from an existing session; the ceremony failures are the caller's
            // to render, same as on login.
            startAdd: () => defaultApi.startAddPasskey(),
            finishAdd: (credential: unknown, label?: string) =>
                defaultApi.finishAddPasskey({ FinishAddPasskeyRequest: { credential, label } }),
            delete: async (uuid: string) => handleError(defaultApi.deletePasskey({ uuid })),
        },
    },
    collections: {
        list: async () => handleError(defaultApi.getAllCollections()),
        create: async (req: CreateCollectionRequest) =>
            handleError(defaultApi.createCollection({ CreateCollectionRequest: req })),
        update: async (uuid: UUID, req: UpdateCollectionRequest) =>
            handleError(defaultApi.updateCollection({ collection: uuid, UpdateCollectionRequest: req })),
        // Cascades to every entry in the collection.
        delete: async (uuid: UUID) => handleError(defaultApi.deleteCollection({ collection: uuid })),
        entries: {
            list: async (collection: UUID) => handleError(defaultApi.listCollectionEntries({ collection })),
            add: async (collection: UUID, entries: Array<NewCollectionEntry>) =>
                handleError(
                    defaultApi.addCollectionEntries({
                        collection,
                        AddCollectionEntriesRequest: { entries },
                    }),
                ),
            setQuantity: async (collection: UUID, entry: UUID, quantity: number) =>
                handleError(
                    defaultApi.setEntryQuantity({
                        collection,
                        entry,
                        SetEntryQuantityRequest: { quantity },
                    }),
                ),
            delete: async (collection: UUID, entry: UUID) =>
                handleError(defaultApi.deleteCollectionEntry({ collection, entry })),
        },
        // Visibility is its own endpoint, not part of `update` — switching to
        // `Unlisted` mints a share token and switching away revokes it, which is
        // not something a rename should do as a side effect.
        setVisibility: async (uuid: UUID, visibility: Visibility) =>
            handleError(
                defaultApi.setVisibilityCollection({
                    collection: uuid,
                    SetCollectionVisibilityRequest: { visibility },
                }),
            ),
    },
    register: {
        // Called twice per registration: once on mount to validate the token and read the
        // username, once on submit for the ceremony the browser actually answers. Both
        // failures are shown on the page itself, hence no `handleError` here either.
        start: (token: string) => defaultApi.startRegistration({ StartRegistrationRequest: { token } }),
        finish: (token: string, credential: unknown) =>
            defaultApi.finishRegistration({ FinishRegistrationRequest: { token, credential } }),
    },
};

/**
 * Wraps a promise returned by the generated SDK which handles its errors and returns a {@link Result}
 *
 * @param promise The promise to wrap. This should be a promise defined in the generated part of the API
 *
 * @returns a new promise with a result that wraps errors from the API
 */
export async function handleError<T>(promise: Promise<T>): Promise<T> {
    try {
        return await promise;
    } catch (e) {
        let msg;
        if (e instanceof ResponseError) {
            if (e.response.status === 401) {
                msg = e.response.statusText;
                if (!msg) msg = "Unauthorized";
            } else {
                try {
                    const err = await e.response.json();
                    msg = `${e.response.statusText}. TraceId: ${err.trace_id}`;
                } catch {
                    console.error("Got invalid json", e.response.body);
                    msg = `${e.response.statusText}. The server's response was invalid json.`;
                }
            }
        } else if (e instanceof RequiredError) {
            console.error(e);
            msg = "The server's response didn't match the spec";
        } else {
            console.error("Unknown error occurred:", e);
            msg = "Unknown error occurred";
        }
        ERROR_STORE.report(msg);
        throw msg;
    }
}
