//! Persisted scanner sessions and their staging areas

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionUuid;
use crate::models::scanner_session::db::ScannerSessionEntryInsertPatch;
use crate::models::scanner_session::db::ScannerSessionEntryModel;
use crate::models::scanner_session::db::ScannerSessionInsertPatch;
use crate::models::scanner_session::db::ScannerSessionModel;

pub(in crate::models) mod db;

/// Result of an owner-scoped session operation
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScannerSessionAccess<T = ()> {
    /// The requested session belongs to the account
    Granted(T),
    /// The session is absent or belongs to another account
    Denied,
}

/// A persisted scanner workspace
#[derive(Debug, Clone)]
pub struct ScannerSession {
    /// Primary key
    pub uuid: ScannerSessionUuid,
    /// Display name
    pub name: MaxStr<255>,
    /// Marker colour
    pub color: MaxStr<16>,
    /// Marker icon
    pub icon: MaxStr<32>,
    /// Preferred destination
    pub collection: Option<CollectionUuid>,
    /// Owner
    pub owner: AccountUuid,
    /// Creation time
    pub created_at: OffsetDateTime,
}

/// Typed primary key of a [`ScannerSession`]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct ScannerSessionUuid(Uuid);

impl ScannerSessionUuid {
    /// Return the raw UUID
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Build from a foreign key
    pub(in crate::models) fn new_from_field(
        field: ForeignModelByField<<ScannerSessionModel as rorm::Model>::Primary>,
    ) -> Self {
        Self(field.0)
    }
}

/// Values needed to create a session
#[derive(Debug, Clone)]
pub struct ScannerSessionInsert {
    /// Display name
    pub name: MaxStr<255>,
    /// Marker colour
    pub color: MaxStr<16>,
    /// Marker icon
    pub icon: MaxStr<32>,
    /// Preferred destination
    pub collection: Option<CollectionUuid>,
}

/// Editable session metadata
#[derive(Debug, Clone)]
pub struct ScannerSessionUpdate {
    /// Display name
    pub name: MaxStr<255>,
    /// Marker colour
    pub color: MaxStr<16>,
    /// Marker icon
    pub icon: MaxStr<32>,
    /// Preferred destination
    pub collection: Option<CollectionUuid>,
}

impl ScannerSession {
    /// Every session owned by an account, newest first
    #[instrument(name = "ScannerSession::get_all", skip(tx))]
    pub async fn get_all(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<ScannerSession>, rorm::Error> {
        let sessions = rorm::query(&mut *tx, ScannerSessionModel)
            .condition(ScannerSessionModel.owner.equals(owner.into_inner()))
            .order_desc(ScannerSessionModel.uuid)
            .all()
            .await?;
        Ok(sessions.into_iter().map(ScannerSession::from).collect())
    }

    /// One session, when it belongs to the account
    #[instrument(name = "ScannerSession::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: ScannerSessionUuid,
    ) -> Result<Option<ScannerSession>, rorm::Error> {
        let session = rorm::query(&mut *tx, ScannerSessionModel)
            .condition(owned_by(uuid, owner))
            .optional()
            .await?;
        Ok(session.map(ScannerSession::from))
    }

    /// Start a scanner session
    #[instrument(name = "ScannerSession::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: ScannerSessionInsert,
    ) -> Result<ScannerSession, rorm::Error> {
        let session = rorm::insert(&mut *tx, ScannerSessionModel)
            .single(&ScannerSessionInsertPatch {
                uuid: Uuid::now_v7(),
                name: insert.name,
                color: insert.color,
                icon: insert.icon,
                collection: insert
                    .collection
                    .map(|collection| ForeignModelByField(collection.into_inner())),
                owner: ForeignModelByField(owner.into_inner()),
            })
            .await?;
        Ok(ScannerSession::from(session))
    }

    /// Change the session's optional organisation metadata
    #[instrument(name = "ScannerSession::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: ScannerSessionUuid,
        update: ScannerSessionUpdate,
    ) -> Result<ScannerSessionAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, ScannerSessionModel)
            .set(ScannerSessionModel.name, update.name)
            .set(ScannerSessionModel.color, update.color)
            .set(ScannerSessionModel.icon, update.icon)
            .set(
                ScannerSessionModel.collection,
                update
                    .collection
                    .map(|collection| ForeignModelByField(collection.into_inner())),
            )
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Delete a session and its staged entries
    #[instrument(name = "ScannerSession::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: ScannerSessionUuid,
    ) -> Result<ScannerSessionAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, ScannerSessionModel)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }
}

