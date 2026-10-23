//! Every session key of OIDC login
//!
//! Key names and value formats are what sessions already in the store hold:
//! renaming or adding a key, or changing its value, aborts every running
//! Login and drops every pending External identity.

use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use serde::Deserialize;
use serde::Serialize;
use tower_sessions::session::Error;

/// Session key holding the state of a running Login
const LOGIN: &str = "oidc_login";

/// Session key holding the External identity a finished Login found unknown
const PENDING: &str = "oidc_pending";

/// How long an unknown External identity stays pending
pub(super) const PENDING_VALIDITY: Duration = Duration::minutes(15);

/// A running Login, waiting for the provider to send the browser back
#[derive(Debug, Serialize, Deserialize)]
pub(super) struct LoginState {
    /// The slug of the provider the Login runs against
    pub provider: String,
    /// The `state` sent to the provider
    pub csrf_state: String,
    /// The `nonce` the ID token has to carry
    pub nonce: String,
    /// The PKCE verifier of the `code_challenge` sent to the provider
    pub pkce_verifier: String,
    /// Whether the session survives the browser session once logged in
    pub remember_me: bool,
}

/// An External identity a finished Login found unknown
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct Pending {
    /// The slug of the provider that vouched for the person
    pub provider: String,
    /// The provider's issuer
    pub issuer: String,
    /// The value of the provider's identifying claim
    ///
    /// Read from `subject` too, the name it had while it always was the subject.
    #[serde(alias = "subject")]
    pub value: String,
    /// The email the provider stated, if any
    pub email: Option<String>,
    /// Whether the provider verified that email
    pub email_verified: bool,
    /// Whether the session survives the browser session once logged in
    pub remember_me: bool,
    /// When the Login finished, as unix timestamp
    pub finished_at: i64,
}

impl Pending {
    /// Whether it is still pending at `now`
    pub(super) fn valid_at(&self, now: OffsetDateTime) -> bool {
        OffsetDateTime::from_unix_timestamp(self.finished_at)
            .is_ok_and(|finished_at| now - finished_at <= PENDING_VALIDITY)
    }
}

/// Store a started Login, replacing any running one
pub(super) async fn start_login(session: &Session, state: LoginState) -> Result<(), Error> {
    session.insert(LOGIN, state).await
}

/// Take the running Login out of the session
///
/// It is removed, so a callback cannot be replayed against the same state.
pub(super) async fn take_login(session: &Session) -> Result<Option<LoginState>, Error> {
    session.remove(LOGIN).await
}

/// Hold `pending` in the session, replacing an earlier one
pub(super) async fn set_pending(session: &Session, pending: Pending) -> Result<(), Error> {
    session.insert(PENDING, pending).await
}

/// The pending External identity, if it is still valid at `now`
pub(super) async fn pending(
    session: &Session,
    now: OffsetDateTime,
) -> Result<Option<Pending>, Error> {
    let pending: Option<Pending> = session.get(PENDING).await?;
    Ok(pending.filter(|pending| pending.valid_at(now)))
}

/// Drop the pending External identity
pub(super) async fn forget_pending(session: &Session) -> Result<(), Error> {
    session.remove_value(PENDING).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::time::Date;
    use galvyn::core::re_exports::time::Month;
    use galvyn::core::re_exports::time::Time;

    use super::*;

    fn at(minute: u8) -> OffsetDateTime {
        let date = Date::from_calendar_date(2026, Month::October, 21).unwrap();
        date.with_time(Time::from_hms(12, minute, 0).unwrap())
            .assume_utc()
    }

    fn finished_at(minute: u8) -> Pending {
        Pending {
            provider: "google".to_string(),
            issuer: "https://accounts.google.com".to_string(),
            value: "1234".to_string(),
            email: None,
            email_verified: false,
            remember_me: false,
            finished_at: at(minute).unix_timestamp(),
        }
    }

    #[test]
    fn an_external_identity_stays_pending_for_fifteen_minutes() {
        assert!(finished_at(0).valid_at(at(15)));
    }

    #[test]
    fn an_external_identity_is_no_longer_pending_after_fifteen_minutes() {
        assert!(!finished_at(0).valid_at(at(16)));
    }

    #[test]
    fn a_pending_external_identity_stored_with_its_subject_stays_readable() {
        let stored = serde_json::json!({
            "provider": "google",
            "issuer": "https://accounts.google.com",
            "subject": "1234",
            "email": null,
            "email_verified": false,
            "remember_me": false,
            "finished_at": 0,
        });
        let pending: Pending = serde_json::from_value(stored).unwrap();
        assert_eq!(pending.value, "1234");
    }
}
