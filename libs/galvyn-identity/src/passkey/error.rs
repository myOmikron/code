//! The ways the Passkey operations fail

use galvyn::core::stuff::api_error::core::CoreApiError;

use crate::error::LinkError;
use crate::error::internal_from;

/// Failure of [`IdentityModule::begin_login`](crate::IdentityModule::begin_login)
#[derive(Debug)]
pub enum BeginLoginError {
    /// The Identity holds no Passkey to log in with
    NoPasskey,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`IdentityModule::finish_login`](crate::IdentityModule::finish_login)
#[derive(Debug)]
pub enum FinishLoginError {
    /// The session has no Login in progress
    NoLoginInProgress,
    /// The authenticator response is not a WebAuthn credential
    MalformedCredential,
    /// The authenticator response does not prove control of a Passkey
    VerificationFailed,
    /// The Identity the Login targets is gone
    UnknownIdentity,
    /// The Identity holds no Passkey with the credential id the authenticator answered with
    UnknownPasskey,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`IdentityModule::finish_link_enrollment`](crate::IdentityModule::finish_link_enrollment)
#[derive(Debug)]
pub enum FinishEnrollmentError {
    /// The session has no Enrollment through this Registration link in progress
    NoEnrollmentInProgress,
    /// The authenticator response is not a WebAuthn credential
    MalformedCredential,
    /// The Registration link cannot be used
    Link(LinkError),
    /// The authenticator response does not match the Enrollment
    VerificationFailed,
    /// The Passkey is already enrolled
    AlreadyEnrolled,
    /// The Identity is external: it holds an External identity, never a Passkey
    ///
    /// Only with the `oidc` feature; the variant exists without it, so a
    /// service's matches compile however the workspace unifies features.
    ExternalIdentity,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`IdentityModule::finish_device_enrollment`](crate::IdentityModule::finish_device_enrollment)
#[derive(Debug)]
pub enum FinishDeviceEnrollmentError {
    /// The session has no Enrollment of an additional device in progress
    NoEnrollmentInProgress,
    /// The authenticator response is not a WebAuthn credential
    MalformedCredential,
    /// The authenticator response does not match the Enrollment
    VerificationFailed,
    /// The Passkey is already enrolled
    AlreadyEnrolled,
    /// The Identity is external: it holds an External identity, never a Passkey
    ///
    /// Only with the `oidc` feature; the variant exists without it, so a
    /// service's matches compile however the workspace unifies features.
    ExternalIdentity,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

impl From<FinishDeviceEnrollmentError> for FinishEnrollmentError {
    fn from(value: FinishDeviceEnrollmentError) -> Self {
        match value {
            FinishDeviceEnrollmentError::NoEnrollmentInProgress => Self::NoEnrollmentInProgress,
            FinishDeviceEnrollmentError::MalformedCredential => Self::MalformedCredential,
            FinishDeviceEnrollmentError::VerificationFailed => Self::VerificationFailed,
            FinishDeviceEnrollmentError::AlreadyEnrolled => Self::AlreadyEnrolled,
            FinishDeviceEnrollmentError::ExternalIdentity => Self::ExternalIdentity,
            FinishDeviceEnrollmentError::Internal(error) => Self::Internal(error),
        }
    }
}

/// Why a Passkey must not be removed
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemovalRefused {
    /// The Identity holds no Passkey with this uuid
    UnknownPasskey {
        /// Whether the Identity holds at most one Passkey as well
        last_passkey: bool,
    },
    /// It is the Identity's last Passkey
    LastPasskey,
}

/// Failure of [`IdentityModule::remove_passkey`](crate::IdentityModule::remove_passkey)
#[derive(Debug)]
pub enum RemovePasskeyError {
    /// The Passkey must not be removed
    Refused(RemovalRefused),
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

internal_from!(
    BeginLoginError,
    FinishLoginError,
    FinishEnrollmentError,
    FinishDeviceEnrollmentError,
    RemovePasskeyError,
);