impl From<ScannerSessionModel> for ScannerSession {
    fn from(value: ScannerSessionModel) -> Self {
        Self {
            uuid: ScannerSessionUuid(value.uuid),
            name: value.name,
            color: value.color,
            icon: value.icon,
            collection: value.collection.map(CollectionUuid::new_from_field),
            owner: AccountUuid::new_from_field(value.owner),
            created_at: value.created_at,
        }
    }
}

/// One stack in a session's staging area
#[derive(Debug, Clone)]
pub struct ScannerSessionEntry {
    /// Primary key
    pub uuid: ScannerSessionEntryUuid,
    /// Parent session
    pub scanner_session: ScannerSessionUuid,
    /// Printing
    pub printing: Uuid,
    /// Number of copies
    pub quantity: i32,
    /// Finish
    pub finish: CardFinish,
    /// Signed state
    pub signed: bool,
    /// Paid price per copy
    pub purchase_price_cents: Option<i64>,
    /// When the row was first staged
    pub created_at: OffsetDateTime,
}

/// Typed primary key of a [`ScannerSessionEntry`]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct ScannerSessionEntryUuid(Uuid);

/// Values needed to stage a stack
#[derive(Debug, Clone)]
pub struct ScannerSessionEntryInsert {
    /// Printing
    pub printing: Uuid,
    /// Number of copies
    pub quantity: i32,
    /// Finish
    pub finish: CardFinish,
    /// Signed state
    pub signed: bool,
    /// Paid price per copy
    pub purchase_price_cents: Option<i64>,
}

/// Partial update of a staged stack
#[derive(Debug, Clone, Default)]
pub struct ScannerSessionEntryPatch {
    /// Corrected printing
    pub printing: Option<Uuid>,
    /// New number of copies
    pub quantity: Option<i32>,
    /// New finish
    pub finish: Option<CardFinish>,
    /// New signed state
    pub signed: Option<bool>,
    /// New paid price, inner `None` clearing it
    pub purchase_price_cents: Option<Option<i64>>,
}

impl ScannerSessionEntry {
    /// Every staged stack, newest first
    #[instrument(name = "ScannerSessionEntry::get_all", skip(tx))]
    pub async fn get_all(
        tx: &mut Transaction,
        session: ScannerSessionUuid,
    ) -> Result<Vec<ScannerSessionEntry>, rorm::Error> {
        let entries = rorm::query(&mut *tx, ScannerSessionEntryModel)
            .condition(ScannerSessionEntryModel.scanner_session.equals(session.0))
            .order_desc(ScannerSessionEntryModel.uuid)
            .all()
            .await?;
        Ok(entries.into_iter().map(ScannerSessionEntry::from).collect())
    }

