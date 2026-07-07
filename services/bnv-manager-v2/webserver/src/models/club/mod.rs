//! Clubs related models are in this module.

use anyhow::anyhow;
use futures_util::TryStreamExt;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::Page;
use galvyn::rorm;
use galvyn::rorm::and;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModelByField;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::ClubAccount;
use crate::models::account::ClubAdminAccount;
use crate::models::account::db::ClubAccountModel;
use crate::models::account::db::ClubAdminAccountModel;
use crate::models::club::db::ClubModel;
use crate::models::club::db::ClubModelInsert;
use crate::models::domain::Domain;
use crate::models::domain::db::DomainModel;

pub(in crate::models) mod db;

/// Representation of a club
#[derive(Debug, Clone)]
pub struct Club {
    /// Primary key of a club
    pub uuid: ClubUuid,
    /// Name of the club
    pub name: MaxStr<255>,
    /// The last point in time the club was modified
    pub modified_at: time::OffsetDateTime,
    /// The point in time the club was created
    pub created_at: time::OffsetDateTime,
    /// The number of members in the club
    pub member_count: u64,
    /// The number of admins in the club
    pub admin_count: u64,
    /// The primary domain of the club
    pub primary_domain: MaxStr<255>,
    /// Whether to use X-Auth for authentication
    /// If set to false, bnv-manager is attempting to create an app password for
    /// all users and to keep them in sync
    pub use_xauth: bool,
}

/// New-type for the primary key of the club
#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ClubUuid(pub Uuid);

impl Club {
    /// Delete a club
    #[instrument(name = "Club::delete", skip(self, exe))]
    pub async fn delete(self, exe: impl Executor<'_>) -> anyhow::Result<()> {
        let mut guard = exe.ensure_transaction().await?;

        rorm::delete(guard.get_transaction(), DomainModel)
            .condition(DomainModel.club.equals(Some(self.uuid.0)))
            .await?;

        rorm::delete(guard.get_transaction(), ClubModel)
            .condition(ClubModel.uuid.equals(self.uuid.0))
            .await?;

        guard.commit().await?;

        Ok(())
    }

    /// Retrieve all clubs
    #[instrument(name = "Club::find_all", skip(exe))]
    pub async fn find_all(exe: impl Executor<'_>) -> anyhow::Result<Vec<Club>> {
        let mut guard = exe.ensure_transaction().await?;

        let mut cm = rorm::query(guard.get_transaction(), ClubModel)
            .order_asc(ClubModel.name)
            .all()
            .await?;

        ClubModel
            .admins
            .populate_bulk(guard.get_transaction(), &mut cm)
            .await?;
        ClubModel
            .members
            .populate_bulk(guard.get_transaction(), &mut cm)
            .await?;
        ClubModel
            .domains
            .populate_bulk(guard.get_transaction(), &mut cm)
            .await?;

        #[allow(clippy::expect_used)]
        Ok(cm
            .into_iter()
            .map(|x| Club {
                uuid: ClubUuid(x.uuid),
                name: x.name,
                modified_at: x.modified_at,
                created_at: x.created_at,
                member_count: x.members.cached.expect("Queried beforehand").len() as u64,
                admin_count: x.admins.cached.expect("Queried beforehand").len() as u64,
                primary_domain: x
                    .domains
                    .cached
                    .expect("Queried beforehand")
                    .into_iter()
                    .find(|domain: &DomainModel| domain.is_primary)
                    .map(|x| x.domain)
                    .unwrap_or_default(),
                use_xauth: x.use_xauth,
            })
            .collect())
    }

    /// Retrieve a club by uuid
    #[instrument(name = "Club::find_by_uuid", skip(exe))]
    pub async fn find_by_uuid(
        exe: impl Executor<'_>,
        uuid: ClubUuid,
    ) -> anyhow::Result<Option<Club>> {
        let mut guard = exe.ensure_transaction().await?;

        let cm = rorm::query(guard.get_transaction(), ClubModel)
            .condition(ClubModel.uuid.equals(uuid.0))
            .optional()
            .await?;

        let club = if let Some(cm) = cm {
            Some(Self::populate(guard.get_transaction(), cm).await?)
        } else {
            None
        };

        guard.commit().await?;

        Ok(club)
    }

