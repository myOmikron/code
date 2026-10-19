/* tslint:disable */
/* eslint-disable */
/**
 * Accept an open invite
 * @export
 * @interface AcceptInvite
 */
export interface AcceptInvite {
    /**
     * The new password to set
     * @type {string}
     * @memberof AcceptInvite
     */
    password: string;
}
/**
 * Errors that can occur while accepting an invitation
 * @export
 * @interface AcceptInviteError
 */
export interface AcceptInviteError {
    /**
     * Empty password was supplied
     * @type {boolean}
     * @memberof AcceptInviteError
     */
    empty_password: boolean;
    /**
     * Invite has expired
     * @type {boolean}
     * @memberof AcceptInviteError
     */
    expired: boolean;
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
 * Request to associate a domain with a club
 * @export
 * @interface AssociateDomainRequest
 */
export interface AssociateDomainRequest {
    /**
     * The domain to associate with the club
     * @type {string}
     * @memberof AssociateDomainRequest
     */
    domain: string;
}
/**
 * A single club
 * @export
 * @interface ClubSchema
 */
export interface ClubSchema {
    /**
     * The number of admins in the club
     * @type {number}
     * @memberof ClubSchema
     */
    admin_count: number;
    /**
     * The point in time the club was created
     * @type {string}
     * @memberof ClubSchema
     */
    created_at: string;
    /**
     * The number of members in the club
     * @type {number}
     * @memberof ClubSchema
     */
    member_count: number;
    /**
     * The last point in time the club was modified
     * @type {string}
     * @memberof ClubSchema
     */
    modified_at: string;
    /**
     * Name of the club
     * @type {string}
     * @memberof ClubSchema
     */
    name: string;
    /**
     * Primary domain of the club
     * @type {string}
     * @memberof ClubSchema
     */
    primary_domain: string;
    /**
     * Primary key of a club
     * @type {string}
     * @memberof ClubSchema
     */
    uuid: string;
}
/**
 * Error when creating a club
 * @export
 * @interface CreateClubError
 */
export interface CreateClubError {
    /**
     * The domain is already associated with another club and can't be reused
     * @type {boolean}
     * @memberof CreateClubError
     */
    domain_already_associated: boolean;
    /**
     * Whether the club name already exists
     * @type {boolean}
     * @memberof CreateClubError
     */
    name_already_exists: boolean;
}
/**
 * Request to create a club
 * @export
 * @interface CreateClubRequest
 */
export interface CreateClubRequest {
    /**
     * Name of the club
     * @type {string}
     * @memberof CreateClubRequest
     */
    name: string;
    /**
     * Primary domain of the club
     * @type {string}
     * @memberof CreateClubRequest
     */
    primary_domain: string;
    /**
     * Whether to use X-Auth for authentication If set to false, bnv-manager is attempting to create an app password for all users and to keep them in sync
     * @type {boolean}
     * @memberof CreateClubRequest
     */
    use_xauth: boolean;
}
/**
 * Errors that can occur while creating an invitation
 * @export
 * @interface CreateInviteError
 */
export interface CreateInviteError {
    /**
     * Username is already taken
     * @type {boolean}
     * @memberof CreateInviteError
     */
    username_already_occupied: boolean;
}
/**
 * Request to create an invitation
 * @export
 * @interface CreateInviteRequestAdmin
 */
export interface CreateInviteRequestAdmin {
    /**
     * Display-name of the user
     * @type {string}
     * @memberof CreateInviteRequestAdmin
     */
    display_name: string;
    /**
     * Type of the invite
     * @type {InviteType}
     * @memberof CreateInviteRequestAdmin
     */
    invite_type: InviteType;
    /**
     * Reserved username
     * @type {string}
     * @memberof CreateInviteRequestAdmin
     */
    username: string;
    /**
     * The point in time the invite expires
     * @type {number}
     * @memberof CreateInviteRequestAdmin
     */
    valid_days: number;
}
/**
 * Request to create an invitation
 * @export
 * @interface CreateMemberInviteRequest
 */
export interface CreateMemberInviteRequest {
    /**
     * Display-name of the user
     * @type {string}
     * @memberof CreateMemberInviteRequest
     */
    display_name: string;
    /**
     * Email of the user
     * @type {string}
     * @memberof CreateMemberInviteRequest
     */
    email: string;
    /**
     * Reserved username
     * @type {string}
     * @memberof CreateMemberInviteRequest
     */
    username: string;
    /**
     * The point in time the invite expires
     * @type {number}
     * @memberof CreateMemberInviteRequest
     */
    valid_days: number;
}
/**
 * Errors when registering an OIDC client
 * @export
 * @interface CreateOidcClientError
 */
export interface CreateOidcClientError {
    /**
     * The redirect uri is no absolute url of printable ASCII, not `https` (or `http` on localhost) or contains a fragment
     * @type {boolean}
     * @memberof CreateOidcClientError
     */
    invalid_redirect_uri: boolean;
}
/**
 * Request to register an OIDC client
 * @export
 * @interface CreateOidcClientRequest
 */
export interface CreateOidcClientRequest {
    /**
     * Human-readable name
     * @type {string}
     * @memberof CreateOidcClientRequest
     */
    name: string;
    /**
     * The client's redirect uri
     * 
     * Must be an absolute url of printable ASCII using `https`, or `http` on localhost, and must not contain a fragment. It is stored as sent, a client's `redirect_uri` has to match it exactly.
     * @type {string}
     * @memberof CreateOidcClientRequest
     */
    redirect_uri: string;
}
/**
 * The credentials of a newly registered OIDC client
 * 
 * This is the only time the secret is returned.
 * @export
 * @interface CreatedOidcClient
 */
export interface CreatedOidcClient {
    /**
     * Client id of the client
     * @type {string}
     * @memberof CreatedOidcClient
     */
    client_id: string;
    /**
     * Secret the client authenticates with
     * @type {string}
     * @memberof CreatedOidcClient
     */
    client_secret: string;
}
/**
 * Instance of the credential reset
 * @export
 * @interface CredentialResetSchema
 */
export interface CredentialResetSchema {
    /**
     * The 6-digit code for the reset
     * @type {string}
     * @memberof CredentialResetSchema
     */
    code: string;
    /**
     * Point in time the code expires
     * @type {string}
     * @memberof CredentialResetSchema
     */
    code_expires_at: string;
    /**
     * The link to give to the user
     * @type {string}
     * @memberof CredentialResetSchema
     */
    link: string;
    /**
     * Point in time the link expires
     * @type {string}
     * @memberof CredentialResetSchema
     */
    link_expires_at: string;
    /**
     * Identifier
     * @type {string}
     * @memberof CredentialResetSchema
     */
    uuid: string;
}
/**
 * Combined dashboard statistics
 * @export
 * @interface DashboardStatsSchema
 */
export interface DashboardStatsSchema {
    /**
     * Domain statistics
     * @type {Array<DomainStatsSchema>}
     * @memberof DashboardStatsSchema
     */
    domains: Array<DomainStatsSchema>;
    /**
     * Top mailboxes by usage
     * @type {Array<MailboxStatsSchema>}
     * @memberof DashboardStatsSchema
     */
    mailboxes: Array<MailboxStatsSchema>;
}
/**
 * The OpenID provider's metadata (OpenID Connect Discovery 1.0, section 3)
 * @export
 * @interface DiscoveryResponse
 */
export interface DiscoveryResponse {
    /**
     * Url of the authorization endpoint
     * @type {string}
     * @memberof DiscoveryResponse
     */
    authorization_endpoint: string;
    /**
     * Claims the provider may supply values for
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    claims_supported: Array<string>;
    /**
     * Supported PKCE `code_challenge_method` values (RFC 8414 §2)
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    code_challenge_methods_supported: Array<string>;
    /**
     * Supported `grant_type` values
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    grant_types_supported: Array<string>;
    /**
     * Supported signing algorithms of the ID token
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    id_token_signing_alg_values_supported: Array<string>;
    /**
     * Identifier of the OpenID provider, the `iss` of its tokens
     * @type {string}
     * @memberof DiscoveryResponse
     */
    issuer: string;
    /**
     * Url of the JSON Web Key Set
     * @type {string}
     * @memberof DiscoveryResponse
     */
    jwks_uri: string;
    /**
     * Supported `response_mode` values
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    response_modes_supported: Array<string>;
    /**
     * Supported `response_type` values
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    response_types_supported: Array<string>;
    /**
     * Supported `scope` values
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    scopes_supported: Array<string>;
    /**
     * Supported subject identifier types
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    subject_types_supported: Array<string>;
    /**
     * Url of the token endpoint
     * @type {string}
     * @memberof DiscoveryResponse
     */
    token_endpoint: string;
    /**
     * Supported client authentication methods of the token endpoint
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    token_endpoint_auth_methods_supported: Array<string>;
    /**
     * Url of the userinfo endpoint
     * @type {string}
     * @memberof DiscoveryResponse
     */
    userinfo_endpoint: string;
}
/**
 * The representation of a domain
 * @export
 * @interface DomainSchema
 */
export interface DomainSchema {
    /**
     * The domain
     * @type {string}
     * @memberof DomainSchema
     */
    domain: string;
    /**
     * Is the domain used to create mailboxes
     * @type {boolean}
     * @memberof DomainSchema
     */
    is_primary: boolean;
    /**
     * Internal identifier of the domain
     * @type {string}
     * @memberof DomainSchema
     */
    uuid: string;
}
/**
 * Statistics for a domain
 * @export
 * @interface DomainStatsSchema
 */
export interface DomainStatsSchema {
    /**
     * Total bytes used across all mailboxes
     * @type {number}
     * @memberof DomainStatsSchema
     */
    bytes_used: number;
    /**
     * Domain name
     * @type {string}
     * @memberof DomainStatsSchema
     */
    domain: string;
    /**
     * Maximum number of mailboxes allowed
     * @type {number}
     * @memberof DomainStatsSchema
     */
    mailboxes_max: number;
    /**
     * Number of mailboxes in the domain
     * @type {number}
     * @memberof DomainStatsSchema
     */
    mailboxes_used: number;
    /**
     * Total number of messages
     * @type {number}
     * @memberof DomainStatsSchema
     */
    messages: number;
    /**
     * Maximum quota for the domain in bytes
     * @type {number}
     * @memberof DomainStatsSchema
     */
    quota: number;
}
/**
 * Errors that can occur while extending the expiry of an invitation
 * @export
 * @interface ExtendInviteExpiryError
 */
export interface ExtendInviteExpiryError {
    /**
     * Expiry time is in the past
     * @type {boolean}
     * @memberof ExtendInviteExpiryError
     */
    expiry_time_in_past: boolean;
    /**
     * Expiry time is before the current expiry time
     * @type {boolean}
     * @memberof ExtendInviteExpiryError
     */
    expiry_time_too_short: boolean;
}
/**
 * Request to extend an existing invitation
 * @export
 * @interface ExtendInviteRequest
 */
export interface ExtendInviteRequest {
    /**
     * The point in time the invite expires
     * @type {number}
     * @memberof ExtendInviteRequest
     */
    valid_days: number;
}
/**
 * @type FormResultForClubUuidAndCreateClubError
 * A `Result` with a custom serialization
 * @export
 */
export type FormResultForClubUuidAndCreateClubError = FormResultForClubUuidAndCreateClubErrorOneOf | FormResultForClubUuidAndCreateClubErrorOneOf1;
/**
 * 
 * @export
 * @interface FormResultForClubUuidAndCreateClubErrorOneOf
 */
export interface FormResultForClubUuidAndCreateClubErrorOneOf {
    /**
     * 
     * @type {FormResultForClubUuidAndCreateClubErrorOneOfResultEnum}
     * @memberof FormResultForClubUuidAndCreateClubErrorOneOf
     */
    result: FormResultForClubUuidAndCreateClubErrorOneOfResultEnum;
    /**
     * New-type for the primary key of the club
     * @type {string}
     * @memberof FormResultForClubUuidAndCreateClubErrorOneOf
     */
    value: string;
}


/**
 * @export
 */
export const FormResultForClubUuidAndCreateClubErrorOneOfResultEnum = {
    Ok: 'Ok'
} as const;
export type FormResultForClubUuidAndCreateClubErrorOneOfResultEnum = typeof FormResultForClubUuidAndCreateClubErrorOneOfResultEnum[keyof typeof FormResultForClubUuidAndCreateClubErrorOneOfResultEnum];

/**
 * 
 * @export
 * @interface FormResultForClubUuidAndCreateClubErrorOneOf1
 */
export interface FormResultForClubUuidAndCreateClubErrorOneOf1 {
    /**
     * 
     * @type {CreateClubError}
     * @memberof FormResultForClubUuidAndCreateClubErrorOneOf1
     */
    error: CreateClubError;
    /**
     * 
     * @type {FormResultForClubUuidAndCreateClubErrorOneOf1ResultEnum}
     * @memberof FormResultForClubUuidAndCreateClubErrorOneOf1
     */
    result: FormResultForClubUuidAndCreateClubErrorOneOf1ResultEnum;
}


/**
 * @export
 */
export const FormResultForClubUuidAndCreateClubErrorOneOf1ResultEnum = {
    Err: 'Err'
} as const;
export type FormResultForClubUuidAndCreateClubErrorOneOf1ResultEnum = typeof FormResultForClubUuidAndCreateClubErrorOneOf1ResultEnum[keyof typeof FormResultForClubUuidAndCreateClubErrorOneOf1ResultEnum];

/**
 * @type FormResultForCreatedOidcClientAndCreateOidcClientError
 * A `Result` with a custom serialization
 * @export
 */
export type FormResultForCreatedOidcClientAndCreateOidcClientError = FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf | FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1;
/**
 * 
 * @export
 * @interface FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf
 */
export interface FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf {
    /**
     * 
     * @type {FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOfResultEnum}
     * @memberof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf
     */
    result: FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOfResultEnum;
    /**
     * 
     * @type {CreatedOidcClient}
     * @memberof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf
     */
    value: CreatedOidcClient;
}


/**
 * @export
 */
export const FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOfResultEnum = {
    Ok: 'Ok'
} as const;
export type FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOfResultEnum = typeof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOfResultEnum[keyof typeof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOfResultEnum];

/**
 * 
 * @export
 * @interface FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1
 */
export interface FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1 {
    /**
     * 
     * @type {CreateOidcClientError}
     * @memberof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1
     */
    error: CreateOidcClientError;
    /**
     * 
     * @type {FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1ResultEnum}
     * @memberof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1
     */
    result: FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1ResultEnum;
}


/**
 * @export
 */
export const FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1ResultEnum = {
    Err: 'Err'
} as const;
export type FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1ResultEnum = typeof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1ResultEnum[keyof typeof FormResultForCreatedOidcClientAndCreateOidcClientErrorOneOf1ResultEnum];

/**
 * @type FormResultForNullAndAcceptInviteError
 * A `Result` with a custom serialization
 * @export
 */
export type FormResultForNullAndAcceptInviteError = FormResultForNullAndAcceptInviteErrorOneOf | FormResultForNullAndAcceptInviteErrorOneOf1;
/**
 * 
 * @export
 * @interface FormResultForNullAndAcceptInviteErrorOneOf
 */
export interface FormResultForNullAndAcceptInviteErrorOneOf {
    /**
     * 
     * @type {FormResultForNullAndAcceptInviteErrorOneOfResultEnum}
     * @memberof FormResultForNullAndAcceptInviteErrorOneOf
     */
    result: FormResultForNullAndAcceptInviteErrorOneOfResultEnum;
    /**
     * 
     * @type {any}
     * @memberof FormResultForNullAndAcceptInviteErrorOneOf
     */
    value: any | null;
}


/**
 * @export
 */
export const FormResultForNullAndAcceptInviteErrorOneOfResultEnum = {
    Ok: 'Ok'
} as const;
export type FormResultForNullAndAcceptInviteErrorOneOfResultEnum = typeof FormResultForNullAndAcceptInviteErrorOneOfResultEnum[keyof typeof FormResultForNullAndAcceptInviteErrorOneOfResultEnum];

/**
 * 
 * @export
 * @interface FormResultForNullAndAcceptInviteErrorOneOf1
 */
export interface FormResultForNullAndAcceptInviteErrorOneOf1 {
    /**
     * 
     * @type {AcceptInviteError}
     * @memberof FormResultForNullAndAcceptInviteErrorOneOf1
     */
    error: AcceptInviteError;
    /**
     * 
     * @type {FormResultForNullAndAcceptInviteErrorOneOf1ResultEnum}
     * @memberof FormResultForNullAndAcceptInviteErrorOneOf1
     */
    result: FormResultForNullAndAcceptInviteErrorOneOf1ResultEnum;
}


/**
 * @export
 */
export const FormResultForNullAndAcceptInviteErrorOneOf1ResultEnum = {
    Err: 'Err'
} as const;
export type FormResultForNullAndAcceptInviteErrorOneOf1ResultEnum = typeof FormResultForNullAndAcceptInviteErrorOneOf1ResultEnum[keyof typeof FormResultForNullAndAcceptInviteErrorOneOf1ResultEnum];

/**
 * @type FormResultForNullAndExtendInviteExpiryError
 * A `Result` with a custom serialization
 * @export
 */
export type FormResultForNullAndExtendInviteExpiryError = FormResultForNullAndAcceptInviteErrorOneOf | FormResultForNullAndExtendInviteExpiryErrorOneOf;
/**
 * 
 * @export
 * @interface FormResultForNullAndExtendInviteExpiryErrorOneOf
 */
export interface FormResultForNullAndExtendInviteExpiryErrorOneOf {
    /**
     * 
     * @type {ExtendInviteExpiryError}
     * @memberof FormResultForNullAndExtendInviteExpiryErrorOneOf
     */
    error: ExtendInviteExpiryError;
    /**
     * 
     * @type {FormResultForNullAndExtendInviteExpiryErrorOneOfResultEnum}
     * @memberof FormResultForNullAndExtendInviteExpiryErrorOneOf
     */
    result: FormResultForNullAndExtendInviteExpiryErrorOneOfResultEnum;
}


/**
 * @export
 */
export const FormResultForNullAndExtendInviteExpiryErrorOneOfResultEnum = {
    Err: 'Err'
} as const;
export type FormResultForNullAndExtendInviteExpiryErrorOneOfResultEnum = typeof FormResultForNullAndExtendInviteExpiryErrorOneOfResultEnum[keyof typeof FormResultForNullAndExtendInviteExpiryErrorOneOfResultEnum];

/**
 * @type FormResultForNullAndResetPasswordError
 * A `Result` with a custom serialization
 * @export
 */
export type FormResultForNullAndResetPasswordError = FormResultForNullAndAcceptInviteErrorOneOf | FormResultForNullAndResetPasswordErrorOneOf;
/**
 * 
 * @export
 * @interface FormResultForNullAndResetPasswordErrorOneOf
 */
export interface FormResultForNullAndResetPasswordErrorOneOf {
    /**
     * 
     * @type {ResetPasswordError}
     * @memberof FormResultForNullAndResetPasswordErrorOneOf
     */
    error: ResetPasswordError;
    /**
     * 
     * @type {FormResultForNullAndResetPasswordErrorOneOfResultEnum}
     * @memberof FormResultForNullAndResetPasswordErrorOneOf
     */
    result: FormResultForNullAndResetPasswordErrorOneOfResultEnum;
}


/**
 * @export
 */
export const FormResultForNullAndResetPasswordErrorOneOfResultEnum = {
    Err: 'Err'
} as const;
export type FormResultForNullAndResetPasswordErrorOneOfResultEnum = typeof FormResultForNullAndResetPasswordErrorOneOfResultEnum[keyof typeof FormResultForNullAndResetPasswordErrorOneOfResultEnum];

/**
 * @type FormResultForNullAndSetPasswordErrors
 * A `Result` with a custom serialization
 * @export
 */
export type FormResultForNullAndSetPasswordErrors = FormResultForNullAndAcceptInviteErrorOneOf | FormResultForNullAndSetPasswordErrorsOneOf;
/**
 * 
 * @export
 * @interface FormResultForNullAndSetPasswordErrorsOneOf
 */
export interface FormResultForNullAndSetPasswordErrorsOneOf {
    /**
     * 
     * @type {SetPasswordErrors}
     * @memberof FormResultForNullAndSetPasswordErrorsOneOf
     */
    error: SetPasswordErrors;
    /**
     * 
     * @type {FormResultForNullAndSetPasswordErrorsOneOfResultEnum}
     * @memberof FormResultForNullAndSetPasswordErrorsOneOf
     */
    result: FormResultForNullAndSetPasswordErrorsOneOfResultEnum;
}


/**
 * @export
 */
export const FormResultForNullAndSetPasswordErrorsOneOfResultEnum = {
    Err: 'Err'
} as const;
export type FormResultForNullAndSetPasswordErrorsOneOfResultEnum = typeof FormResultForNullAndSetPasswordErrorsOneOfResultEnum[keyof typeof FormResultForNullAndSetPasswordErrorsOneOfResultEnum];

/**
 * @type FormResultForSingleLinkAndCreateInviteError
 * A `Result` with a custom serialization
 * @export
 */
export type FormResultForSingleLinkAndCreateInviteError = FormResultForSingleLinkAndCreateInviteErrorOneOf | FormResultForSingleLinkAndCreateInviteErrorOneOf1;
/**
 * 
 * @export
 * @interface FormResultForSingleLinkAndCreateInviteErrorOneOf
 */
export interface FormResultForSingleLinkAndCreateInviteErrorOneOf {
    /**
     * 
     * @type {FormResultForSingleLinkAndCreateInviteErrorOneOfResultEnum}
     * @memberof FormResultForSingleLinkAndCreateInviteErrorOneOf
     */
    result: FormResultForSingleLinkAndCreateInviteErrorOneOfResultEnum;
    /**
     * 
     * @type {SingleLink}
     * @memberof FormResultForSingleLinkAndCreateInviteErrorOneOf
     */
    value: SingleLink;
}


/**
 * @export
 */
export const FormResultForSingleLinkAndCreateInviteErrorOneOfResultEnum = {
    Ok: 'Ok'
} as const;
export type FormResultForSingleLinkAndCreateInviteErrorOneOfResultEnum = typeof FormResultForSingleLinkAndCreateInviteErrorOneOfResultEnum[keyof typeof FormResultForSingleLinkAndCreateInviteErrorOneOfResultEnum];

/**
 * 
 * @export
 * @interface FormResultForSingleLinkAndCreateInviteErrorOneOf1
 */
export interface FormResultForSingleLinkAndCreateInviteErrorOneOf1 {
    /**
     * 
     * @type {CreateInviteError}
     * @memberof FormResultForSingleLinkAndCreateInviteErrorOneOf1
     */
    error: CreateInviteError;
    /**
     * 
     * @type {FormResultForSingleLinkAndCreateInviteErrorOneOf1ResultEnum}
     * @memberof FormResultForSingleLinkAndCreateInviteErrorOneOf1
     */
    result: FormResultForSingleLinkAndCreateInviteErrorOneOf1ResultEnum;
}


/**
 * @export
 */
export const FormResultForSingleLinkAndCreateInviteErrorOneOf1ResultEnum = {
    Err: 'Err'
} as const;
export type FormResultForSingleLinkAndCreateInviteErrorOneOf1ResultEnum = typeof FormResultForSingleLinkAndCreateInviteErrorOneOf1ResultEnum[keyof typeof FormResultForSingleLinkAndCreateInviteErrorOneOf1ResultEnum];

/**
 * API representation of an invitation
 * @export
 * @interface GetInvite
 */
export interface GetInvite {
    /**
     * The point in time the invite was created
     * @type {string}
     * @memberof GetInvite
     */
    created_at: string;
    /**
     * Display-name of the user
     * @type {string}
     * @memberof GetInvite
     */
    display_name: string;
    /**
     * The point in time the invite expires
     * @type {string}
     * @memberof GetInvite
     */
    expires_at: string;
    /**
     * Public link for accessing the invite
     * @type {string}
     * @memberof GetInvite
     */
    link: string;
    /**
     * Reserved username
     * @type {string}
     * @memberof GetInvite
     */
    username: string;
    /**
     * Primary key of the invite
     * @type {string}
     * @memberof GetInvite
     */
    uuid: string;
}
/**
 * @type InviteType
 * Type of the invite
 * @export
 */
export type InviteType = InviteTypeOneOf | InviteTypeOneOf1 | InviteTypeOneOf2;
/**
 * Superadmin
 * @export
 * @interface InviteTypeOneOf
 */
export interface InviteTypeOneOf {
    /**
     * 
     * @type {InviteTypeOneOfTypeEnum}
     * @memberof InviteTypeOneOf
     */
    type: InviteTypeOneOfTypeEnum;
}


/**
 * @export
 */
export const InviteTypeOneOfTypeEnum = {
    SuperAdmin: 'SuperAdmin'
} as const;
export type InviteTypeOneOfTypeEnum = typeof InviteTypeOneOfTypeEnum[keyof typeof InviteTypeOneOfTypeEnum];

/**
 * Club admin
 * @export
 * @interface InviteTypeOneOf1
 */
export interface InviteTypeOneOf1 {
    /**
     * Club the invite is linked to
     * @type {string}
     * @memberof InviteTypeOneOf1
     */
    club: string;
    /**
     * 
     * @type {InviteTypeOneOf1TypeEnum}
     * @memberof InviteTypeOneOf1
     */
    type: InviteTypeOneOf1TypeEnum;
}


/**
 * @export
 */
export const InviteTypeOneOf1TypeEnum = {
    ClubAdmin: 'ClubAdmin'
} as const;
export type InviteTypeOneOf1TypeEnum = typeof InviteTypeOneOf1TypeEnum[keyof typeof InviteTypeOneOf1TypeEnum];

/**
 * Club member
 * @export
 * @interface InviteTypeOneOf2
 */
export interface InviteTypeOneOf2 {
    /**
     * Club the invite is linked to
     * @type {string}
     * @memberof InviteTypeOneOf2
     */
    club: string;
    /**
     * Primary mail of the user
     * @type {string}
     * @memberof InviteTypeOneOf2
     */
    email: string;
    /**
     * 
     * @type {InviteTypeOneOf2TypeEnum}
     * @memberof InviteTypeOneOf2
     */
    type: InviteTypeOneOf2TypeEnum;
}


/**
 * @export
 */
export const InviteTypeOneOf2TypeEnum = {
    ClubMember: 'ClubMember'
} as const;
export type InviteTypeOneOf2TypeEnum = typeof InviteTypeOneOf2TypeEnum[keyof typeof InviteTypeOneOf2TypeEnum];

/**
 * Storage statistics for a single mailbox
 * @export
 * @interface MailboxStatsSchema
 */
export interface MailboxStatsSchema {
    /**
     * E-Mail address of the mailbox
     * @type {string}
     * @memberof MailboxStatsSchema
     */
    email: string;
    /**
     * Number of messages
     * @type {number}
     * @memberof MailboxStatsSchema
     */
    messages: number;
    /**
     * Quota limit in bytes
     * @type {number}
     * @memberof MailboxStatsSchema
     */
    quota: number;
    /**
     * Used quota in bytes
     * @type {number}
     * @memberof MailboxStatsSchema
     */
    quota_used: number;
}
/**
 * Representation of the currently logged-in user.
 * @export
 * @interface MeSchema
 */
export interface MeSchema {
    /**
     * The user's display name.
     * @type {string}
     * @memberof MeSchema
     */
    display_name: string;
    /**
     * The user's roles.
     * @type {RoleSchema}
     * @memberof MeSchema
     */
    role: RoleSchema;
    /**
     * The user's username.
     * @type {string}
     * @memberof MeSchema
     */
    username: string;
    /**
     * The user's UUID.
     * @type {string}
     * @memberof MeSchema
     */
    uuid: string;
}
/**
 * A registered OIDC client, without its secret
 * @export
 * @interface OidcClientSchema
 */
export interface OidcClientSchema {
    /**
     * Client id of the client
     * @type {string}
     * @memberof OidcClientSchema
     */
    client_id: string;
    /**
     * Human-readable name
     * @type {string}
     * @memberof OidcClientSchema
     */
    name: string;
    /**
     * The client's registered redirect uri
     * @type {string}
     * @memberof OidcClientSchema
     */
    redirect_uri: string;
}
/**
 * A page of items
 * @export
 * @interface PageForSimpleAccountSchema
 */
export interface PageForSimpleAccountSchema {
    /**
     * The page's items
     * @type {Array<SimpleAccountSchema>}
     * @memberof PageForSimpleAccountSchema
     */
    items: Array<SimpleAccountSchema>;
    /**
     * The limit this page was requested with
     * @type {number}
     * @memberof PageForSimpleAccountSchema
     */
    limit: number;
    /**
     * The offset this page was requested with
     * @type {number}
     * @memberof PageForSimpleAccountSchema
     */
    offset: number;
    /**
     * The total number of items this page is a subset of
     * @type {number}
     * @memberof PageForSimpleAccountSchema
     */
    total: number;
}
/**
 * A page of items
 * @export
 * @interface PageForSimpleMemberAccountSchema
 */
export interface PageForSimpleMemberAccountSchema {
    /**
     * The page's items
     * @type {Array<SimpleMemberAccountSchema>}
     * @memberof PageForSimpleMemberAccountSchema
     */
    items: Array<SimpleMemberAccountSchema>;
    /**
     * The limit this page was requested with
     * @type {number}
     * @memberof PageForSimpleMemberAccountSchema
     */
    limit: number;
    /**
     * The offset this page was requested with
     * @type {number}
     * @memberof PageForSimpleMemberAccountSchema
     */
    offset: number;
    /**
     * The total number of items this page is a subset of
     * @type {number}
     * @memberof PageForSimpleMemberAccountSchema
     */
    total: number;
}
/**
 * Errors that can occur while resetting a password
 * @export
 * @interface ResetPasswordError
 */
export interface ResetPasswordError {
    /**
     * The code has expired
     * @type {boolean}
     * @memberof ResetPasswordError
     */
    expired: boolean;
    /**
     * The code is invalid or not found
     * @type {boolean}
     * @memberof ResetPasswordError
     */
    invalid_code: boolean;
    /**
     * The password entropy is too low
     * @type {boolean}
     * @memberof ResetPasswordError
     */
    low_entropy: boolean;
}
/**
 * Request to reset a password using a code
 * @export
 * @interface ResetPasswordRequest
 */
export interface ResetPasswordRequest {
    /**
     * The new password
     * @type {string}
     * @memberof ResetPasswordRequest
     */
    password: string;
}
/**
 * @type RoleSchema
 * The roles of a user.
 * @export
 */
export type RoleSchema = InviteTypeOneOf | RoleSchemaOneOf | RoleSchemaOneOf1;
/**
 * 
 * @export
 * @interface RoleSchemaOneOf
 */
export interface RoleSchemaOneOf {
    /**
     * New-type for the primary key of the club
     * @type {string}
     * @memberof RoleSchemaOneOf
     */
    club: string;
    /**
     * 
     * @type {string}
     * @memberof RoleSchemaOneOf
     */
    club_name: string;
    /**
     * 
     * @type {RoleSchemaOneOfTypeEnum}
     * @memberof RoleSchemaOneOf
     */
    type: RoleSchemaOneOfTypeEnum;
}


/**
 * @export
 */
export const RoleSchemaOneOfTypeEnum = {
    ClubAdmin: 'ClubAdmin'
} as const;
export type RoleSchemaOneOfTypeEnum = typeof RoleSchemaOneOfTypeEnum[keyof typeof RoleSchemaOneOfTypeEnum];

/**
 * 
 * @export
 * @interface RoleSchemaOneOf1
 */
export interface RoleSchemaOneOf1 {
    /**
     * New-type for the primary key of the club
     * @type {string}
     * @memberof RoleSchemaOneOf1
     */
    club: string;
    /**
     * 
     * @type {string}
     * @memberof RoleSchemaOneOf1
     */
    club_name: string;
    /**
     * 
     * @type {string}
     * @memberof RoleSchemaOneOf1
     */
    email: string;
    /**
     * 
     * @type {RoleSchemaOneOf1TypeEnum}
     * @memberof RoleSchemaOneOf1
     */
    type: RoleSchemaOneOf1TypeEnum;
}


/**
 * @export
 */
export const RoleSchemaOneOf1TypeEnum = {
    ClubMember: 'ClubMember'
} as const;
export type RoleSchemaOneOf1TypeEnum = typeof RoleSchemaOneOf1TypeEnum[keyof typeof RoleSchemaOneOf1TypeEnum];

/**
 * Errors that may occur while setting a new password
 * @export
 * @interface SetPasswordErrors
 */
export interface SetPasswordErrors {
    /**
     * The old password was invalid
     * @type {boolean}
     * @memberof SetPasswordErrors
     */
    invalid_old_password: boolean;
    /**
     * Entropy is too low
     * @type {boolean}
     * @memberof SetPasswordErrors
     */
    low_entropy: boolean;
}
/**
 * Request to update the currently logged-in user
 * @export
 * @interface SetPasswordRequest
 */
export interface SetPasswordRequest {
    /**
     * The current password of the user
     * @type {string}
     * @memberof SetPasswordRequest
     */
    old_password: string;
    /**
     * The new password
     * @type {string}
     * @memberof SetPasswordRequest
     */
    password: string;
}
/**
 * Schema for the common available settings
 * @export
 * @interface SettingsSchema
 */
export interface SettingsSchema {
    /**
     * Mailcow URL
     * @type {string}
     * @memberof SettingsSchema
     */
    mailcow_url: string;
}
/**
 * Sign in request
 * @export
 * @interface SignInRequest
 */
export interface SignInRequest {
    /**
     * Password
     * @type {string}
     * @memberof SignInRequest
     */
    password: string;
    /**
     * Username
     * @type {string}
     * @memberof SignInRequest
     */
    username: string;
}
/**
 * Simple representation of an account.
 * @export
 * @interface SimpleAccountSchema
 */
export interface SimpleAccountSchema {
    /**
     * The account's display name.
     * @type {string}
     * @memberof SimpleAccountSchema
     */
    display_name: string;
    /**
     * The account's username.
     * @type {string}
     * @memberof SimpleAccountSchema
     */
    username: string;
    /**
     * The account's UUID.
     * @type {string}
     * @memberof SimpleAccountSchema
     */
    uuid: string;
}
/**
 * Simple representation of an account.
 * @export
 * @interface SimpleMemberAccountSchema
 */
export interface SimpleMemberAccountSchema {
    /**
     * The account's display name.
     * @type {string}
     * @memberof SimpleMemberAccountSchema
     */
    display_name: string;
    /**
     * The account's email
     * @type {string}
     * @memberof SimpleMemberAccountSchema
     */
    email: string;
    /**
     * The account's username.
     * @type {string}
     * @memberof SimpleMemberAccountSchema
     */
    username: string;
    /**
     * The account's UUID.
     * @type {string}
     * @memberof SimpleMemberAccountSchema
     */
    uuid: string;
}
/**
 * A single string representing a link wrapped in a struct
 * @export
 * @interface SingleLink
 */
export interface SingleLink {
    /**
     * 
     * @type {string}
     * @memberof SingleLink
     */
    link: string;
}

/**
 * Error codes of the token endpoint (RFC 6749 §5.2)
 * @export
 */
export const TokenErrorCode = {
    /**
    * &quot;The request is missing a required parameter, includes an unsupported parameter value (other than grant type), repeats a parameter, includes multiple credentials, utilizes more than one mechanism for authenticating the client, or is otherwise malformed.&quot;
    */
    invalid_request: 'invalid_request',
    /**
    * &quot;Client authentication failed (e.g., unknown client, no client authentication included, or unsupported authentication method).&quot;
    */
    invalid_client: 'invalid_client',
    /**
    * &quot;The provided authorization grant (e.g., authorization code, resource owner credentials) or refresh token is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.&quot;
    */
    invalid_grant: 'invalid_grant',
    /**
    * &quot;The authorization grant type is not supported by the authorization server.&quot;
    */
    unsupported_grant_type: 'unsupported_grant_type'
} as const;
export type TokenErrorCode = typeof TokenErrorCode[keyof typeof TokenErrorCode];

/**
 * Error response of the token endpoint (RFC 6749 §5.2)
 * @export
 * @interface TokenErrorResponse
 */
export interface TokenErrorResponse {
    /**
     * Error code
     * @type {TokenErrorCode}
     * @memberof TokenErrorResponse
     */
    error: TokenErrorCode;
    /**
     * Human-readable explanation for the client developer
     * @type {string}
     * @memberof TokenErrorResponse
     */
    error_description: string;
}


/**
 * Successful token response
 * @export
 * @interface TokenResponse
 */
export interface TokenResponse {
    /**
     * Access token for the userinfo endpoint
     * @type {string}
     * @memberof TokenResponse
     */
    access_token: string;
    /**
     * Seconds until the access token expires
     * @type {number}
     * @memberof TokenResponse
     */
    expires_in: number;
    /**
     * ID token
     * @type {string}
     * @memberof TokenResponse
     */
    id_token: string;
    /**
     * Type of the access token
     * @type {string}
     * @memberof TokenResponse
     */
    token_type: string;
}
/**
 * Request to unassociate a domain with a club
 * @export
 * @interface UnassociateDomainRequest
 */
export interface UnassociateDomainRequest {
    /**
     * The domain to unassociate with the club
     * @type {string}
     * @memberof UnassociateDomainRequest
     */
    domain: string;
}
/**
 * Request to update the currently logged-in user
 * @export
 * @interface UpdateMeRequest
 */
export interface UpdateMeRequest {
    /**
     * The display name of the user
     * @type {string}
     * @memberof UpdateMeRequest
     */
    display_name: string;
}
/**
 * Claims about the end-user
 * @export
 * @interface UserinfoResponse
 */
export interface UserinfoResponse {
    /**
     * The email
     * @type {string}
     * @memberof UserinfoResponse
     */
    email?: string;
    /**
     * Whether the email is verified
     * @type {boolean}
     * @memberof UserinfoResponse
     */
    email_verified?: boolean;
    /**
     * Claim of the mailcow_template scope, the key mailcow maps to a mailbox template
     * @type {string}
     * @memberof UserinfoResponse
     */
    mailcow_template?: string | null;
    /**
     * Name of the user
     * @type {string}
     * @memberof UserinfoResponse
     */
    name?: string;
    /**
     * Preferred username
     * @type {string}
     * @memberof UserinfoResponse
     */
    preferred_username?: string;
    /**
     * Identifier of the end-user
     * @type {string}
     * @memberof UserinfoResponse
     */
    sub: string;
}
/**
 * Response for verifying a reset code
 * @export
 * @interface VerifyResetCodeResponse
 */
export interface VerifyResetCodeResponse {
    /**
     * Display name of the account
     * @type {string}
     * @memberof VerifyResetCodeResponse
     */
    display_name: string;
}
