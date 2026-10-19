//! Schema of the token endpoint and the tokens it issues

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::ClubAccount;
use crate::models::oidc_client::scope::Scope;

/// Value of the `mailcow_template` claim
///
/// mailcow's Generic-OIDC login reads the claim from the userinfo response and looks it up
/// in its "Attribute Mapping"; the mailcow admin maps this value to the mailbox template
/// new and existing mailboxes get. Naming that template `default` keeps the mapping obvious.
pub const MAILCOW_TEMPLATE: &str = "default";

/// Form of a token request (RFC 6749 §4.1.3)
///
/// A parameter may appear only once. The client authenticates either with HTTP Basic
/// (`client_secret_basic`) or with `client_id` and `client_secret` in this form
/// (`client_secret_post`), never with both.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TokenRequest {
    /// Type of the grant, only `authorization_code` is supported
    pub grant_type: MaxStr<255>,
    /// Code to exchange for tokens
    pub code: Option<MaxStr<255>>,
    /// Redirect uri of the authorization request
    pub redirect_uri: Option<MaxStr<1024>>,
    /// Client id, required for `client_secret_post`
    pub client_id: Option<MaxStr<255>>,
    /// Secret the client authenticates with in `client_secret_post`
    pub client_secret: Option<MaxStr<255>>,
    /// PKCE code verifier (RFC 7636)
    pub code_verifier: Option<MaxStr<128>>,
}

/// Error response of the token endpoint (RFC 6749 §5.2)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TokenErrorResponse {
    /// Error code
    pub error: TokenErrorCode,
    /// Human-readable explanation for the client developer
    pub error_description: String,
}

/// Error codes of the token endpoint (RFC 6749 §5.2)
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TokenErrorCode {
    /// "The request is missing a required parameter, includes an unsupported parameter
    /// value (other than grant type), repeats a parameter, includes multiple credentials,
    /// utilizes more than one mechanism for authenticating the client, or is otherwise
    /// malformed."
    InvalidRequest,
    /// "Client authentication failed (e.g., unknown client, no client authentication
    /// included, or unsupported authentication method)."
    InvalidClient,
    /// "The provided authorization grant (e.g., authorization code, resource owner
    /// credentials) or refresh token is invalid, expired, revoked, does not match the
    /// redirection URI used in the authorization request, or was issued to another client."
    InvalidGrant,
    /// "The authorization grant type is not supported by the authorization server."
    UnsupportedGrantType,
}

/// Successful token response
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TokenResponse {
    /// Access token for the userinfo endpoint
    pub access_token: String,
    /// ID token
    pub id_token: String,
    /// Type of the access token
    pub token_type: String,
    /// Seconds until the access token expires
    pub expires_in: usize,
}

/// Claims of an ID token
#[derive(Debug, Serialize, Deserialize)]
pub struct IdTokenClaims {
    /// Issuer
    pub iss: String,
    /// Identifier of the end-user
    pub sub: String,
    /// Audience, the client id
    pub aud: String,
    /// Authorized party, the client id the token was issued to
    pub azp: String,
    /// Expiry time
    pub exp: usize,
    /// Time at which the token was issued
    pub iat: usize,
    /// Nonce of the authorization request, omitted when it had none
    ///
    /// OpenID Connect Core §2: "If present in the Authentication Request, Authorization
    /// Servers MUST include a nonce Claim in the ID Token with the Claim Value being the
    /// same as the nonce value sent in the Authentication Request." §5.3.2: "If a Claim is
    /// not returned, that Claim Name SHOULD be omitted from the JSON object representing
    /// the Claims; it SHOULD NOT be present with a null or empty string value."
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    /// Time of the end-user's login, in seconds since the epoch
    pub auth_time: i64,
    /// Claims of the granted scopes
    #[serde(flatten)]
    pub scope_claims: ScopeClaims,
}

/// Claims of an access token
#[derive(Debug, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    /// Issuer
    pub iss: String,
    /// Identifier of the end-user
    pub sub: String,
    /// Audience, the userinfo endpoint
    pub aud: String,
    /// Expiry time
    pub exp: usize,
    /// Time at which the token was issued
    pub iat: usize,
    /// Granted scopes, space separated
    pub scope: String,
}

/// Claims about the end-user, depending on the granted scopes
#[derive(Debug, Clone, Serialize, Deserialize, Default, JsonSchema)]
pub struct ScopeClaims {
    /// Claims of the email scope
    #[serde(flatten)]
    pub email_claim: Option<EmailClaim>,
    /// Claims of the profile scope
    #[serde(flatten)]
    pub profile_claim: Option<ProfileClaim>,
    /// Claim of the mailcow_template scope, the key mailcow maps to a mailbox template
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mailcow_template: Option<String>,
}

impl ScopeClaims {
    /// The claims about `account` the granted `scopes` allow
    pub fn new(account: &ClubAccount, scopes: &[Scope]) -> Self {
        let granted = |scope| scopes.contains(&scope);
        Self {
            email_claim: granted(Scope::Email).then(|| EmailClaim {
                email: account.email.to_string(),
                email_verified: true,
            }),
            profile_claim: granted(Scope::Profile).then(|| ProfileClaim {
                preferred_username: account.username.to_string(),
                name: account.display_name.to_string(),
            }),
            mailcow_template: granted(Scope::MailcowTemplate).then(|| MAILCOW_TEMPLATE.to_string()),
        }
    }
}

/// Claims of the email scope
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EmailClaim {
    /// The email
    pub email: String,
    /// Whether the email is verified
    pub email_verified: bool,
}

/// Claims of the profile scope
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProfileClaim {
    /// Preferred username
    pub preferred_username: String,
    /// Name of the user
    pub name: String,
}
