/* tslint:disable */
/* eslint-disable */
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
 * Request to create an oidc provider
 * @export
 * @interface CreateOidcProvider
 */
export interface CreateOidcProvider {
    /**
     * Name of the oidc provider
     * @type {string}
     * @memberof CreateOidcProvider
     */
    name: string;
    /**
     * Redirect url of the oidc provider
     * @type {string}
     * @memberof CreateOidcProvider
     */
    redirect_uri: string;
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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
 * A single OIDC Provider
 * @export
 * @interface OidcProvider
 */
export interface OidcProvider {
    /**
     * client id of the provider
     * @type {string}
     * @memberof OidcProvider
     */
    client_id: string;
    /**
     * Secret of the provider
     * @type {string}
     * @memberof OidcProvider
     */
    client_secret: string;
    /**
     * Human-readable name
     * @type {string}
     * @memberof OidcProvider
     */
    name: string;
    /**
     * Redirect url associated with the provider
     * @type {string}
     * @memberof OidcProvider
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
