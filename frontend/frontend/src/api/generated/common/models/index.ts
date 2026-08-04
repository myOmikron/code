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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
export type RoleSchema = RoleSchemaOneOf | RoleSchemaOneOf1 | RoleSchemaOneOf2;
/**
 * 
 * @export
 * @interface RoleSchemaOneOf
 */
export interface RoleSchemaOneOf {
    /**
     * 
     * @type {string}
     * @memberof RoleSchemaOneOf
     */
    type: RoleSchemaOneOfTypeEnum;
}


/**
 * @export
 */
export const RoleSchemaOneOfTypeEnum = {
    SuperAdmin: 'SuperAdmin'
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
    type: RoleSchemaOneOf1TypeEnum;
}


/**
 * @export
 */
export const RoleSchemaOneOf1TypeEnum = {
    ClubAdmin: 'ClubAdmin'
} as const;
export type RoleSchemaOneOf1TypeEnum = typeof RoleSchemaOneOf1TypeEnum[keyof typeof RoleSchemaOneOf1TypeEnum];

/**
 * 
 * @export
 * @interface RoleSchemaOneOf2
 */
export interface RoleSchemaOneOf2 {
    /**
     * New-type for the primary key of the club
     * @type {string}
     * @memberof RoleSchemaOneOf2
     */
    club: string;
    /**
     * 
     * @type {string}
     * @memberof RoleSchemaOneOf2
     */
    club_name: string;
    /**
     * 
     * @type {string}
     * @memberof RoleSchemaOneOf2
     */
    email: string;
    /**
     * 
     * @type {string}
     * @memberof RoleSchemaOneOf2
     */
    type: RoleSchemaOneOf2TypeEnum;
}


/**
 * @export
 */
export const RoleSchemaOneOf2TypeEnum = {
    ClubMember: 'ClubMember'
} as const;
export type RoleSchemaOneOf2TypeEnum = typeof RoleSchemaOneOf2TypeEnum[keyof typeof RoleSchemaOneOf2TypeEnum];

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
