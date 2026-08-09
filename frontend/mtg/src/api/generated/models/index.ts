/* tslint:disable */
/* eslint-disable */
/**
 * Request to file stacks into a collection
 * @export
 * @interface AddCollectionEntriesRequest
 */
export interface AddCollectionEntriesRequest {
    /**
     * The stacks to file
     * @type {Array<NewCollectionEntry>}
     * @memberof AddCollectionEntriesRequest
     */
    entries: Array<NewCollectionEntry>;
}
/**
 * Why a passkey could not be added
 * @export
 * @interface AddPasskeyErrors
 */
export interface AddPasskeyErrors {
    /**
     * This authenticator already holds a passkey for this account
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    already_registered: boolean;
    /**
     * The browser's response was not a credential
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `passkeys/start` was never called
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    no_ceremony: boolean;
    /**
     * The credential did not check out
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    registration_failed: boolean;
}
/**
 * The response that is sent in a case of an error the caller should report to an admin
 * @export
 * @interface ApiErrorResponse
 */
export interface ApiErrorResponse {
    /**
     * ID of the opentelemetry trace this error originated in
     * @type {string}
     * @memberof ApiErrorResponse
     */
    trace_id: string;
}

/**
 * Condition of a physical card, using Cardmarket's grades
 * 
 * The order of the variants is the grading scale, best first. Keep it that way — comparisons and sorting read better than a separate rank function.
 * @export
 */
export const CardCondition = {
    /**
    * Mint
    */
    Mint: 'Mint',
    /**
    * Near Mint
    */
    NearMint: 'NearMint',
    /**
    * Excellent
    */
    Excellent: 'Excellent',
    /**
    * Good
    */
    Good: 'Good',
    /**
    * Light Played
    */
    LightPlayed: 'LightPlayed',
    /**
    * Played
    */
    Played: 'Played',
    /**
    * Poor
    */
    Poor: 'Poor'
} as const;
export type CardCondition = typeof CardCondition[keyof typeof CardCondition];


/**
 * Finish of a physical card, mirroring Scryfall's `finishes`
 * 
 * These three are the complete set — Scryfall documents `finishes` as exactly `nonfoil`, `foil` and `etched`, and prices it accordingly (`eur`/`eur_foil`, `usd`/`usd_foil`/`usd_etched`).
 * 
 * Special treatments such as surge, textured, galaxy or neon ink are **not** finishes: they live in Scryfall's `promo_types`/`frame_effects` and get their own collector number, hence their own printing id. Adding them here would encode the same fact twice and allow combinations that cannot exist. A finish only ever describes what varies *within* one printing.
 * @export
 */
export const CardFinish = {
    /**
    * Regular, non-foil
    */
    Nonfoil: 'Nonfoil',
    /**
    * Traditional foil
    */
    Foil: 'Foil',
    /**
    * Etched foil
    */
    Etched: 'Etched'
} as const;
export type CardFinish = typeof CardFinish[keyof typeof CardFinish];

/**
 * One stack of identical cards in a collection
 * @export
 * @interface CollectionEntryResponse
 */
export interface CollectionEntryResponse {
    /**
     * The day the cards were acquired
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    acquired_at?: string | null;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof CollectionEntryResponse
     */
    condition: CardCondition;
    /**
     * When the stack was filed
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    created_at: string;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof CollectionEntryResponse
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing — the client resolves name and image from it
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     * @type {number}
     * @memberof CollectionEntryResponse
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies this stack holds
     * @type {number}
     * @memberof CollectionEntryResponse
     */
    quantity: number;
    /**
     * Primary key
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    uuid: string;
}


/**
 * 
 * @export
 * @interface CollectionResponse
 */
export interface CollectionResponse {
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    description: string;
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    share_token?: string | null;
    /**
     * Wrapper for the primary key of the [`Collection`] model. To have better distinguishable types.
     * @type {string}
     * @memberof CollectionResponse
     */
    uuid: string;
    /**
     * 
     * @type {Visibility}
     * @memberof CollectionResponse
     */
    visibility: Visibility;
}


/**
 * 
 * @export
 * @interface CreateCollectionRequest
 */
export interface CreateCollectionRequest {
    /**
     * 
     * @type {string}
     * @memberof CreateCollectionRequest
     */
    description: string;
    /**
     * 
     * @type {string}
     * @memberof CreateCollectionRequest
     */
    name: string;
    /**
     * 
     * @type {Visibility}
     * @memberof CreateCollectionRequest
     */
    visibility: Visibility;
}


/**
 * Why a passkey could not be deleted
 * @export
 * @interface DeletePasskeyErrors
 */
export interface DeletePasskeyErrors {
    /**
     * It is the account's only passkey — deleting it would lock the account out for good
     * @type {boolean}
     * @memberof DeletePasskeyErrors
     */
    last_passkey: boolean;
    /**
     * No passkey with that id belongs to this account
     * @type {boolean}
     * @memberof DeletePasskeyErrors
     */
    unknown_passkey: boolean;
}

/**
 * Constant string `"Err"` which is documented by schemars
 * @export
 */
export const ErrorConstant = {
    Err: 'Err'
} as const;
export type ErrorConstant = typeof ErrorConstant[keyof typeof ErrorConstant];

/**
 * Request to finish adding a passkey
 * @export
 * @interface FinishAddPasskeyRequest
 */
export interface FinishAddPasskeyRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     * @type {any}
     * @memberof FinishAddPasskeyRequest
     */
    credential: any | null;
    /**
     * What to call the device, or `None` to number it
     * @type {string}
     * @memberof FinishAddPasskeyRequest
     */
    label?: string | null;
}
/**
 * Why a login could not be completed
 * @export
 * @interface FinishLoginErrors
 */
export interface FinishLoginErrors {
    /**
     * The signature did not check out
     * @type {boolean}
     * @memberof FinishLoginErrors
     */
    authentication_failed: boolean;
    /**
     * The browser's response was not a credential
     * @type {boolean}
     * @memberof FinishLoginErrors
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `login/start` was never called
     * @type {boolean}
     * @memberof FinishLoginErrors
     */
    no_ceremony: boolean;
}
/**
 * Request to finish a login ceremony
 * @export
 * @interface FinishLoginRequest
 */
export interface FinishLoginRequest {
    /**
     * The browser's `PublicKeyCredential` response
     * @type {any}
     * @memberof FinishLoginRequest
     */
    credential: any | null;
    /**
     * Keep the session alive across browser restarts
     * 
     * Off means the cookie is dropped when the browser closes — the sensible default on a machine somebody else also uses.
     * @type {boolean}
     * @memberof FinishLoginRequest
     */
    remember_me: boolean;
}
/**
 * Request to finish a registration ceremony
 * @export
 * @interface FinishRegistrationRequest
 */
export interface FinishRegistrationRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     * @type {any}
     * @memberof FinishRegistrationRequest
     */
    credential: any | null;
    /**
     * The token from the registration link
     * @type {string}
     * @memberof FinishRegistrationRequest
     */
    token: string;
}
/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAddPasskeyErrors
 */
