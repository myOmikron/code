use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::HeaderMap;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use jsonwebtoken::Algorithm;
use jsonwebtoken::Validation;
use rsa::pkcs1::LineEnding;
use rsa::pkcs8::EncodePublicKey;
use tracing::instrument;

use crate::config::ORIGIN;
use crate::modules::oidc::Oidc;

mod schema;

#[get("/userinfo")]
#[instrument(name = "Api::auth::userinfo")]
pub async fn get_userinfo(headers: HeaderMap) -> ApiResult<ApiJson<schema::Claims>> {
    let Some(header) = headers.get("Authorization") else {
        return Err(ApiError::bad_request("Missing Authorization header"));
    };

    let token = header
        .to_str()
        .map_err(ApiError::map_server_error("Invalid header value"))?
        .strip_prefix("Bearer ")
        .ok_or(ApiError::bad_request("Missing Bearer prefix"))?;

    let mut validation = Validation::new(Algorithm::RS256);
    #[allow(clippy::expect_used)]
    validation.set_audience(&[ORIGIN
        .get()
        .join("api/v1/auth/userinfo")
        .expect("Valid url")
        .to_string()]);

    let token = jsonwebtoken::decode::<crate::http::handler_auth::token::schema::Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_rsa_pem(
            Oidc::global()
                .private_key
                .to_public_key()
                .to_public_key_pem(LineEnding::LF)
                .map_err(ApiError::map_server_error("Couldn't convert to pem"))?
                .as_bytes(),
        )
        .map_err(ApiError::map_server_error("Couldn't parse key"))?,
        &validation,
    )
    .map_err(ApiError::map_server_error("Invalid token"))?;

    Ok(ApiJson(schema::Claims {
        sub: token.claims.sub,
        email_claim: token.claims.email_claim,
        profile_claim: token.claims.profile_claim,
    }))
}
