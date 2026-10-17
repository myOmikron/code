//! Every session key of Passkey Login and Enrollment
//!
//! Key names and value formats are what sessions already in the store hold:
//! renaming a key or changing its value aborts every running ceremony.

use galvyn::core::session::Session;
use tower_sessions::session::Error;
use webauthn_rs::prelude::PasskeyAuthentication;
use webauthn_rs::prelude::PasskeyRegistration;

use crate::models::IdentityUuid;

/// Session key holding the state of a running Login
const LOGIN_STATE: &str = "webauthn_login";

/// Session key holding the Identity a running Login targets
const LOGIN_IDENTITY: &str = "webauthn_login_account";

/// Session key holding the state of a running Enrollment through a Registration link
const LINK_ENROLLMENT_STATE: &str = "webauthn_registration";

/// Session key holding the state of a running Enrollment of an additional device
const DEVICE_ENROLLMENT_STATE: &str = "webauthn_add_passkey";

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
    /// Enrollment through a Registration link
    Link,
    /// Enrollment of an additional device by the logged-in Identity
    Device,
}

impl EnrollmentKind {
    /// The session key of this kind's state
    fn key(self) -> &'static str {
        match self {
            EnrollmentKind::Link => LINK_ENROLLMENT_STATE,
            EnrollmentKind::Device => DEVICE_ENROLLMENT_STATE,
        }
    }
}

/// Store a started Enrollment
pub(super) async fn start_enrollment(
    session: &Session,
    kind: EnrollmentKind,
    state: PasskeyRegistration,
) -> Result<(), Error> {
    session.insert(kind.key(), state).await
}

/// Take the running Enrollment of `kind` out of the session
pub(super) async fn take_enrollment(
    session: &Session,
    kind: EnrollmentKind,
) -> Result<Option<PasskeyRegistration>, Error> {
    session.remove(kind.key()).await
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
        start_enrollment(&session, EnrollmentKind::Device, enrollment_state())
            .await
            .unwrap();

        let taken = take_enrollment(&session, EnrollmentKind::Link).await;
        assert!(taken.unwrap().is_none());
    }

    #[tokio::test]
    async fn a_link_enrollment_cannot_be_finished_as_device_enrollment() {
        let session = session();
        start_enrollment(&session, EnrollmentKind::Link, enrollment_state())
            .await
            .unwrap();

        let taken = take_enrollment(&session, EnrollmentKind::Device).await;
        assert!(taken.unwrap().is_none());
    }

    #[tokio::test]
    async fn each_kind_finishes_the_enrollment_it_started() {
        let session = session();
        start_enrollment(&session, EnrollmentKind::Link, enrollment_state())
            .await
            .unwrap();
        start_enrollment(&session, EnrollmentKind::Device, enrollment_state())
            .await
            .unwrap();

        let link = take_enrollment(&session, EnrollmentKind::Link).await;
        let device = take_enrollment(&session, EnrollmentKind::Device).await;
        assert!(link.unwrap().is_some());
        assert!(device.unwrap().is_some());
    }

    #[tokio::test]
    async fn an_enrollment_can_only_be_finished_once() {
        let session = session();
        start_enrollment(&session, EnrollmentKind::Device, enrollment_state())
            .await
            .unwrap();

        let first = take_enrollment(&session, EnrollmentKind::Device).await;
        let second = take_enrollment(&session, EnrollmentKind::Device).await;
        assert!(first.unwrap().is_some());
        assert!(second.unwrap().is_none());
    }
}