    /// Stage a stack, folding it into an identical row when possible
    #[instrument(name = "ScannerSessionEntry::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        session: ScannerSessionUuid,
        insert: ScannerSessionEntryInsert,
    ) -> Result<ScannerSessionEntry, rorm::Error> {
        let existing = rorm::query(&mut *tx, ScannerSessionEntryModel)
            .condition(rorm::and![
                ScannerSessionEntryModel.scanner_session.equals(session.0),
                ScannerSessionEntryModel.printing.equals(insert.printing),
                ScannerSessionEntryModel.finish.equals(insert.finish),
                ScannerSessionEntryModel.signed.equals(insert.signed),
                ScannerSessionEntryModel
                    .purchase_price_cents
                    .equals(insert.purchase_price_cents),
            ])
            .optional()
            .await?;
        if let Some(existing) = existing {
            let quantity = existing.quantity + insert.quantity.max(1);
            rorm::update(&mut *tx, ScannerSessionEntryModel)
                .set(ScannerSessionEntryModel.quantity, quantity)
                .condition(ScannerSessionEntryModel.uuid.equals(existing.uuid))
                .await?;
            return Ok(ScannerSessionEntry::from(ScannerSessionEntryModel {
                quantity,
                ..existing
            }));
        }

        let entry = rorm::insert(&mut *tx, ScannerSessionEntryModel)
            .single(&ScannerSessionEntryInsertPatch {
                uuid: Uuid::now_v7(),
                scanner_session: ForeignModelByField(session.0),
                printing: insert.printing,
                quantity: insert.quantity.max(1),
                finish: insert.finish,
                signed: insert.signed,
                purchase_price_cents: insert.purchase_price_cents,
            })
            .await?;
        Ok(ScannerSessionEntry::from(entry))
    }

    /// Change a staged stack
    #[instrument(name = "ScannerSessionEntry::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        session: ScannerSessionUuid,
        uuid: ScannerSessionEntryUuid,
        patch: ScannerSessionEntryPatch,
    ) -> Result<ScannerSessionAccess<ScannerSessionEntry>, rorm::Error> {
        let builder = rorm::update(&mut *tx, ScannerSessionEntryModel)
            .begin_dyn_set()
            .set_if(ScannerSessionEntryModel.printing, patch.printing)
            .set_if(
                ScannerSessionEntryModel.quantity,
                patch.quantity.map(|quantity| quantity.max(1)),
            )
            .set_if(ScannerSessionEntryModel.finish, patch.finish)
            .set_if(ScannerSessionEntryModel.signed, patch.signed)
            .set_if(
                ScannerSessionEntryModel.purchase_price_cents,
                patch.purchase_price_cents,
            );
        let Ok(builder) = builder.finish_dyn_set() else {
            return Ok(match Self::get(tx, session, uuid).await? {
                Some(entry) => ScannerSessionAccess::Granted(entry),
                None => ScannerSessionAccess::Denied,
            });
        };
        let affected = builder
            .condition(rorm::and![
                ScannerSessionEntryModel.uuid.equals(uuid.0),
                ScannerSessionEntryModel.scanner_session.equals(session.0),
            ])
            .await?;
        if affected == 0 {
            return Ok(ScannerSessionAccess::Denied);
        }
        Ok(match Self::get(tx, session, uuid).await? {
            Some(entry) => ScannerSessionAccess::Granted(entry),
            None => ScannerSessionAccess::Denied,
        })
    }

    /// Remove one staged stack
    #[instrument(name = "ScannerSessionEntry::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        session: ScannerSessionUuid,
        uuid: ScannerSessionEntryUuid,
    ) -> Result<ScannerSessionAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, ScannerSessionEntryModel)
            .condition(rorm::and![
                ScannerSessionEntryModel.uuid.equals(uuid.0),
                ScannerSessionEntryModel.scanner_session.equals(session.0),
            ])
            .await?;
        Ok(access(affected, ()))
    }

    /// Clear the staging area after a successful filing
    #[instrument(name = "ScannerSessionEntry::clear", skip(tx))]
    pub async fn clear(
        tx: &mut Transaction,
        session: ScannerSessionUuid,
    ) -> Result<u64, rorm::Error> {
        rorm::delete(&mut *tx, ScannerSessionEntryModel)
            .condition(ScannerSessionEntryModel.scanner_session.equals(session.0))
            .await
    }

    async fn get(
        tx: &mut Transaction,
        session: ScannerSessionUuid,
        uuid: ScannerSessionEntryUuid,
    ) -> Result<Option<ScannerSessionEntry>, rorm::Error> {
        let entry = rorm::query(&mut *tx, ScannerSessionEntryModel)
            .condition(rorm::and![
                ScannerSessionEntryModel.uuid.equals(uuid.0),
                ScannerSessionEntryModel.scanner_session.equals(session.0),
            ])
            .optional()
            .await?;
        Ok(entry.map(ScannerSessionEntry::from))
    }
}

impl From<ScannerSessionEntryModel> for ScannerSessionEntry {
    fn from(value: ScannerSessionEntryModel) -> Self {
        Self {
            uuid: ScannerSessionEntryUuid(value.uuid),
            scanner_session: ScannerSessionUuid::new_from_field(value.scanner_session),
            printing: value.printing,
            quantity: value.quantity,
            finish: value.finish,
            signed: value.signed,
            purchase_price_cents: value.purchase_price_cents,
            created_at: value.created_at,
        }
    }
}

fn access<T>(affected: u64, value: T) -> ScannerSessionAccess<T> {
    if affected > 0 {
        ScannerSessionAccess::Granted(value)
    } else {
        ScannerSessionAccess::Denied
    }
}

fn owned_by(uuid: ScannerSessionUuid, owner: AccountUuid) -> impl Condition<'static> {
    rorm::and![
        ScannerSessionModel.uuid.equals(uuid.0),
        ScannerSessionModel.owner.equals(owner.into_inner()),
    ]
}
