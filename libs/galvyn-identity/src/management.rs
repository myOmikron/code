//! Identities and their Registration links outside of a ceremony

#[cfg(feature = "oidc")]
use std::collections::HashMap;

use galvyn::core::Module;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::db::transaction::TransactionError;
use url::Url;

use super::IdentityModule;
use super::error::LinkError;
use super::error::OpenLinkError;
use super::models::Identity;
use super::models::IdentityUuid;
use super::models::LoginMethod;
use super::models::RegistrationLink;
use super::models::RegistrationLinkUuid;

/// A Registration link that was usable when it was opened
///
/// Lets the service look up the Account behind it (for the name the
/// authenticator shows) before beginning the Enrollment.
#[derive(Debug, Clone, Copy)]
pub struct OpenLink {
    /// The opened link
    pub(crate) link: RegistrationLinkUuid,

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
            link: link.uuid,
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

    /// How `identity` logs in, or `None` while it has no login method yet
    ///
    /// A missing Identity has no login method either.
    pub async fn login_method(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<Option<LoginMethod>, rorm::Error> {
        let mut tx = exe.ensure_transaction().await?;
        let login_method = self.login_method_in(&mut tx, identity).await;
        tx.commit_if_owned().await.map_err(|error| match error {
            TransactionError::Database(error) => error,
            TransactionError::Hook(_) => unreachable!("a transaction started here has no hooks"),
        })?;
        login_method
    }

    /// [`IdentityModule::login_method`], within `tx`
    #[cfg_attr(
        not(any(feature = "passkey", feature = "oidc")),
        expect(
            unused_variables,
            reason = "Without a login method there is nothing to look up"
        )
    )]
    pub(crate) async fn login_method_in(
        &self,
        tx: &mut Transaction,
        identity: IdentityUuid,
    ) -> Result<Option<LoginMethod>, rorm::Error> {
        #[cfg(feature = "passkey")]
        if self.count_passkeys(&mut *tx, identity).await? > 0 {
            return Ok(Some(LoginMethod::Local));
        }
        #[cfg(feature = "oidc")]
        if let Some(login) =
            super::oidc::models::ExternalIdentity::login_of(&mut *tx, identity).await?
        {
            return Ok(Some(LoginMethod::External {
                provider: login.provider,
                issuer: login.issuer,
            }));
        }
        Ok(None)
    }

    /// The OpenID provider of each external Identity among `identities`, in one query
    ///
    /// The provider is the one [`LoginMethod::External`] states. A local
    /// Identity, one without a login method yet and a missing one have no entry.
    #[cfg(feature = "oidc")]
    pub async fn external_logins(
        &self,
        exe: impl Executor<'_>,
        identities: &[IdentityUuid],
    ) -> Result<HashMap<IdentityUuid, super::oidc::ExternalLogin>, rorm::Error> {
        super::oidc::models::ExternalIdentity::logins_of(exe, identities).await
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

    /// Log the session in as `identity` without a ceremony
    ///
    /// Only for a service's tests, which have no authenticator to run one with.
    #[cfg(feature = "test-support")]
    pub async fn log_in_without_ceremony(
        &self,
        session: &Session,
        identity: IdentityUuid,
    ) -> Result<(), tower_sessions::session::Error> {
        super::session::set_logged_in(session, identity).await
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
