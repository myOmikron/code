//! OIDC clients and the authorization codes issued to them

use futures_util::TryStreamExt;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::rorm;
use galvyn::rorm::and;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::sql::select::LockAcquire;
use galvyn::rorm::db::sql::select::LockStrength;
use galvyn::rorm::db::transaction::Transaction;
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
use url::Host;
use url::Url;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::ClubAccount;
use crate::models::oidc_client::db::OidcAuthenticationTokenModel;
use crate::models::oidc_client::db::OidcClientModel;

pub(in crate::models) mod db;

/// How long an authorization code can be redeemed
pub const AUTHORIZATION_CODE_LIFETIME: Duration = Duration::minutes(10);

/// A registered relying party
#[derive(Debug)]
pub struct OidcClient {
    /// Human-readable name for identifying the client
    pub name: MaxStr<255>,
    /// Client id
    pub client_id: OidcClientUuid,
    /// Secret the client authenticates with
    pub client_secret: MaxStr<64>,
    /// The registered redirect uri, as the admin entered it
    ///
    /// Kept as text, not as a parsed [`Url`]: parsing normalizes it (a bare origin gains a
    /// trailing `/`, the host is lowercased), while a client's `redirect_uri` has to match
    /// it character by character.
    pub redirect_uri: MaxStr<1024>,
}

/// Client id of an OIDC client
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct OidcClientUuid(pub Uuid);

impl OidcClient {
    /// Register a new client
    #[instrument(name = "OidcClient::create", skip(exe))]
    pub async fn create(
        exe: impl Executor<'_>,
        name: MaxStr<255>,
        redirect_uri: MaxStr<1024>,
    ) -> anyhow::Result<Self> {
        let client_secret = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 64))?;

        Ok(Self::from(
            rorm::insert(exe, OidcClientModel)
                .single(&OidcClientModel {
                    uuid: Uuid::new_v4(),
                    name,
                    client_secret,
                    redirect_uri,
                })
                .await?,
        ))
    }

    /// Find a client by its client id
    #[instrument(name = "OidcClient::find_by_client_id", skip(exe))]
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

    /// Whether a redirect uri may be registered for a client
    ///
    /// It must be an absolute url of printable ASCII without spaces, use `https`, or `http`
    /// on a loopback host, and must not contain a fragment
    /// ([RFC 6749 §3.1.2](https://www.rfc-editor.org/rfc/rfc6749#section-3.1.2)).
    /// RFC 3986 §2: "A URI is composed from a limited set of characters consisting of
    /// digits, letters, and a few graphic symbols." Whitespace would be trimmed by parsing
    /// and could never be matched.
    pub fn is_valid_redirect_uri(redirect_uri: &str) -> bool {
        if !redirect_uri.bytes().all(|byte| byte.is_ascii_graphic()) {
            return false;
        }
        let Ok(redirect_uri) = Url::parse(redirect_uri) else {
            return false;
        };
        if redirect_uri.fragment().is_some() {
            return false;
        }
        match redirect_uri.scheme() {
            "https" => redirect_uri.host().is_some(),
            "http" => match redirect_uri.host() {
                Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
                Some(Host::Ipv4(ip)) => ip.is_loopback(),
                Some(Host::Ipv6(ip)) => ip.is_loopback(),
                None => false,
            },
            _ => false,
        }
    }

    /// Delete the client together with its authorization codes
    #[instrument(name = "OidcClient::delete", skip(exe))]
    pub async fn delete(exe: impl Executor<'_>, client_id: OidcClientUuid) -> anyhow::Result<()> {
        rorm::delete(exe, OidcClientModel)
            .condition(OidcClientModel.uuid.equals(client_id.0))
            .await?;

        Ok(())
    }

    /// Find all clients
    #[instrument(name = "OidcClient::find_all", skip(exe))]
    pub async fn find_all(exe: impl Executor<'_>) -> anyhow::Result<Vec<Self>> {
        Ok(rorm::query(exe, OidcClientModel)
            .order_asc(OidcClientModel.name)
            .stream()
            .map_ok(OidcClient::from)
            .try_collect()
            .await?)
    }
}

/// A short-lived authorization code
pub struct OidcAuthenticationToken {
    /// The code
    pub code: MaxStr<64>,
    /// The client the code was issued to
    pub client_id: OidcClientUuid,
    /// The point in time the code expires
    pub expires_at: OffsetDateTime,
    /// The redirect uri the code was issued for
    pub redirect_uri: MaxStr<1024>,
    /// The account that authorized the client
    pub account: ClubAccount,
    /// Nonce of the authorization request
    pub nonce: Option<MaxStr<255>>,
    /// Scopes the client requested
    pub scopes: Vec<String>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
    /// When the account signed in
    pub auth_time: OffsetDateTime,
}

