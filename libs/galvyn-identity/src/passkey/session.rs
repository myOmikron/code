//! Every session key of Passkey Login and Enrollment
//!
//! Key names and value formats are what sessions already in the store hold:
//! renaming or adding a key, or changing its value, aborts every running ceremony.

use galvyn::core::session::Session;
use tower_sessions::session::Error;
use webauthn_rs::prelude::PasskeyAuthentication;
use webauthn_rs::prelude::PasskeyRegistration;

use crate::models::IdentityUuid;
use crate::models::RegistrationLinkUuid;

/// Session key holding the state of a running Login
const LOGIN_STATE: &str = "webauthn_login";

/// Session key holding the Identity a running Login targets
const LOGIN_IDENTITY: &str = "webauthn_login_account";

/// Session key holding the state of a running Enrollment through a Registration link
const LINK_ENROLLMENT_STATE: &str = "webauthn_registration";

/// Session key holding the Registration link a running Enrollment through one began with
const LINK_ENROLLMENT_LINK: &str = "webauthn_registration_link";

/// Session key holding the state of a running Enrollment of an additional device
const DEVICE_ENROLLMENT_STATE: &str = "webauthn_add_passkey";

/// Session key holding the Identity a running Enrollment of an additional device began for
const DEVICE_ENROLLMENT_IDENTITY: &str = "webauthn_add_passkey_identity";

/// Store a started Login
pub(super) async fn start_login(
    session: &Session,
    state: PasskeyAuthentication,
    identity: IdentityUuid,
) -> Result<(), Error> {
    session.insert(LOGIN_STATE, state).await?;
    session.insert(LOGIN_IDENTITY, identity).await
}

/// Take the running Login out of the session
///
/// Both halves are removed, so a failed attempt cannot be replayed against the same challenge.
pub(super) async fn take_login(
    session: &Session,
) -> Result<Option<(PasskeyAuthentication, IdentityUuid)>, Error> {
    let state = session.remove(LOGIN_STATE).await?;
    let identity = session.remove(LOGIN_IDENTITY).await?;
    Ok(state.zip(identity))
}

/// The two kinds of Enrollment, which never share state
#[derive(Debug, Clone, Copy)]
pub(super) enum EnrollmentKind {
    /// Enrollment through the given Registration link
    Link(RegistrationLinkUuid),
    /// Enrollment of an additional device by the given logged-in Identity
    Device(IdentityUuid),
}

impl EnrollmentKind {
    /// The session key of this kind's state
    fn key(self) -> &'static str {
        match self {
            EnrollmentKind::Link(_) => LINK_ENROLLMENT_STATE,
            EnrollmentKind::Device(_) => DEVICE_ENROLLMENT_STATE,
        }
    }
}

/// Store a started Enrollment
pub(super) async fn start_enrollment(
    session: &Session,
    kind: EnrollmentKind,
    state: PasskeyRegistration,
) -> Result<(), Error> {
    match kind {
        EnrollmentKind::Link(link) => session.insert(LINK_ENROLLMENT_LINK, link).await?,
        EnrollmentKind::Device(identity) => {
            session.insert(DEVICE_ENROLLMENT_IDENTITY, identity).await?
        }
    }
    session.insert(kind.key(), state).await
}

