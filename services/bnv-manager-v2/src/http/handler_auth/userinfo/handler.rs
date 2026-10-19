//! Handler of the userinfo endpoint
//!
//! OIDC Core §5.3: "The UserInfo Endpoint MUST support the use of the HTTP GET and HTTP POST
//! methods" and "MUST accept Access Tokens as OAuth 2.0 Bearer Token Usage \[RFC6750\]".

use galvyn::core::Module;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use jsonwebtoken::Algorithm;
use jsonwebtoken::Validation;
use tracing::instrument;
use uuid::Uuid;

use crate::http::handler_auth::USERINFO_PATH;
use crate::http::handler_auth::endpoint_url;
use crate::http::handler_auth::issuer;
use crate::http::handler_auth::token::schema::AccessTokenClaims;
use crate::http::handler_auth::token::schema::ScopeClaims;
use crate::http::handler_auth::userinfo::request::BearerToken;
use crate::http::handler_auth::userinfo::schema::UserinfoError;
use crate::http::handler_auth::userinfo::schema::UserinfoResponse;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::oidc_client::scope::Scope;
use crate::modules::oidc::Oidc;

/// Claims about the end-user the bearer access token grants
#[get(USERINFO_PATH)]
#[instrument(name = "Api::auth::get_userinfo", skip_all)]
pub async fn get_userinfo(
    BearerToken(token): BearerToken,
) -> Result<ApiJson<UserinfoResponse>, UserinfoError> {
    userinfo(&token).await.map(ApiJson)
}

/// Claims about the end-user the bearer access token grants
#[post(USERINFO_PATH)]
#[instrument(name = "Api::auth::post_userinfo", skip_all)]
pub async fn post_userinfo(
    BearerToken(token): BearerToken,
) -> Result<ApiJson<UserinfoResponse>, UserinfoError> {
    userinfo(&token).await.map(ApiJson)
}

/// The userinfo response for the bearer `token`
///
/// The account is reloaded on every call, so a removed member loses access before the
/// token expires, and the claims are those of the scopes recorded in the token.
async fn userinfo(token: &str) -> Result<UserinfoResponse, UserinfoError> {
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[endpoint_url(USERINFO_PATH).to_string()]);
    validation.set_issuer(&[issuer().to_string()]);
    let claims =
        jsonwebtoken::decode::<AccessTokenClaims>(token, &Oidc::global().decoding_key, &validation)
            .map_err(|_| UserinfoError::InvalidToken)?
            .claims;

    let uuid = Uuid::parse_str(&claims.sub).map_err(|_| UserinfoError::InvalidToken)?;
    let Some(Account::ClubMember(account)) =
        Account::get_by_uuid(Database::global(), AccountUuid(uuid)).await?
    else {
        return Err(UserinfoError::InvalidToken);
    };

    let scopes = Scope::parse_list(&claims.scope).map_err(|_| UserinfoError::InvalidToken)?;
    Ok(UserinfoResponse {
        sub: claims.sub,
        scope_claims: ScopeClaims::new(&account, &scopes),
    })
}
