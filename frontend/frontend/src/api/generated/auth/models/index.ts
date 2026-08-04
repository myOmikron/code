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
 * Data for all claims
 * @export
 * @interface Claims
 */
export interface Claims {
    /**
     * The email
     * @type {string}
     * @memberof Claims
     */
    email?: string;
    /**
     * Whether the mail is verified
     * @type {boolean}
     * @memberof Claims
     */
    email_verified?: boolean;
    /**
     * Name of the user
     * @type {string}
     * @memberof Claims
     */
    name?: string;
    /**
     * Preferred username
     * @type {string}
     * @memberof Claims
     */
    preferred_username?: string;
    /**
     * Identifier for the End-User
     * @type {string}
     * @memberof Claims
     */
    sub: string;
}
/**
 * Response for the discovery endpoint
 * @export
 * @interface DiscoveryResponse
 */
export interface DiscoveryResponse {
    /**
     * 
     * @type {string}
     * @memberof DiscoveryResponse
     */
    authorization_endpoint: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    id_token_signing_alg_values_supported: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof DiscoveryResponse
     */
    issuer: string;
    /**
     * 
     * @type {string}
     * @memberof DiscoveryResponse
     */
    jwks_uri: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    response_types_supported: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof DiscoveryResponse
     */
    subject_types_supported: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof DiscoveryResponse
     */
    token_endpoint: string;
    /**
     * 
     * @type {string}
     * @memberof DiscoveryResponse
     */
    userinfo_endpoint: string;
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
 * Token response
 * @export
 * @interface TokenResponse
 */
export interface TokenResponse {
    /**
     * Access token
     * @type {string}
     * @memberof TokenResponse
     */
    access_token: string;
    /**
     * Expires in
     * @type {number}
     * @memberof TokenResponse
     */
    expires_in: number;
    /**
     * Access token
     * @type {string}
     * @memberof TokenResponse
     */
    id_token: string;
    /**
     * Type of the token
     * @type {string}
     * @memberof TokenResponse
     */
    token_type: string;
}