    /// Retrieve a club by name
    #[instrument(name = "Club::find_by_name", skip(exe))]
    pub async fn find_by_name(
        exe: impl Executor<'_>,
        name: &MaxStr<255>,
    ) -> anyhow::Result<Option<Club>> {
        let mut guard = exe.ensure_transaction().await?;

        let cm = rorm::query(guard.get_transaction(), ClubModel)
            .condition(ClubModel.name.equals(&**name))
            .optional()
            .await?;

        let club = if let Some(cm) = cm {
            Some(Self::populate(guard.get_transaction(), cm).await?)
        } else {
            None
        };

        guard.commit().await?;

        Ok(club)
    }

    /// Create a new club
    #[instrument(name = "Club::create", skip(exe))]
    pub async fn create(
        exe: impl Executor<'_>,
        CreateClub {
            name,
            primary_domain,
            use_xauth,
        }: CreateClub<'_>,
    ) -> anyhow::Result<Club> {
        let mut guard = exe.ensure_transaction().await?;
        let mut club_model = rorm::insert(guard.get_transaction(), ClubModel)
            .single(&ClubModelInsert {
                uuid: Uuid::new_v4(),
                name,
                use_xauth,
            })
            .await?;

        ClubModel
            .domains
            .populate(guard.get_transaction(), &mut club_model)
            .await?;

        let mut club = Club {
            uuid: ClubUuid(club_model.uuid),
            name: club_model.name,
            modified_at: club_model.modified_at,
            created_at: club_model.created_at,
            member_count: 0,
            admin_count: 0,
            primary_domain: MaxStr::default(),
            use_xauth,
        };

        club.associate_domain(guard.get_transaction(), primary_domain, true)
            .await?;

        guard.commit().await?;

        Ok(club)
    }

    /// Associate an existing domain with this club
    #[instrument(name = "Club::associate_domain", skip(exe, self))]
    pub async fn associate_domain(
        &mut self,
        exe: impl Executor<'_>,
        domain: &Domain,
        is_primary: bool,
    ) -> anyhow::Result<()> {
        let mut guard = exe.ensure_transaction().await?;

        if is_primary {
            // Set primary to false on other domains for this club
            rorm::update(guard.get_transaction(), DomainModel)
                .set(DomainModel.is_primary, false)
                .condition(and![
                    DomainModel.club.equals(Some(self.uuid.0)),
                    DomainModel.is_primary.equals(true)
                ])
                .await?;
        }

        rorm::update(guard.get_transaction(), DomainModel)
            .set(DomainModel.club, Some(ForeignModelByField(self.uuid.0)))
            .set(DomainModel.is_primary, is_primary)
            .condition(DomainModel.uuid.equals(domain.uuid.0))
            .await?;

        guard.commit().await?;

        if is_primary {
            self.primary_domain = domain.domain.clone();
        }

        Ok(())
    }

    /// Unassociate an existing domain from this club
    ///
    /// Can't unassociate the primary domain of the club
    #[instrument(name = "Club::unassociate_domain", skip(exe, self))]
    pub async fn unassociate_domain(
        &self,
        exe: impl Executor<'_>,
        domain: &Domain,
    ) -> anyhow::Result<()> {
        let mut guard = exe.ensure_transaction().await?;

        if self.primary_domain == domain.domain {
            return Err(anyhow!("Can't unassociate primary domain"));
        }

        rorm::update(guard.get_transaction(), DomainModel)
            .set(DomainModel.club, None)
            .set(DomainModel.is_primary, false)
            .condition(DomainModel.uuid.equals(domain.uuid.0))
            .await?;

        guard.commit().await?;

        Ok(())
    }