impl OidcAuthenticationToken {
    /// Issue a new authorization code
    #[instrument(name = "OidcAuthenticationToken::create", skip(exe))]
    pub async fn create(
        exe: impl Executor<'_>,
        CreateOidcAuthenticationToken {
            client_id,
            redirect_uri,
            account,
            nonce,
            scopes,
            code_challenge,
            auth_time,
        }: CreateOidcAuthenticationToken,
    ) -> anyhow::Result<Self> {
        let mut guard = exe.ensure_transaction().await?;

        let code = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 64))?;

        let token = rorm::insert(guard.as_mut(), OidcAuthenticationTokenModel)
            .single(&OidcAuthenticationTokenModel {
                uuid: Uuid::new_v4(),
                client: ForeignModelByField(client_id.0),
                redirect_uri,
                code,
                expires_at: OffsetDateTime::now_utc() + AUTHORIZATION_CODE_LIFETIME,
                account: ForeignModelByField(account.0),
                nonce,
                scopes: Json(scopes),
                code_challenge,
                auth_time: Some(auth_time),
            })
            .await?;

        let account = ClubAccount::get_by_uuid(guard.as_mut(), account)
            .await?
            .ok_or(ApiError::bad_request("Account not found"))?;

        guard.commit_if_owned().await?;

        Self::from_model(token, account)
            .ok_or_else(|| anyhow::anyhow!("Stored code lacks auth_time"))
    }

    /// Retrieve an unexpired authorization code, locking its row until `tx` ends
    ///
    /// The row lock (`SELECT ... FOR UPDATE`) makes a concurrent redemption of the same
    /// code wait until this one commits; deleting the code in the same transaction then
    /// leaves the waiting one without a row, so a code is redeemed only once. A code issued
    /// before the login time was recorded is not found, nor is one whose account is no club
    /// account anymore.
    #[instrument(name = "OidcAuthenticationToken::lock_by_code", skip(tx))]
    pub async fn lock_by_code(
        tx: &mut Transaction,
        code: &str,
    ) -> anyhow::Result<Option<OidcAuthenticationToken>> {
        let now = OffsetDateTime::now_utc();
        let Some(token) = rorm::query(&mut *tx, OidcAuthenticationTokenModel)
            .condition(and![
                OidcAuthenticationTokenModel.expires_at.greater_than(now),
                OidcAuthenticationTokenModel.code.equals(code)
            ])
            .lock(LockStrength::Update, LockAcquire::Wait)
            .optional()
            .await?
        else {
            return Ok(None);
        };

        let Some(account) =
            ClubAccount::get_by_uuid(&mut *tx, AccountUuid(token.account.0)).await?
        else {
            return Ok(None);
        };

        Ok(Self::from_model(token, account))
    }

    /// Delete an authorization code
    #[instrument(name = "OidcAuthenticationToken::delete_by_code", skip(exe))]
    pub async fn delete_by_code(exe: impl Executor<'_>, code: &MaxStr<64>) -> anyhow::Result<()> {
        rorm::delete(exe, OidcAuthenticationTokenModel)
            .condition(OidcAuthenticationTokenModel.code.equals(&**code))
            .await?;

        Ok(())
    }

    /// Delete all expired authorization codes
    #[instrument(name = "OidcAuthenticationToken::clear_expired", skip(exe))]
    pub async fn clear_expired(exe: impl Executor<'_>) -> anyhow::Result<()> {
        rorm::delete(exe, OidcAuthenticationTokenModel)
            .condition(
                OidcAuthenticationTokenModel
                    .expires_at
                    .less_equals(OffsetDateTime::now_utc()),
            )
            .await?;

        Ok(())
    }

    /// Combine a stored code with the account it was issued for
    ///
    /// `None` for a code without `auth_time`.
    fn from_model(token: OidcAuthenticationTokenModel, account: ClubAccount) -> Option<Self> {
        Some(Self {
            code: token.code,
            client_id: OidcClientUuid(token.client.0),
            expires_at: token.expires_at,
            redirect_uri: token.redirect_uri,
            account,
            nonce: token.nonce,
            scopes: token.scopes.0,
            code_challenge: token.code_challenge,
            auth_time: token.auth_time?,
        })
    }
}

/// Request to issue an authorization code
#[derive(Debug)]
pub struct CreateOidcAuthenticationToken {
    /// The client the code is issued to
    pub client_id: OidcClientUuid,
    /// The redirect uri the code is issued for
    pub redirect_uri: MaxStr<1024>,
    /// The account that authorized the client
    pub account: AccountUuid,
    /// Nonce of the authorization request
    pub nonce: Option<MaxStr<255>>,
    /// Scopes the client requested
    pub scopes: Vec<String>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
    /// When the account signed in
    pub auth_time: OffsetDateTime,
}

impl From<OidcClientModel> for OidcClient {
    fn from(model: OidcClientModel) -> Self {
        Self {
            name: model.name,
            client_id: OidcClientUuid(model.uuid),
            client_secret: model.client_secret,
            redirect_uri: model.redirect_uri,
        }
    }
}
