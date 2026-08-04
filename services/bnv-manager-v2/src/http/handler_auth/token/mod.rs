//! Translate an authentication code to a token and claims

use std::time::SystemTime;
use std::time::UNIX_EPOCH;

use base64ct::LineEnding;
use galvyn::core::Module;
use galvyn::core::re_exports::axum::Form;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::post;
use galvyn::rorm::Database;
use jsonwebtoken::Algorithm;
use jsonwebtoken::EncodingKey;
use jsonwebtoken::Header;
use rsa::pkcs1::EncodeRsaPrivateKey;
use subtle::ConstantTimeEq;
use tracing::instrument;

use crate::config::MAILCOW_BASE_URL;
use crate::config::ORIGIN;
use crate::http::handler_auth::token::schema::Claims;
use crate::http::handler_auth::token::schema::EmailClaim;
use crate::http::handler_auth::token::schema::ProfileClaim;
use crate::http::handler_auth::token::schema::TokenRequest;
use crate::http::handler_auth::token::schema::TokenResponse;
use crate::models::club::Club;
use crate::models::oidc_provider::OidcAuthenticationToken;
use crate::models::oidc_provider::OidcClient;
use crate::models::oidc_provider::OidcClientUuid;
use crate::modules::mailcow::Mailcow;
use crate::modules::oidc::Oidc;

pub mod schema;

#[post("/token")]
#[instrument(name = "Api::auth::token")]
pub async fn get_token(
    Form(TokenRequest {
        grant_type,
        code,
        redirect_uri,
        client_id,
        client_secret,
        code_verifier,
    }): Form<TokenRequest>,
) -> ApiResult<ApiJson<TokenResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    if grant_type != "authorization_code" {
        return Err(ApiError::bad_request("Unsupported grant_type"));
    }

    let provider = OidcClient::find_by_client_id(&mut tx, OidcClientUuid(client_id))
        .await?
        .ok_or(ApiError::bad_request("Invalid client_id"))?;

    // Security:
    // Use constant time equals to not leak correct secret bytes
    if bool::from(
        provider
            .client_secret
            .as_bytes()
            .ct_ne(client_secret.as_bytes()),
    ) {
        return Err(ApiError::bad_request("Invalid client_secret"));
    }

    let token = OidcAuthenticationToken::get_by_code(&mut tx, code).await?;
    let Some(token) = token else {
        return Err(ApiError::bad_request("Invalid authorization token"));
    };

    if token.client_id != OidcClientUuid(client_id) {
        return Err(ApiError::bad_request("Code was not issued to this client"));
    }

    if token.redirect_url
        != redirect_uri
            .parse()
            .map_err(|_| ApiError::bad_request("Bad redirect_url"))?
    {
        return Err(ApiError::bad_request("Invalid redirect_uri"));
    }

    // PKCE validation (RFC 7636 Section 4.6)
    match (&token.code_challenge, &code_verifier) {
        (Some(challenge), Some(verifier)) => {
            use base64ct::Base64UrlUnpadded;
            use base64ct::Encoding;
            use sha2::Digest;

            let hash = sha2::Sha256::digest(verifier.as_bytes());
            let computed_challenge = Base64UrlUnpadded::encode_string(&hash);

            if computed_challenge != **challenge {
                return Err(ApiError::bad_request("Invalid code_verifier"));
            }
        }
        (Some(_), None) => {
            return Err(ApiError::bad_request(
                "code_verifier is required for this authorization code",
            ));
        }
        (None, Some(_)) => {
            return Err(ApiError::bad_request(
                "code_verifier provided but no code_challenge was set",
            ));
        }
        (None, None) => {}
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(ApiError::map_server_error("Error calculating system time"))?
        .as_secs() as usize;
    let exp = now + 300;

    #[allow(clippy::expect_used)]
    let mut claims = Claims {
        iss: ORIGIN.to_string(),
        sub: token.account.uuid().0.to_string(),
        aud: token.client_id.0.to_string(),
        iat: now,
        exp,
        nonce: token.nonce.map(|x| x.to_string()),
        ..Default::default()
    };

    if token.scopes.iter().any(|x| x == "profile") {
        claims.profile_claim = Some(ProfileClaim {
            preferred_username: token.account.username.to_string(),
            name: token.account.display_name.to_string(),
        });
    }

    if token.scopes.iter().any(|x| x == "email") {
        claims.email_claim = Some(EmailClaim {
            email: token.account.email.to_string(),
            email_verified: true,
        });
    }

    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(Oidc::global().kid.clone());

    let encoding_key = EncodingKey::from_rsa_pem(
        Oidc::global()
            .private_key
            .to_pkcs1_pem(LineEnding::LF)
            .map_err(ApiError::map_server_error("Couldn't convert to pem"))?
            .as_bytes(),
    )
    .map_err(ApiError::map_server_error("Couldn't parse key"))?;

    let id_token = jsonwebtoken::encode(&header, &claims, &encoding_key)
        .map_err(ApiError::map_server_error("Couldn't encode JWT"))?;

    #[allow(clippy::expect_used)]
    {
        claims.aud = ORIGIN
            .get()
            .join("api/v1/auth/userinfo")
            .expect("valid url")
            .to_string();
    }

    let access_token = jsonwebtoken::encode(&header, &claims, &encoding_key)
        .map_err(ApiError::map_server_error("Couldn't encode JWT"))?;

    OidcAuthenticationToken::delete_by_code(&mut tx, &token.code).await?;

    // -------------
    // APP Password Hook follows
    // -------------
    if token.redirect_url.domain() == MAILCOW_BASE_URL.domain() && !token.account.has_app_password {
        let club = Club::find_by_uuid(&mut tx, token.account.club)
            .await?
            .ok_or(ApiError::bad_request("Club not found"))?;

        if !club.use_xauth {
            Mailcow::global().create_app_password(token.account.email.clone());
        }
    }

    tx.commit().await?;

    Ok(ApiJson(TokenResponse {
        access_token,
        id_token,
        token_type: "Bearer".to_string(),
        expires_in: 300,
    }))
}
