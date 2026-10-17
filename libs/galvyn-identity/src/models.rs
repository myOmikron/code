//! Identities and their Registration links
//!
//! An Identity is the anchor a person's login methods hang off. The service's
//! Account referencing it carries everything else (username, email, ...).

use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use super::db::IdentityInsertPatch;
use super::db::IdentityModel;
use super::db::RegistrationLinkInsertPatch;
use super::db::RegistrationLinkModel;
use super::error::LinkError;

/// The anchor a person's login methods hang off
#[derive(Debug, Clone)]
pub struct Identity {
    /// Primary key
    pub uuid: IdentityUuid,

    /// The point in time the identity was created
    pub created_at: OffsetDateTime,

    /// The point in time of the identity's most recent login
    pub last_login_at: Option<OffsetDateTime>,
}

/// Wrapper for the primary key of the [`Identity`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct IdentityUuid(Uuid);

impl IdentityUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `IdentityUuid` from a `ForeignModel<IdentityModel>`
    pub fn new_from_field(field: ForeignModel<IdentityModel>) -> Self {
        Self(field.0)
    }
}

impl Identity {
    /// Fetch an identity by its primary key
    #[instrument(name = "Identity::get_by_uuid", skip(exe))]
    pub(crate) async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: IdentityUuid,
    ) -> Result<Option<Identity>, rorm::Error> {
        let identity = rorm::query(exe, IdentityModel)
            .condition(IdentityModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(identity.map(Identity::from))
    }

    /// Insert a new identity and return its primary key
    #[instrument(name = "Identity::insert", skip(exe))]
    pub(crate) async fn insert(exe: impl Executor<'_>) -> Result<IdentityUuid, rorm::Error> {
        let uuid = rorm::insert(exe, IdentityModel)
            .return_primary_key()
            .single(&IdentityInsertPatch {
                uuid: Uuid::now_v7(),
            })
            .await?;
        Ok(IdentityUuid(uuid))
    }

    /// Delete an identity
    ///
    /// Returns `false` if the identity does not exist.
    #[instrument(name = "Identity::delete", skip(exe))]
    pub(crate) async fn delete(
        exe: impl Executor<'_>,
        uuid: IdentityUuid,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(exe, IdentityModel)
            .condition(IdentityModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Store that the identity just logged in
    #[instrument(name = "Identity::record_login", skip(exe))]
    pub(crate) async fn record_login(
        exe: impl Executor<'_>,
        uuid: IdentityUuid,
    ) -> Result<(), rorm::Error> {
        rorm::update(exe, IdentityModel)
            .set(IdentityModel.last_login_at, Some(OffsetDateTime::now_utc()))
            .condition(IdentityModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }
}

/// A one-time, expiring link to enroll a login method for one [`Identity`]
///
/// Used for onboarding and for recovery alike.
pub(crate) struct RegistrationLink {
    /// Primary key
    pub uuid: RegistrationLinkUuid,

    /// The identity this link enrolls a login method for
    pub identity: IdentityUuid,

    /// The point in time this link stops being valid
    pub expires_at: OffsetDateTime,

    /// Whether this link has already been used
    pub used: bool,
}

/// Wrapper for the primary key of the [`RegistrationLink`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub(crate) struct RegistrationLinkUuid(pub(crate) Uuid);

impl RegistrationLink {
    /// Create and persist a new one-time link for `identity`, valid for `validity`
    ///
    /// Returns the secret token to embed in the link.
    #[instrument(name = "RegistrationLink::create", skip(exe))]
    pub(crate) async fn create(
        exe: impl Executor<'_>,
        identity: IdentityUuid,
        validity: Duration,
    ) -> Result<MaxStr<64>, rorm::Error> {
        let token = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 43))
            .unwrap_or_else(|_| unreachable!("43 alphanumeric chars fit into 64"));
        rorm::insert(exe, RegistrationLinkModel)
            .single(&RegistrationLinkInsertPatch {
                uuid: Uuid::now_v7(),
                identity: ForeignModelByField(identity.0),
                token: token.clone(),
                expires_at: OffsetDateTime::now_utc() + validity,
                used: false,
            })
            .await?;
        Ok(token)
    }

    /// Fetch a link by its secret token
    #[instrument(name = "RegistrationLink::get_by_token", skip(exe, token))]
    pub(crate) async fn get_by_token(
        exe: impl Executor<'_>,
        token: &str,
    ) -> Result<Option<RegistrationLink>, rorm::Error> {
        let link = rorm::query(exe, RegistrationLinkModel)
            .condition(RegistrationLinkModel.token.equals(token))
            .optional()
            .await?;
        Ok(link.map(RegistrationLink::from))
    }

    /// Mark a link as used if it is still usable at `now`
    ///
    /// Returns `false` if it is not: of two Enrollments racing for one link,
    /// only the first to mark it gets `true`.
    #[instrument(name = "RegistrationLink::mark_used", skip(exe))]
    pub(crate) async fn mark_used(
        exe: impl Executor<'_>,
        uuid: RegistrationLinkUuid,
        now: OffsetDateTime,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, RegistrationLinkModel)
            .set(RegistrationLinkModel.used, true)
            .condition(rorm::and![
                RegistrationLinkModel.uuid.equals(uuid.0),
                RegistrationLinkModel.used.equals(false),
                RegistrationLinkModel.expires_at.greater_equals(now),
            ])
            .await?;
        Ok(affected > 0)
    }

    /// Whether the link can still enroll a login method at `now`
    ///
    /// A used link is reported as used even once it has expired too.
    pub(crate) fn usable_at(&self, now: OffsetDateTime) -> Result<(), LinkError> {
        if self.used {
            return Err(LinkError::LinkUsed);
        }
        if self.expires_at < now {
            return Err(LinkError::LinkExpired);
        }
        Ok(())
    }
}

