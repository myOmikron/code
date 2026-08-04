//! OIDC related models

use futures_util::TryStreamExt;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::rorm;
use galvyn::rorm::and;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModelByField;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Deserialize;
use serde::Serialize;
use time::Duration;
use time::OffsetDateTime;
use tracing::instrument;
use url::Url;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::ClubAccount;
use crate::models::account::db::ClubAccountModel;
use crate::models::oidc_provider::db::OidcAuthenticationTokenModel;
use crate::models::oidc_provider::db::OidcClientModel;

pub(in crate::models) mod db;

/// Representation of an oidc provider
#[derive(Debug)]
pub struct OidcClient {
    /// Human-readable name for identifying the provider
    pub name: MaxStr<255>,
    /// Client id of the provider
    pub client_id: OidcClientUuid,
    /// Client secret of the provider
    pub client_secret: MaxStr<64>,
    /// The redirect url that should be valid
    pub redirect_uri: Url,
}

/// Client id of an oidc provider
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct OidcClientUuid(pub Uuid);

impl OidcClient {
    /// Create a new oidc provider
    #[instrument(name = "OidcProvider::create", skip(exe))]
    pub async fn create(
        exe: impl Executor<'_>,
        name: MaxStr<255>,
        redirect_url: Url,
    ) -> anyhow::Result<Self> {
        let client_secret = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 64))?;

        Ok(Self::from(
            rorm::insert(exe, OidcClientModel)
                .single(&OidcClientModel {
                    uuid: Uuid::new_v4(),
                    name,
                    client_secret,
                    redirect_url,
                })
                .await?,
        ))
    }

    /// Find an oidc provider by its client id
    #[instrument(name = "OidcProvider::find_by_client_id", skip(exe))]
    pub async fn find_by_client_id(
        exe: impl Executor<'_>,
        client_id: OidcClientUuid,
    ) -> anyhow::Result<Option<OidcClient>> {
        Ok(rorm::query(exe, OidcClientModel)
            .condition(OidcClientModel.uuid.equals(client_id.0))
            .optional()
            .await?
            .map(OidcClient::from))
    }

    /// Find all OIDC providers
    #[instrument(name = "OidcProvider::find_all", skip(exe))]
    pub async fn find_all(exe: impl Executor<'_>) -> anyhow::Result<Vec<Self>> {
        Ok(rorm::query(exe, OidcClientModel)
            .order_asc(OidcClientModel.name)
            .stream()
            .map_ok(OidcClient::from)
            .try_collect()
            .await?)
    }
}

/// A short-lived authentication token
pub struct OidcAuthenticationToken {
    /// The code
    pub code: MaxStr<64>,
    /// The client id that is linked to this token
    pub client_id: OidcClientUuid,
    /// The point in time the token will expire
    pub expires_at: OffsetDateTime,
    /// The redirect url linked to the token
    pub redirect_url: Url,
    /// Linked account id
    pub account: ClubAccount,
    /// Optional nonce to protect against replay attacks
    pub nonce: Option<MaxStr<255>>,
    /// Scopes the client has requested
    pub scopes: Vec<String>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
}

impl OidcAuthenticationToken {
    /// Create a new authentication token
    #[instrument(name = "OidcAuthenticationToken::create", skip(exe))]
    pub async fn create(
        exe: impl Executor<'_>,
        CreateOidcAuthenticationToken {
            client_id,
            redirect_url,
            account,
            nonce,
            scopes,
            code_challenge,
        }: CreateOidcAuthenticationToken,
    ) -> anyhow::Result<Self> {
        let mut guard = exe.ensure_transaction().await?;

        let code = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 64))?;

        let token = rorm::insert(guard.get_transaction(), OidcAuthenticationTokenModel)
            .single(&OidcAuthenticationTokenModel {
                uuid: Uuid::new_v4(),
                client: ForeignModelByField(client_id.0),
                redirect_url,
                code,
                expires_at: OffsetDateTime::now_utc() + Duration::minutes(10),
                account: ForeignModelByField(account.0),
                nonce,
                scopes: Json(scopes),
                code_challenge,
            })
            .await?;

        let account = ClubAccount::get_by_uuid(guard.get_transaction(), account)
            .await?
            .ok_or(ApiError::bad_request("Account not found"))?;

        guard.commit().await?;

        Ok(Self {
            code: token.code,
            client_id: OidcClientUuid(token.client.0),
            expires_at: token.expires_at,
            redirect_url: token.redirect_url,
            account,
            nonce: token.nonce,
            scopes: token.scopes.0,
            code_challenge: token.code_challenge,
        })
    }

    /// Retrieve an authentication token
    #[instrument(name = "OidcAuthenticationToken::find_by_code", skip(exe))]
    pub async fn get_by_code(
        exe: impl Executor<'_>,
        code: MaxStr<64>,
    ) -> anyhow::Result<Option<OidcAuthenticationToken>> {
        let now = OffsetDateTime::now_utc();
        Ok(rorm::query(
            exe,
            (
                OidcAuthenticationTokenModel,
                OidcAuthenticationTokenModel
                    .account
                    .query_as(ClubAccountModel),
            ),
        )
        .condition(and![
            OidcAuthenticationTokenModel.expires_at.greater_than(now),
            OidcAuthenticationTokenModel.code.equals(&*code)
        ])
        .optional()
        .await?
        .map(|(oidc_auth_token, account)| Self {
            code: oidc_auth_token.code,
            client_id: OidcClientUuid(oidc_auth_token.client.0),
            expires_at: oidc_auth_token.expires_at,
            redirect_url: oidc_auth_token.redirect_url,
            account: ClubAccount::from(account),
            nonce: oidc_auth_token.nonce,
            scopes: oidc_auth_token.scopes.0,
            code_challenge: oidc_auth_token.code_challenge,
        }))
    }

    /// Delete an authentication token by its code
    #[instrument(name = "OidcAuthenticationToken::delete_by_code", skip(exe))]
    pub async fn delete_by_code(exe: impl Executor<'_>, code: &MaxStr<64>) -> anyhow::Result<()> {
        rorm::delete(exe, OidcAuthenticationTokenModel)
            .condition(OidcAuthenticationTokenModel.code.equals(&**code))
            .await?;

        Ok(())
    }
}

/// Request to create a oidc authentication token
#[derive(Debug)]
pub struct CreateOidcAuthenticationToken {
    /// The client this token should be linked to
    pub client_id: OidcClientUuid,
    /// Redirect url
    pub redirect_url: Url,
    /// The account associated with the request
    pub account: AccountUuid,
    /// Optional nonce to avoid replay attacks
    pub nonce: Option<MaxStr<255>>,
    /// Scopes the client has requested
    pub scopes: Vec<String>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
}

impl From<OidcClientModel> for OidcClient {
    fn from(model: OidcClientModel) -> Self {
        Self {
            name: model.name,
            client_id: OidcClientUuid(model.uuid),
            client_secret: model.client_secret,
            redirect_uri: model.redirect_url,
        }
    }
}