    /// Retrieve all members of a club
    #[instrument(name = "Club::members", skip(exe, self))]
    pub async fn members_page(
        &self,
        exe: impl Executor<'_>,
        limit: u64,
        offset: u64,
        search: Option<MaxStr<255>>,
    ) -> anyhow::Result<Page<ClubAccount>> {
        let mut guard = exe.ensure_transaction().await?;

        let mut conditions = vec![ClubAccountModel.club.equals(self.uuid.0).boxed()];
        if let Some(search) = search {
            conditions.push(
                DynamicCollection::or_unchecked(vec![
                    ClubAccountModel
                        .username
                        .username
                        .like_ignore_case(format!("%{search}%"))
                        .boxed(),
                    ClubAccountModel
                        .email
                        .like_ignore_case(format!("%{search}%"))
                        .boxed(),
                    ClubAccountModel
                        .display_name
                        .like_ignore_case(format!("%{search}%"))
                        .boxed(),
                ])
                .boxed(),
            );
        }
        let cond_collection = DynamicCollection::and_unchecked(conditions);

        let account_models = rorm::query(guard.get_transaction(), ClubAccountModel)
            .order_asc(ClubAccountModel.username)
            .condition(&cond_collection)
            .offset(offset)
            .limit(limit)
            .stream()
            .map_ok(ClubAccount::from)
            .try_collect::<Vec<_>>()
            .await?;

        let total = rorm::query(guard.get_transaction(), ClubAccountModel.uuid.count())
            .condition(ClubAccountModel.club.equals(self.uuid.0))
            .one()
            .await?;

        guard.commit().await?;

        Ok(Page {
            items: account_models,
            limit,
            offset,
            total,
        })
    }

    /// Retrieve all admins of a club
    #[instrument(name = "Club::admins_page", skip(exe, self))]
    pub async fn admins_page(
        &self,
        exe: impl Executor<'_>,
        limit: u64,
        offset: u64,
        search: Option<MaxStr<255>>,
    ) -> anyhow::Result<Page<ClubAdminAccount>> {
        let mut guard = exe.ensure_transaction().await?;

        let mut conditions = vec![ClubAdminAccountModel.club.equals(self.uuid.0).boxed()];
        if let Some(search) = search {
            conditions.push(
                ClubAdminAccountModel
                    .username
                    .username
                    .like_ignore_case(format!("%{search}%"))
                    .boxed(),
            );
        }
        let cond_collection = DynamicCollection::and_unchecked(conditions);

        let account_models = rorm::query(guard.get_transaction(), ClubAdminAccountModel)
            .order_asc(ClubAdminAccountModel.username)
            .condition(&cond_collection)
            .offset(offset)
            .limit(limit)
            .stream()
            .map_ok(ClubAdminAccount::from)
            .try_collect::<Vec<_>>()
            .await?;

        let total = rorm::query(guard.get_transaction(), ClubAdminAccountModel.uuid.count())
            .condition(ClubAdminAccountModel.club.equals(self.uuid.0))
            .one()
            .await?;

        guard.commit().await?;

        Ok(Page {
            items: account_models,
            limit,
            offset,
            total,
        })
    }
}

/// Parameters for creating a club
#[derive(Debug, Clone)]
pub struct CreateClub<'a> {
    /// Name of the club
    pub name: MaxStr<255>,
    /// Primary domain to associate with the club
    pub primary_domain: &'a Domain,
    /// Whether to use X-Auth for authentication
    /// If set to false, bnv-manager is attempting to create an app password for
    /// all users and to keep them in sync
    pub use_xauth: bool,
}

impl Club {
    async fn populate(
        tx: &mut Transaction,
        mut club_model: ClubModel,
    ) -> Result<Self, anyhow::Error> {
        ClubModel.admins.populate(&mut *tx, &mut club_model).await?;
        ClubModel
            .members
            .populate(&mut *tx, &mut club_model)
            .await?;

        ClubModel
            .domains
            .populate(&mut *tx, &mut club_model)
            .await?;

        #[allow(clippy::unwrap_used)]
        Ok(Club {
            uuid: ClubUuid(club_model.uuid),
            name: club_model.name,
            modified_at: club_model.modified_at,
            created_at: club_model.created_at,
            member_count: club_model.members.cached.unwrap().len() as u64,
            admin_count: club_model.admins.cached.unwrap().len() as u64,
            primary_domain: club_model
                .domains
                .cached
                .unwrap()
                .into_iter()
                .find(|domain: &DomainModel| domain.is_primary)
                .map(|x| x.domain)
                .unwrap_or_default(),
            use_xauth: club_model.use_xauth,
        })
    }
}