impl From<IdentityModel> for Identity {
    fn from(value: IdentityModel) -> Self {
        Self {
            uuid: IdentityUuid(value.uuid),
            created_at: value.created_at,
            last_login_at: value.last_login_at,
        }
    }
}

impl From<RegistrationLinkModel> for RegistrationLink {
    fn from(value: RegistrationLinkModel) -> Self {
        Self {
            uuid: RegistrationLinkUuid(value.uuid),
            identity: IdentityUuid::new_from_field(value.identity),
            expires_at: value.expires_at,
            used: value.used,
        }
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::time::Date;
    use galvyn::core::re_exports::time::Month;
    use galvyn::core::re_exports::time::Time;

    use super::*;

    fn at(day: u8, minute: u8) -> OffsetDateTime {
        let date = Date::from_calendar_date(2026, Month::October, day).unwrap();
        date.with_time(Time::from_hms(12, minute, 0).unwrap())
            .assume_utc()
    }

    fn link(used: bool, expires_at: OffsetDateTime) -> RegistrationLink {
        RegistrationLink {
            uuid: RegistrationLinkUuid(Uuid::nil()),
            identity: IdentityUuid(Uuid::nil()),
            expires_at,
            used,
        }
    }

    #[test]
    fn an_unused_link_is_usable_before_it_expires() {
        let link = link(false, at(24, 0));
        assert_eq!(link.usable_at(at(17, 0)), Ok(()));
    }

    #[test]
    fn an_expired_link_is_refused() {
        let link = link(false, at(24, 0));
        assert_eq!(link.usable_at(at(24, 1)), Err(LinkError::LinkExpired));
    }

    #[test]
    fn a_used_link_is_refused_as_used_even_once_expired() {
        let used = link(true, at(24, 0));
        assert_eq!(used.usable_at(at(17, 0)), Err(LinkError::LinkUsed));
        assert_eq!(used.usable_at(at(25, 0)), Err(LinkError::LinkUsed));
    }
}
