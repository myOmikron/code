//! Handler of the token endpoint

use std::time::Duration;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::HeaderMap;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::post;
use galvyn::rorm::Database;
use subtle::ConstantTimeEq;
use tracing::instrument;
use url::Url;
use uuid::Uuid;

use crate::http::handler_auth::TOKEN_PATH;
use crate::http::handler_auth::USERINFO_PATH;
use crate::http::handler_auth::endpoint_url;
use crate::http::handler_auth::issuer;
use crate::http::handler_auth::pkce;
use crate::http::handler_auth::token::request::ClientCredentials;
use crate::http::handler_auth::token::request::TokenForm;
use crate::http::handler_auth::token::response::NoStore;
use crate::http::handler_auth::token::response::TokenError;
use crate::http::handler_auth::token::schema::AccessTokenClaims;
use crate::http::handler_auth::token::schema::IdTokenClaims;
use crate::http::handler_auth::token::schema::ScopeClaims;
use crate::http::handler_auth::token::schema::TokenResponse;
use crate::models::club::Club;
use crate::models::oidc_client::OidcAuthenticationToken;
use crate::models::oidc_client::OidcClient;
use crate::models::oidc_client::OidcClientUuid;
use crate::modules::mailcow::Mailcow;
use crate::modules::oidc::Oidc;

/// How long the ID token and the access token are valid
pub const TOKEN_LIFETIME: Duration = Duration::from_secs(300);

/// Exchange an authorization code for an ID token and an access token
///
/// The client authenticates with `client_secret_basic` or `client_secret_post`
/// (RFC 6749 §2.3.1). Errors are RFC 6749 §5.2 error objects. Every response carries
/// `Cache-Control: no-store` and `Pragma: no-cache` (RFC 6749 §5.1).
///
/// A code is redeemed once. RFC 6749 §4.1.2: "The client MUST NOT use the authorization
/// code more than once. If an authorization code is used more than once, the
/// authorization server MUST deny the request". A row lock serializes concurrent
/// redemptions.
///
/// The `redirect_uri` has to equal the one of the authorization request exactly, compared
/// as a string like the authorization endpoint does.
///
/// RFC 9700 §2.1.1: "a token request containing a code_verifier parameter is accepted
/// only if a code_challenge parameter was present in the authorization request"
#[post(TOKEN_PATH)]
#[instrument(name = "Api::auth::get_token", skip_all)]
pub async fn get_token(
    headers: HeaderMap,
    TokenForm(request): TokenForm,
) -> Result<NoStore<ApiJson<TokenResponse>>, TokenError> {
    let credentials = ClientCredentials::from_request(&headers, &request)?;
    let client = authenticate_client(&credentials).await?;

    if &*request.grant_type != "authorization_code" {
        return Err(TokenError::unsupported_grant_type(
            "Only authorization_code is supported",
        ));
    }
    let code = request
        .code
        .ok_or(TokenError::invalid_request("Missing code"))?;
    let redirect_uri = request
        .redirect_uri
        .ok_or(TokenError::invalid_request("Missing redirect_uri"))?;
    if request
        .code_verifier
        .as_ref()
        .is_some_and(|verifier| !pkce::is_well_formed(verifier))
    {
        return Err(TokenError::invalid_request(
            "code_verifier must be 43 to 128 unreserved characters",
        ));
    }

    let mut tx = Database::global().start_transaction().await?;

    let Some(token) = OidcAuthenticationToken::lock_by_code(&mut tx, &code).await? else {
        return Err(TokenError::invalid_grant(
            "Unknown, expired or already redeemed code",
        ));
    };

    if token.client_id != client.client_id {
        return Err(TokenError::invalid_grant(
            "Code was not issued to this client",
        ));
    }

    if *redirect_uri != *token.redirect_uri {
        return Err(TokenError::invalid_grant(
            "redirect_uri differs from the authorization request",
        ));
    }

    match (&token.code_challenge, &request.code_verifier) {
        (Some(challenge), Some(verifier)) => {
            if !pkce::verifies(verifier, challenge) {
                return Err(TokenError::invalid_grant("Invalid code_verifier"));
            }
        }
        (Some(_), None) => {
            return Err(TokenError::invalid_grant(
                "code_verifier is required for this code",
            ));
        }
        (None, Some(_)) => {
            return Err(TokenError::invalid_grant(
                "code_verifier provided but no code_challenge was set",
            ));
        }
        (None, None) => {}
    }

    let iat = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(ApiError::map_server_error("Error calculating system time"))?
        .as_secs() as usize;
    let exp = iat + TOKEN_LIFETIME.as_secs() as usize;
    let iss = issuer().to_string();
    let sub = token.account.uuid().0.to_string();
    let scope_claims = ScopeClaims::new(&token.account, &token.scopes);

    let oidc = Oidc::global();
    let header = oidc.jwt_header();

    let id_token = jsonwebtoken::encode(
        &header,
        &IdTokenClaims {
            iss: iss.clone(),
            sub: sub.clone(),
            aud: token.client_id.0.to_string(),
            azp: token.client_id.0.to_string(),
            exp,
            iat,
            nonce: token.nonce.map(|x| x.to_string()),
            auth_time: token.auth_time.unix_timestamp(),
            scope_claims,
        },
        &oidc.encoding_key,
    )
    .map_err(ApiError::map_server_error("Couldn't encode JWT"))?;

    let access_token = jsonwebtoken::encode(
        &header,
        &AccessTokenClaims {
            iss,
            sub,
            aud: endpoint_url(USERINFO_PATH).to_string(),
            exp,
            iat,
            scope: token.scopes.join(" "),
        },
        &oidc.encoding_key,
    )
    .map_err(ApiError::map_server_error("Couldn't encode JWT"))?;

    OidcAuthenticationToken::delete_by_code(&mut tx, &token.code).await?;

    let redirect_uri = Url::parse(&token.redirect_uri).ok();
    let create_app_password = if redirect_uri.as_ref().and_then(Url::domain)
        == Mailcow::global().base_url.domain()
        && !token.account.has_app_password
    {
        let club = Club::find_by_uuid(&mut tx, token.account.club)
            .await?
            .ok_or(ApiError::server_error("Club not found"))?;
        !club.use_xauth
    } else {
        false
    };

    tx.commit().await?;

    if create_app_password {
        Mailcow::global().create_app_password(token.account.email.clone());
    }

    Ok(NoStore(ApiJson(TokenResponse {
        access_token,
        id_token,
        token_type: "Bearer".to_string(),
        expires_in: TOKEN_LIFETIME.as_secs() as usize,
    })))
}

/// The client the credentials authenticate
///
/// Unknown clients and wrong secrets are both `invalid_client`; the secret is compared in
/// constant time.
async fn authenticate_client(credentials: &ClientCredentials) -> Result<OidcClient, TokenError> {
    let client_id = Uuid::parse_str(&credentials.client_id)
        .map_err(|_| TokenError::invalid_client("Unknown client"))?;
    let client = OidcClient::find_by_client_id(Database::global(), OidcClientUuid(client_id))
        .await?
        .ok_or(TokenError::invalid_client("Unknown client"))?;

    if bool::from(
        client
            .client_secret
            .as_bytes()
            .ct_eq(credentials.client_secret.as_bytes()),
    ) {
        Ok(client)
    } else {
        Err(TokenError::invalid_client("Invalid client_secret"))
    }
}
