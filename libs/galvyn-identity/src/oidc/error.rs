//! The ways the OIDC operations fail

use galvyn::core::stuff::api_error::core::CoreApiError;

use super::provider::InvalidOpenIdProvider;
use crate::error::internal_from;

/// Failure of [`IdentityModule::add_openid_provider`](crate::IdentityModule::add_openid_provider)
#[derive(Debug)]
pub enum AddOpenIdProviderError {
    /// A field of the provider is unusable
    Invalid(InvalidOpenIdProvider),
    /// Another provider has the slug
    SlugTaken,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

impl std::fmt::Display for AddOpenIdProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AddOpenIdProviderError::Invalid(invalid) => invalid.fmt(f),
            AddOpenIdProviderError::SlugTaken => f.write_str("another provider has the slug"),
            AddOpenIdProviderError::Internal(error) => write!(f, "{error:?}"),
        }
    }
}

impl std::error::Error for AddOpenIdProviderError {}

/// Failure of [`IdentityModule::begin_oidc_login`](crate::IdentityModule::begin_oidc_login)
#[derive(Debug)]
pub enum BeginOidcLoginError {
    /// No OpenID provider has this slug, or OIDC login is off
    UnknownProvider,
    /// The provider's discovery document cannot be fetched
    ProviderUnavailable,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`IdentityModule::finish_oidc_login`](crate::IdentityModule::finish_oidc_login)
#[derive(Debug)]
pub enum FinishOidcLoginError {
    /// The session has no Login in progress
    NoLoginInProgress,
    /// The callback's `state` is not the one the Login began with, or it
    /// came back for another provider than the Login began with
    StateMismatch,
    /// The provider sent the browser back with an error instead of a code,
    /// e.g. because the person cancelled
    Denied {
        /// The provider's `error` code
        error: String,
    },
    /// The callback carries neither a code nor an error
    MissingCode,
    /// The provider the Login began with is gone
    UnknownProvider,
    /// The provider cannot be reached
    ProviderUnavailable,
    /// The provider did not exchange the code for tokens
    TokenExchangeFailed,
    /// The provider's answer carries no valid ID token for this Login
    ///
    /// Covers a wrong issuer, audience or nonce, an expired token and a bad
    /// signature alike.
    InvalidIdToken,
    /// The ID token does not state the provider's identifying claim
    MissingIdentifyingClaim,
    /// The External identity is unknown and the provider is invite only
    NotAdmitted,
    /// The service's [`AdmissionHook`](super::AdmissionHook) declined the
    /// unknown External identity; nothing is kept
    Declined,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`IdentityModule::bind_pending_external_identity`](crate::IdentityModule::bind_pending_external_identity)
#[derive(Debug)]
pub enum BindError {
    /// The session holds no pending External identity, or it expired
    NothingPending,
    /// The External identity got bound meanwhile, e.g. by a second request
    ///
    /// The transaction is aborted and has to be rolled back.
    AlreadyBound,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`IdentityModule::enroll_external_identity_without_ceremony`](crate::IdentityModule::enroll_external_identity_without_ceremony)
#[cfg(feature = "test-support")]
#[derive(Debug)]
pub enum EnrollExternalIdentityError {
    /// The Identity is local: it holds Passkeys
    LocalIdentity,
    /// The Identity is external already: it holds its one External identity
    ExternalIdentity,
    /// The External identity is bound already
    AlreadyBound,
    /// No OpenID provider has the slug
    UnknownProvider,
    /// The provider was never discovered, so its issuer is unknown
    UndiscoveredProvider,
    /// The value is longer than 255 bytes
    TooLong,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

internal_from!(
    AddOpenIdProviderError,
    BeginOidcLoginError,
    FinishOidcLoginError,
    BindError
);

#[cfg(feature = "test-support")]
internal_from!(EnrollExternalIdentityError);
