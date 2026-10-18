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
 * @type TokenErrorCode
 * Error codes of the token endpoint (RFC 6749 §5.2)
 * @export
 */
export type TokenErrorCode = string;
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
