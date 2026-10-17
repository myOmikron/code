//! The ways the operations of [`IdentityModule`](super::IdentityModule) fail

use galvyn::core::stuff::api_error::core::CoreApiError;

/// Why a Registration link cannot enroll a login method
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkError {
    /// No Registration link carries this token
    UnknownLink,
    /// The Registration link has already enrolled a login method
    LinkUsed,
    /// The Registration link's validity has run out
    LinkExpired,
}

/// Failure of [`IdentityModule::open_registration_link`](super::IdentityModule::open_registration_link)
#[derive(Debug)]
pub enum OpenLinkError {
    /// The Registration link cannot be used
    Link(LinkError),
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

pub(crate) use internal_from;

internal_from!(OpenLinkError);
