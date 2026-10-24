//! OIDC login: Login through an external OpenID provider
//!
//! The OpenID providers live in the module's tables, added at runtime (e.g.
//! by [`AddOpenIdProviderCommand`]). An OIDC login runs the authorization
//! code flow with PKCE, `state` and `nonce`. Its outcome is a known External
//! identity, whose Identity the service logs in once it admits it (e.g. its
//! Account is not locked), or an unknown one. Through an open provider an
//! unknown one is admitted as [`OidcSetup::open_admission`] says: held in the
//! session as pending until the service binds it together with its Account,
//! or handed to the service's [`AdmissionHook`] right away.

use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm::db::transaction::Transaction;
use serde_json::Map;
use serde_json::Value;
use url::Url;

pub use self::admin::openid_provider_admin_routes;
pub use self::cli::AddOpenIdProviderCommand;
pub use self::cli::CliAdmission;
pub use self::error::AddOpenIdProviderError;
pub use self::error::BeginOidcLoginError;
pub use self::error::BindError;
pub use self::error::BulkDeleteOpenIdProviderError;
pub use self::error::DeleteOpenIdProviderError;
pub use self::error::EditOpenIdProviderError;
#[cfg(feature = "test-support")]
pub use self::error::EnrollExternalIdentityError;
pub use self::error::FinishOidcLoginError;
#[cfg(feature = "test-support")]
pub use self::fake::FakeOpenIdProvider;
#[cfg(feature = "test-support")]
pub use self::fake::FakePerson;
#[cfg(feature = "test-support")]
pub use self::fake::Tamper;
pub use self::login::BoundExternalIdentity;
pub use self::login::OidcCallback;
pub use self::login::OidcLoginOutcome;
pub use self::login::PendingExternalIdentity;
pub use self::models::ExternalLogin;
pub use self::provider::Admission;
pub use self::provider::DEFAULT_IDENTIFYING_CLAIM;
pub use self::provider::InvalidOpenIdProvider;
pub use self::provider::NewOpenIdProvider;
pub use self::provider::OpenIdProvider;
pub use self::provider::OpenIdProviderEdit;
pub(crate) use self::provider::OpenIdProviders;
use crate::IdentityUuid;

pub mod admin;
mod claims;
mod cli;
mod db;
mod error;
#[cfg(feature = "test-support")]
mod fake;
mod login;
#[cfg(feature = "test-support")]
mod management;
pub(crate) mod models;
mod provider;
mod providers;
mod session;
#[cfg(all(test, feature = "test-support"))]
mod tests;

/// Setup of OIDC login
#[derive(Debug, Clone, Default)]
pub struct OidcSetup {
    /// The path the OpenID providers send the browser back to, empty to turn OIDC login off
    ///
    /// The provider's slug follows it: joined to the public origin,
    /// `<callback_path>/<slug>` is the redirect uri registered with each
    /// provider. The route hands the slug and its query to
    /// [`IdentityModule::finish_oidc_login`](crate::IdentityModule::finish_oidc_login).
    pub callback_path: String,

    /// PEM bundles of internal CAs the providers' certificates may chain to,
    /// on top of the system's
    pub root_certificates: Vec<String>,

    /// How the first OIDC login through an open provider is admitted
    pub open_admission: OpenAdmission,
}

/// How the first OIDC login through an open provider is admitted
#[derive(Clone, Default)]
pub enum OpenAdmission {
    /// The External identity is held in the session as pending
    ///
    /// The service binds it to a fresh Identity together with its Account
    /// through [`IdentityModule::bind_pending_external_identity`](crate::IdentityModule::bind_pending_external_identity),
    /// e.g. after asking the person for a username.
    #[default]
    PendingInSession,
    /// The module creates the Identity with its External identity and asks the hook
    ///
    /// The hook creates the service's Account in the same transaction or
    /// declines; a decline leaves nothing behind.
    Hook(Arc<dyn AdmissionHook>),
}

impl fmt::Debug for OpenAdmission {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OpenAdmission::PendingInSession => f.write_str("PendingInSession"),
            OpenAdmission::Hook(_) => f.write_str("Hook(..)"),
        }
    }
}

/// The service's decision on a first OIDC login, see [`OpenAdmission::Hook`]
pub trait AdmissionHook: Send + Sync + 'static {
    /// Create the Account of `identity` in `tx`, or decline
    ///
    /// `identity` and its External identity are inserted in `tx` already.
    /// [`FirstLoginDecision::Decline`] and an error roll `tx` back.
    fn admit<'a>(
        &'a self,
        tx: &'a mut Transaction,
        identity: IdentityUuid,
        claims: &'a ExternalClaims,
    ) -> Pin<Box<dyn Future<Output = Result<FirstLoginDecision, CoreApiError>> + Send + 'a>>;
}

/// What an [`AdmissionHook`] decided
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirstLoginDecision {
    /// The Account is created: commit and log in
    Admit,
    /// The person is not admitted: nothing is kept
    Decline,
}

/// What an OpenID provider stated about a person in a verified ID token
#[derive(Debug, Clone, PartialEq)]
pub struct ExternalClaims {
    /// The slug of the provider that vouched for the person
    pub provider: String,
    /// The provider's issuer
    pub issuer: String,
    /// The value of the provider's identifying claim
    pub value: String,
    /// The email the provider stated, if any
    pub email: Option<String>,
    /// Whether the provider verified that email
    pub email_verified: bool,
    /// Every claim of the ID token
    pub claims: Map<String, Value>,
}

/// Validate the OIDC setup of the service served from `origin`
pub(crate) fn build_providers(origin: &Url, setup: OidcSetup) -> Result<OpenIdProviders, String> {
    OpenIdProviders::new(origin, setup)
}
