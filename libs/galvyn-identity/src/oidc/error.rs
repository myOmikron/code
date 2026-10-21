//! The ways the OIDC operations fail

use galvyn::core::stuff::api_error::core::CoreApiError;

use crate::error::internal_from;

/// Failure of [`IdentityModule::begin_oidc_login`](crate::IdentityModule::begin_oidc_login)
#[derive(Debug)]
pub enum BeginOidcLoginError {
    /// No OpenID provider is configured under this id
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
    /// The callback's `state` is not the one the Login began with
    StateMismatch,
    /// The provider sent the browser back with an error instead of a code,
    /// e.g. because the person cancelled
    Denied {
        /// The provider's `error` code
        error: String,
    },
    /// The callback carries neither a code nor an error
    MissingCode,
    /// The provider the Login began with is no longer configured
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
    /// The External identity is unknown and the provider does not admit
    /// people on their first OIDC login
    NotAdmitted,
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
    /// The External identity is bound already
    AlreadyBound,
    /// The issuer or subject is longer than 255 bytes
    TooLong,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

internal_from!(BeginOidcLoginError, FinishOidcLoginError, BindError);

#[cfg(feature = "test-support")]
internal_from!(EnrollExternalIdentityError);