export interface FormErrorResponseForAddPasskeyErrors {
    /**
     * The actual error struct
     * @type {AddPasskeyErrors}
     * @memberof FormErrorResponseForAddPasskeyErrors
     */
    error: AddPasskeyErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForAddPasskeyErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForDeletePasskeyErrors
 */
export interface FormErrorResponseForDeletePasskeyErrors {
    /**
     * The actual error struct
     * @type {DeletePasskeyErrors}
     * @memberof FormErrorResponseForDeletePasskeyErrors
     */
    error: DeletePasskeyErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForDeletePasskeyErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForFinishLoginErrors
 */
export interface FormErrorResponseForFinishLoginErrors {
    /**
     * The actual error struct
     * @type {FinishLoginErrors}
     * @memberof FormErrorResponseForFinishLoginErrors
     */
    error: FinishLoginErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForFinishLoginErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForRegistrationErrors
 */
export interface FormErrorResponseForRegistrationErrors {
    /**
     * The actual error struct
     * @type {RegistrationErrors}
     * @memberof FormErrorResponseForRegistrationErrors
     */
    error: RegistrationErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForRegistrationErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSignupErrors
 */
export interface FormErrorResponseForSignupErrors {
    /**
     * The actual error struct
     * @type {SignupErrors}
     * @memberof FormErrorResponseForSignupErrors
     */
    error: SignupErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForSignupErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForStartLoginErrors
 */
export interface FormErrorResponseForStartLoginErrors {
    /**
     * The actual error struct
     * @type {StartLoginErrors}
     * @memberof FormErrorResponseForStartLoginErrors
     */
    error: StartLoginErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForStartLoginErrors
     */
    result: ErrorConstant;
}


/**
 * The stacks in a collection
 * @export
 * @interface ListCollectionEntriesResponse
 */
export interface ListCollectionEntriesResponse {
    /**
     * One entry per stack
     * @type {Array<CollectionEntryResponse>}
     * @memberof ListCollectionEntriesResponse
     */
    entries: Array<CollectionEntryResponse>;
}
/**
 * The passkeys of the logged-in account
 * @export
 * @interface ListPasskeysResponse
 */
export interface ListPasskeysResponse {
    /**
     * One entry per registered device
     * @type {Array<SimplePasskey>}
     * @memberof ListPasskeysResponse
     */
    passkeys: Array<SimplePasskey>;
}
/**
 * The account the current session belongs to
 * @export
 * @interface MeResponse
 */
export interface MeResponse {
    /**
     * The account's login handle and display name
     * @type {string}
     * @memberof MeResponse
     */
    username: string;
    /**
     * The account's primary key
     * @type {string}
     * @memberof MeResponse
     */
    uuid: string;
}
/**
 * A stack to file into a collection
 * @export
 * @interface NewCollectionEntry
 */
export interface NewCollectionEntry {
    /**
     * The day the cards were acquired
     * @type {string}
     * @memberof NewCollectionEntry
     */
    acquired_at?: string | null;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof NewCollectionEntry
     */
    condition: CardCondition;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof NewCollectionEntry
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof NewCollectionEntry
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     * @type {number}
     * @memberof NewCollectionEntry
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies to file
     * @type {number}
     * @memberof NewCollectionEntry
     */
    quantity: number;
}


/**
 * Why a passkey registration could not be started or completed
 * @export
 * @interface RegistrationErrors
 */
export interface RegistrationErrors {
    /**
     * This authenticator already holds a passkey for this account
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    already_registered: boolean;
    /**
     * The browser's response was not a credential
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `register/start` was never called
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    no_ceremony: boolean;
    /**
     * The credential did not check out
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    registration_failed: boolean;
    /**
     * The token is past its validity
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    token_expired: boolean;
    /**
     * No such registration token
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    token_invalid: boolean;
    /**
     * The token was already used to register a passkey
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    token_used: boolean;
}
/**
 * The freshly minted secret of a collection's share link
 * @export
 * @interface RotateShareTokenResponse
 */
export interface RotateShareTokenResponse {
    /**
     * The new secret — every link handed out before this call stopped working
     * @type {string}
     * @memberof RotateShareTokenResponse
     */
    share_token: string;
}
/**
 * Request to change who may see a collection
 * @export
 * @interface SetCollectionVisibilityRequest
 */
export interface SetCollectionVisibilityRequest {
    /**
     * The visibility to switch to
     * @type {Visibility}
     * @memberof SetCollectionVisibilityRequest
     */
    visibility: Visibility;
}


/**
 * Request to change how many copies a stack holds
 * @export
 * @interface SetEntryQuantityRequest
 */
export interface SetEntryQuantityRequest {
    /**
     * The new count
     * @type {number}
     * @memberof SetEntryQuantityRequest
     */
    quantity: number;
}
/**
 * @type Signup200Response
 * 
 * @export
 */
export type Signup200Response = FormErrorResponseForSignupErrors | SignupResponse;
/**
 * Why a signup request was rejected, for the form to show on the offending field
 * 
 * Only the username is ever reported: profiles are reachable by name, so whether one is taken is public anyway. Whether an *email address* is already in use stays unrevealable — that request still answers `200` and simply sends no mail.
 * @export
 * @interface SignupErrors
 */
export interface SignupErrors {
    /**
     * The email address is not shaped like one
     * @type {boolean}
     * @memberof SignupErrors
     */
    email_malformed: boolean;
    /**
     * The username belongs to an account that has already finished its registration
     * @type {boolean}
     * @memberof SignupErrors
     */
    username_taken: boolean;
}
/**
 * Request to sign up for a new account
 * @export
 * @interface SignupRequest
 */
export interface SignupRequest {
    /**
     * The email address the registration link is sent to
     * @type {string}
     * @memberof SignupRequest
     */
    email: string;
    /**
     * The desired username
     * @type {any}
     * @memberof SignupRequest
     */
    username: any;
}
/**
 * Response to an accepted signup request
 * @export
 * @interface SignupResponse
 */
export interface SignupResponse {
    /**
     * The username the registration link is for
     * 
     * Echoed back so the confirmation screen can name the account without claiming which address the mail went to — for a re-issued invite that is the address already on the account, not the one just typed.
     * @type {string}
     * @memberof SignupResponse
     */
    username: string;
}
/**
 * A passkey registered on the account
 * @export
 * @interface SimplePasskey
 */
export interface SimplePasskey {
    /**
     * When the passkey was registered
     * @type {string}
     * @memberof SimplePasskey
     */
    created_at: string;
    /**
     * Human-readable device label
     * @type {string}
     * @memberof SimplePasskey
     */
    label: string;
    /**
     * When the passkey was last used to log in, if ever
     * @type {string}
     * @memberof SimplePasskey
     */
    last_used_at?: string | null;
    /**
     * The passkey's primary key
     * @type {string}
     * @memberof SimplePasskey
     */
    uuid: string;
}
/**
 * Response to a started add-passkey ceremony
 * @export
 * @interface StartAddPasskeyResponse
 */
export interface StartAddPasskeyResponse {
    /**
     * `PublicKeyCredentialCreationOptions` to pass to the browser
     * @type {any}
     * @memberof StartAddPasskeyResponse
     */
    options: any | null;
}
/**
 * @type StartLogin200Response
 * 
 * @export
 */
export type StartLogin200Response = FormErrorResponseForStartLoginErrors | StartLoginResponse;
/**
 * Why a login could not be started
 * @export
 * @interface StartLoginErrors
 */
export interface StartLoginErrors {
    /**
     * No account by that name, or it has no passkey — deliberately the same flag, so the endpoint does not say which usernames are actually able to log in
     * @type {boolean}
     * @memberof StartLoginErrors
     */
    unknown_username: boolean;
}
/**
 * Request to start a login ceremony
 * @export
 * @interface StartLoginRequest
 */
export interface StartLoginRequest {
    /**
     * The username to log in as
     * @type {any}
     * @memberof StartLoginRequest
     */
    username: any;
}
/**
 * Response to a started login ceremony
 * @export
 * @interface StartLoginResponse
 */
export interface StartLoginResponse {
    /**
     * `PublicKeyCredentialRequestOptions` to pass to the browser
     * @type {any}
     * @memberof StartLoginResponse
     */
    options: any | null;
}
/**
 * @type StartRegistration200Response
 * 
 * @export
 */
export type StartRegistration200Response = FormErrorResponseForRegistrationErrors | StartRegistrationResponse;
/**
 * Request to start a registration ceremony
 * @export
 * @interface StartRegistrationRequest
 */
export interface StartRegistrationRequest {
    /**
     * The token from the registration link
     * @type {string}
     * @memberof StartRegistrationRequest
     */
    token: string;
}
/**
 * Response to a started registration ceremony
 * @export
 * @interface StartRegistrationResponse
 */
export interface StartRegistrationResponse {
    /**
     * `PublicKeyCredentialCreationOptions` to pass to the browser
     * @type {any}
     * @memberof StartRegistrationResponse
     */
    options: any | null;
    /**
     * The username the passkey will be registered for
     * @type {string}
     * @memberof StartRegistrationResponse
     */
    username: string;
}
/**
 * 
 * @export
 * @interface UpdateCollectionRequest
 */
export interface UpdateCollectionRequest {
    /**
     * 
     * @type {string}
     * @memberof UpdateCollectionRequest
     */
    description: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateCollectionRequest
     */
    name: string;
}

/**
 * Who may see a collection or a deck
 * 
 * [`Self::Unlisted`] is not resolved by the ordinary visibility check — the share token is the authorization for those, not the viewer's identity.
 * @export
 */
export const Visibility = {
    /**
    * Listed on the owner&#39;s public profile
    */
    Public: 'Public',
    /**
    * Anyone who knows the share link
    */
    Unlisted: 'Unlisted',
    /**
    * Only the owner
    */
    Private: 'Private'
} as const;
export type Visibility = typeof Visibility[keyof typeof Visibility];

