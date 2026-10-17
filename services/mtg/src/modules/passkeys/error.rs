//! The ways the operations of [`Passkeys`](super::Passkeys) fail

use galvyn::core::stuff::api_error::core::CoreApiError;

/// Why a Registration link cannot enroll a Passkey
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkError {
    /// No Registration link carries this token
    UnknownLink,
    /// The Registration link has already enrolled a Passkey
    LinkUsed,
    /// The Registration link's validity has run out
    LinkExpired,
}

/// Failure of [`Passkeys::open_registration_link`](super::Passkeys::open_registration_link)
#[derive(Debug)]
pub enum OpenLinkError {
    /// The Registration link cannot be used
    Link(LinkError),
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`Passkeys::begin_login`](super::Passkeys::begin_login)
#[derive(Debug)]
pub enum BeginLoginError {
    /// The Identity holds no Passkey to log in with
    NoPasskey,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of [`Passkeys::finish_login`](super::Passkeys::finish_login)
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
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Failure of finishing an Enrollment
#[derive(Debug)]
pub enum FinishEnrollmentError {
    /// The session has no Enrollment of this kind in progress
    NoEnrollmentInProgress,
    /// The authenticator response is not a WebAuthn credential
    MalformedCredential,
    /// The Registration link cannot be used (only for Enrollment through one)
    Link(LinkError),
    /// The authenticator response does not match the Enrollment
    VerificationFailed,
    /// The Passkey is already enrolled
    AlreadyEnrolled,
    /// Something unrelated to the request broke
    Internal(CoreApiError),
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

/// Failure of [`Passkeys::remove_passkey`](super::Passkeys::remove_passkey)
#[derive(Debug)]
pub enum RemovePasskeyError {
    /// The Passkey must not be removed
    Refused(RemovalRefused),
    /// Something unrelated to the request broke
    Internal(CoreApiError),
}

/// Lets `?` turn infrastructure failures into the `Internal` variant
macro_rules! internal_from {
    ($($error:ty),* $(,)?) => {
        $(
            impl<F> From<F> for $error
            where
                CoreApiError: From<F>,
            {
                #[track_caller]
                fn from(value: F) -> Self {
                    Self::Internal(CoreApiError::from(value))
                }
            }
        )*
    };
}

internal_from!(
    OpenLinkError,
    BeginLoginError,
    FinishLoginError,
    FinishEnrollmentError,
    RemovePasskeyError,
);
