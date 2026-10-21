//! OIDC login: Login through an external OpenID provider
//!
//! An OIDC login runs the authorization code flow with PKCE, `state` and
//! `nonce`. Its outcome is either a known External identity, whose Identity
//! is logged in, or an unknown one, held in the session as pending until the
//! service binds it to a fresh Identity together with its Account.

use url::Url;

pub use self::error::BeginOidcLoginError;
pub use self::error::BindError;
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
pub use self::provider::OpenIdProvider;
pub(crate) use self::provider::OpenIdProviders;

mod db;
mod error;
#[cfg(feature = "test-support")]
mod fake;
mod login;
#[cfg(feature = "test-support")]
mod management;
pub(crate) mod models;
mod provider;
mod session;
#[cfg(all(test, feature = "test-support"))]
mod tests;

/// Setup of OIDC login
#[derive(Debug, Clone, Default)]
pub struct OidcSetup {
    /// The path of the service's route the OpenID providers send the browser back to
    ///
    /// Joined to the public origin, it is the redirect uri registered with
    /// every provider. The route hands its query to
    /// [`IdentityModule::finish_oidc_login`](crate::IdentityModule::finish_oidc_login).
    pub callback_path: String,

    /// The OpenID providers people may log in through, none to turn OIDC login off
    pub providers: Vec<OpenIdProviderSetup>,
}

/// Setup of one OpenID provider
#[derive(Debug, Clone)]
pub struct OpenIdProviderSetup {
    /// The service's own short name for the provider, e.g. `google`
    ///
    /// Names the provider when beginning a Login and in the list of active
    /// providers. Unique among the providers.
    pub id: String,

    /// What the frontend calls the provider, e.g. `Google`
    pub display_name: String,

    /// The provider's issuer, exactly as its ID tokens state it
    ///
    /// Its discovery document is fetched from below it. Kept as a string, as
    /// a parsed url would gain a trailing slash the provider does not use
    /// (`https://accounts.google.com`).
    pub issuer: String,

    /// The client id the provider issued the service
    pub client_id: String,

    /// How the service authenticates to the provider's token endpoint
    pub client_secret: ClientSecret,

    /// Whether the provider admits people on their first OIDC login
    ///
    /// Without, an unknown External identity is refused: only a Registration
    /// link would admit it.
    pub admits_on_first_login: bool,
}

/// How the service authenticates to a provider's token endpoint
#[derive(Clone)]
pub enum ClientSecret {
    /// A secret shared with the provider, sent as is
    Shared(String),
}

impl std::fmt::Debug for ClientSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClientSecret::Shared(_) => f.write_str("Shared(..)"),
        }
    }
}

/// Validate the OIDC setup of the service served from `origin`
pub(crate) fn build_providers(origin: &Url, setup: OidcSetup) -> Result<OpenIdProviders, String> {
    OpenIdProviders::new(origin, setup)
}