/// Take the running Enrollment of `kind` out of the session
///
/// An Enrollment is only handed out for the Registration link or Identity it
/// began with, but taken out for any.
pub(super) async fn take_enrollment(
    session: &Session,
    kind: EnrollmentKind,
) -> Result<Option<PasskeyRegistration>, Error> {
    let state = session.remove(kind.key()).await?;
    let began_for = match kind {
        EnrollmentKind::Link(link) => session
            .remove::<RegistrationLinkUuid>(LINK_ENROLLMENT_LINK)
            .await?
            .is_some_and(|began_with| began_with == link),
        EnrollmentKind::Device(identity) => session
            .remove::<IdentityUuid>(DEVICE_ENROLLMENT_IDENTITY)
            .await?
            .is_some_and(|began_for| began_for == identity),
    };
    Ok(state.filter(|_| began_for))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tower_sessions::MemoryStore;
    use uuid::Uuid;
    use webauthn_rs::WebauthnBuilder;
    use webauthn_rs::prelude::Url;

    use super::*;

    fn session() -> Session {
        Session::new(None, Arc::new(MemoryStore::default()), None)
    }

    fn link(n: u128) -> RegistrationLinkUuid {
        RegistrationLinkUuid(Uuid::from_u128(n))
    }

    fn identity(n: u128) -> IdentityUuid {
        IdentityUuid::new(Uuid::from_u128(n))
    }

    fn enrollment_state() -> PasskeyRegistration {
        let origin = Url::parse("https://identity.example").unwrap();
        let webauthn = WebauthnBuilder::new("identity.example", &origin)
            .unwrap()
            .build()
            .unwrap();
        let (_challenge, state) = webauthn
            .start_passkey_registration(Uuid::nil(), "alice", "alice", None)
            .unwrap();
        state
    }

    #[tokio::test]
    async fn a_device_enrollment_cannot_be_finished_as_link_enrollment() {
        let session = session();
        start_enrollment(
            &session,
            EnrollmentKind::Device(identity(1)),
            enrollment_state(),
        )
        .await
        .unwrap();

        let taken = take_enrollment(&session, EnrollmentKind::Link(link(1))).await;
        assert!(taken.unwrap().is_none());
    }

    #[tokio::test]
    async fn a_link_enrollment_cannot_be_finished_as_device_enrollment() {
        let session = session();
        start_enrollment(&session, EnrollmentKind::Link(link(1)), enrollment_state())
            .await
            .unwrap();

        let taken = take_enrollment(&session, EnrollmentKind::Device(identity(1))).await;
        assert!(taken.unwrap().is_none());
    }

    #[tokio::test]
    async fn each_kind_finishes_the_enrollment_it_started() {
        let session = session();
        start_enrollment(&session, EnrollmentKind::Link(link(1)), enrollment_state())
            .await
            .unwrap();
        start_enrollment(
            &session,
            EnrollmentKind::Device(identity(1)),
            enrollment_state(),
        )
        .await
        .unwrap();

        let through_link = take_enrollment(&session, EnrollmentKind::Link(link(1))).await;
        let device = take_enrollment(&session, EnrollmentKind::Device(identity(1))).await;
        assert!(through_link.unwrap().is_some());
        assert!(device.unwrap().is_some());
    }

    #[tokio::test]
    async fn a_device_enrollment_cannot_be_finished_by_another_identity() {
        let session = session();
        start_enrollment(
            &session,
            EnrollmentKind::Device(identity(1)),
            enrollment_state(),
        )
        .await
        .unwrap();

        let other = take_enrollment(&session, EnrollmentKind::Device(identity(2))).await;
        let original = take_enrollment(&session, EnrollmentKind::Device(identity(1))).await;
        assert!(other.unwrap().is_none());
        assert!(original.unwrap().is_none());
    }

    #[tokio::test]
    async fn a_link_enrollment_cannot_be_finished_through_another_link() {
        let session = session();
        start_enrollment(&session, EnrollmentKind::Link(link(1)), enrollment_state())
            .await
            .unwrap();

        let other = take_enrollment(&session, EnrollmentKind::Link(link(2))).await;
        let original = take_enrollment(&session, EnrollmentKind::Link(link(1))).await;
        assert!(other.unwrap().is_none());
        assert!(original.unwrap().is_none());
    }

    #[tokio::test]
    async fn a_link_enrollment_is_finished_through_the_link_it_began_with() {
        let session = session();
        start_enrollment(&session, EnrollmentKind::Link(link(1)), enrollment_state())
            .await
            .unwrap();

        let taken = take_enrollment(&session, EnrollmentKind::Link(link(1))).await;
        assert!(taken.unwrap().is_some());
    }

    #[tokio::test]
    async fn an_enrollment_can_only_be_finished_once() {
        let session = session();
        start_enrollment(
            &session,
            EnrollmentKind::Device(identity(1)),
            enrollment_state(),
        )
        .await
        .unwrap();

        let first = take_enrollment(&session, EnrollmentKind::Device(identity(1))).await;
        let second = take_enrollment(&session, EnrollmentKind::Device(identity(1))).await;
        assert!(first.unwrap().is_some());
        assert!(second.unwrap().is_none());
    }
}
