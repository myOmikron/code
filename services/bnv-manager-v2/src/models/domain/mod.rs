//! This module provides the domain model and related functionality for managing domains in the system.
//!
//! The domain model represents a DNS domain that can optionally be associated with a club.
//! It includes queries to find domains based on their association status with clubs.

use futures_util::TryStreamExt;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use mailcow::domains::schema::MailcowDomain;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::club::ClubUuid;
use crate::models::domain::db::DomainModel;

pub(in crate::models) mod db;

/// Domain representation
#[derive(Debug, Clone)]
pub struct Domain {
    /// Internal identifier of the domain
    pub uuid: DomainUuid,
    /// Domain
    pub domain: MaxStr<255>,
    /// Associated club
    pub associated_club: Option<ClubUuid>,
    /// The primary domain for a club
    pub is_primary: bool,
}

/// Uuid of a domain
#[derive(Debug, Copy, Clone, Serialize, Deserialize, JsonSchema, Eq, Hash, PartialEq)]
pub struct DomainUuid(pub Uuid);

impl Domain {
    /// Find all domains
    #[instrument(name = "Domain::find_all", skip(exe))]
    pub async fn find_all(exe: impl Executor<'_>) -> anyhow::Result<Vec<Self>> {
        Ok(rorm::query(exe, DomainModel)
            .order_asc(DomainModel.domain)
            .stream()
            .map_ok(Domain::from)
            .try_collect()
            .await?)
    }

    /// Find all unassociated domains
    #[instrument(name = "Domain::find_all_unassociated", skip(exe))]
    pub async fn find_all_unassociated(exe: impl Executor<'_>) -> anyhow::Result<Vec<Self>> {
        Ok(rorm::query(exe, DomainModel)
            .condition(DomainModel.club.is_none())
            .order_asc(DomainModel.domain)
            .stream()
            .map_ok(Domain::from)
            .try_collect()
            .await?)
    }

    /// Find all domains that are associated with a club
    #[instrument(name = "Domain::find_all_by_club", skip(exe))]
    pub async fn find_all_by_club(
        exe: impl Executor<'_>,
        club: ClubUuid,
    ) -> anyhow::Result<Vec<Self>> {
        Ok(rorm::query(exe, DomainModel)
            .order_asc(DomainModel.domain)
            .condition(DomainModel.club.equals(Some(club.0)))
            .stream()
            .map_ok(Domain::from)
            .try_collect()
            .await?)
    }

    /// Find a single domain
    #[instrument(name = "Domain::find_by_domain", skip(exe))]
    pub async fn find_by_domain(
        exe: impl Executor<'_>,
        domain: &MaxStr<255>,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, DomainModel)
            .order_asc(DomainModel.domain)
            .condition(DomainModel.domain.equals(&**domain))
            .optional()
            .await?
            .map(Domain::from))
    }

    /// Find a domain by its uuid
    #[instrument(name = "Domain::find_by_uuid", skip(exe))]
    pub async fn find_by_uuid(
        exe: impl Executor<'_>,
        domain: DomainUuid,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, DomainModel)
            .condition(DomainModel.uuid.equals(domain.0))
            .optional()
            .await?
            .map(Domain::from))
    }

    /// Delete a domain by its domain
    #[instrument(name = "Domain::delete_by_domain", skip(exe))]
    pub async fn delete_by_domain(
        exe: impl Executor<'_>,
        domain: MaxStr<255>,
    ) -> anyhow::Result<()> {
        rorm::delete(exe, DomainModel)
            .condition(DomainModel.domain.equals(&*domain))
            .await?;

        Ok(())
    }

    /// Sync new mailcow domains
    ///
    /// Existing domains are updated, if necessary.
    /// New domains will be created
    #[instrument(name = "Domain::sync_mailcow_domains", skip(exe))]
    pub async fn sync_mailcow_domains(
        exe: impl Executor<'_>,
        mailcow_domains: Vec<MailcowDomain>,
    ) -> anyhow::Result<()> {
        let mut guard = exe.ensure_transaction().await?;

        let existing = rorm::query(guard.get_transaction(), DomainModel)
            .all()
            .await?;

        // Remove domains that don't exist in mailcow anymore
        for domain in &existing {
            if !mailcow_domains
                .iter()
                .any(|x| x.domain_name == *domain.domain)
            {
                rorm::delete(guard.get_transaction(), DomainModel)
                    .condition(DomainModel.uuid.equals(domain.uuid))
                    .await?;
            }
        }

        // Update existing domains
        let mut to_add = vec![];
        for domain in mailcow_domains {
            if existing
                .iter()
                .any(|x| &*x.domain == domain.domain_name.as_str())
            {
                rorm::update(guard.get_transaction(), DomainModel)
                    .set(DomainModel.mailboxes_left, domain.mboxes_left as i64)
                    .condition(DomainModel.domain.equals(&domain.domain_name))
                    .await?;
            } else {
                to_add.push(DomainModel {
                    uuid: Uuid::new_v4(),
                    domain: MaxStr::new(domain.domain_name)?,
                    club: None,
                    is_primary: false,
                    mailboxes_left: domain.mboxes_left as i64,
                });
            }
        }

        // Insert new domains
        rorm::insert(guard.get_transaction(), DomainModel)
            .bulk(to_add)
            .await?;

        guard.commit().await?;

        Ok(())
    }
}

/// Parameters for creating a new domain
#[derive(Debug, Clone)]
pub struct CreateDomain {
    /// Domain
    pub domain: MaxStr<255>,
    /// Associated club
    pub club: Option<ClubUuid>,
    /// Whether this is the primary domain for the club
    pub is_primary: bool,
}

impl From<DomainModel> for Domain {
    fn from(value: DomainModel) -> Self {
        Self {
            uuid: DomainUuid(value.uuid),
            domain: value.domain,
            associated_club: value.club.map(|club| ClubUuid(club.0)),
            is_primary: value.is_primary,
        }
    }
}
