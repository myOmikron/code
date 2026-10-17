//! Identities and their Registration links outside of a ceremony

use galvyn::core::Module;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::db::transaction::Transaction;
use url::Url;

use super::IdentityModule;
use super::error::LinkError;
use super::error::OpenLinkError;
use super::models::Identity;
use super::models::IdentityUuid;
use super::models::RegistrationLink;

/// A Registration link that was usable when it was opened
///
/// Lets the service look up the Account behind it (for the name the
/// authenticator shows) before beginning the Enrollment.
#[derive(Debug, Clone, Copy)]
pub struct OpenLink {
    /// The Identity the link enrolls a login method for
    pub(crate) identity: IdentityUuid,
}

impl OpenLink {
    /// The Identity the link enrolls a login method for
    pub fn identity(&self) -> IdentityUuid {
        self.identity
    }
}

impl IdentityModule {
    /// Open the Registration link carrying `token`, checking it is usable
    pub async fn open_registration_link(&self, token: &str) -> Result<OpenLink, OpenLinkError> {
        let mut tx = Database::global().start_transaction().await?;
        let link = usable_link(&mut tx, token).await?;
        tx.commit().await?;

        let link = link.map_err(OpenLinkError::Link)?;
        Ok(OpenLink {
            identity: link.identity,
        })
    }

    /// Create a new Identity for the service's Account to reference
    pub async fn create_identity(
        &self,
        exe: impl Executor<'_>,
    ) -> Result<IdentityUuid, rorm::Error> {
        Identity::insert(exe).await
    }

    /// Delete an Identity
    ///
    /// The cascades take its login methods, its Registration links and the
    /// service's Account referencing it along.
    ///
    /// Returns `false` if the Identity does not exist.
    pub async fn delete_identity(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<bool, rorm::Error> {
        Identity::delete(exe, identity).await
    }

    /// Issue a Registration link for `identity` and return the full link
    ///
    /// The link only works once `exe`'s transaction is committed, so deliver
    /// it after the commit.
    pub async fn issue_registration_link(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<Url, rorm::Error> {
        let token =
            RegistrationLink::create(exe, identity, self.settings.registration_link_validity)
                .await?;
        Ok(self.settings.registration_link(&token))
    }

    /// How long a freshly issued Registration link stays usable
    pub fn registration_link_validity(&self) -> Duration {
        self.settings.registration_link_validity
    }

    /// Log out, clearing every Login and Enrollment state and the session itself
    pub async fn logout(&self, session: &Session) -> Result<(), tower_sessions::session::Error> {
        session.flush().await
    }
}

/// The Registration link carrying `token`, if it is usable now
pub(crate) async fn usable_link(
    tx: &mut Transaction,
    token: &str,
) -> Result<Result<RegistrationLink, LinkError>, CoreApiError> {
    let Some(link) = RegistrationLink::get_by_token(tx, token).await? else {
        return Ok(Err(LinkError::UnknownLink));
    };
    Ok(link.usable_at(OffsetDateTime::now_utc()).map(|()| link))
}
