//! Every session key the module owns
//!
//! Key names and value formats are what sessions already in the store hold:
//! renaming a key or changing its value logs everyone out.

use galvyn::core::session::Session;
use tower_sessions::session::Error;
use webauthn_rs::prelude::PasskeyAuthentication;
use webauthn_rs::prelude::PasskeyRegistration;

use super::models::IdentityUuid;

/// Session key holding the uuid of the logged-in Identity
///
/// Named after the account it used to hold. Every account that existed before
/// identities did shares its uuid with its identity, so sessions from back
/// then still name the right person.
const LOGGED_IN: &str = "current_account";

/// Session key holding the state of a running Login
const LOGIN_STATE: &str = "webauthn_login";

/// Session key holding the Identity a running Login targets
const LOGIN_IDENTITY: &str = "webauthn_login_account";

/// Session key holding the state of a running Enrollment through a Registration link
const LINK_ENROLLMENT_STATE: &str = "webauthn_registration";

/// Session key holding the state of a running Enrollment of an additional device
const DEVICE_ENROLLMENT_STATE: &str = "webauthn_add_passkey";

/// The logged-in Identity, if any
pub(super) async fn logged_in(session: &Session) -> Result<Option<IdentityUuid>, Error> {
    session.get(LOGGED_IN).await
}

/// Mark the session as logged in as `identity`
pub(super) async fn set_logged_in(session: &Session, identity: IdentityUuid) -> Result<(), Error> {
    session.insert(LOGGED_IN, identity).await
}

/// Forget the session's login, e.g. because its Identity is gone
pub(super) async fn forget_logged_in(session: &Session) -> Result<(), Error> {
    session.remove_value(LOGGED_IN).await?;
    session.save().await
}

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
