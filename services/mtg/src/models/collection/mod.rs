//! Collections of physical cards and the stacks they hold

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::db::CollectionEntryInsertPatch;
use crate::models::collection::db::CollectionEntryModel;
use crate::models::collection::db::CollectionInsertPatch;
use crate::models::collection::db::CollectionModel;
use crate::models::visibility::Visibility;

pub(in crate::models) mod db;

/// Length of the secret in a share link
const SHARE_TOKEN_LEN: usize = 32;

/// A named group of cards owned by an account
#[derive(Debug, Clone)]
pub struct Collection {
    /// Primary key
    pub uuid: CollectionUuid,

    /// Name of the collection
    pub name: MaxStr<255>,

    /// Description shown above the card list
    pub description: MaxStr<1024>,

    /// The owner of the collection
    pub owner: AccountUuid,

    /// Who may see this collection
    pub visibility: Visibility,

    /// Secret of the share link, `None` once the link is revoked
    pub share_token: Option<MaxStr<64>>,

    /// The point in time the collection was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`Collection`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct CollectionUuid(Uuid);

impl CollectionUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `CollectionUuid` from a `ForeignModel<CollectionModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<CollectionModel>) -> Self {
        Self(field.0)
    }
}

/// Data for creating a new [`Collection`]
#[derive(Debug)]
pub struct CollectionInsert {
    /// Name of the collection
    pub name: MaxStr<255>,
    /// Description shown above the card list
    pub description: MaxStr<1024>,
    /// Who may see the collection
    pub visibility: Visibility,
}

impl Collection {
    /// Fetch every collection an account owns
    #[instrument(name = "Collection::get_all_for_account", skip(tx))]
    pub async fn get_all_for_account(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<Collection>, rorm::Error> {
        let collections = rorm::query(&mut *tx, CollectionModel)
            .condition(CollectionModel.owner.equals(account.into_inner()))
            .all()
            .await?;
        Ok(collections.into_iter().map(Collection::from).collect())
    }

    /// Fetch a collection if `viewer` is allowed to see it
    ///
    /// Returns `None` both for "does not exist" and "not visible" — callers
    /// must not tell the two apart, or the answer leaks whether a private
    /// collection exists.
    ///
    /// [`Visibility::Unlisted`] deliberately does not resolve here: the share
    /// token is the authorization, see [`Collection::get_by_share_token`].
    #[instrument(name = "Collection::get_visible", skip(tx))]
    pub async fn get_visible(
        tx: &mut Transaction,
        uuid: CollectionUuid,
        viewer: Option<AccountUuid>,
    ) -> Result<Option<Collection>, rorm::Error> {
        // An anonymous request has no owner branch at all — `owner` is not
        // nullable, so the condition has to be left out rather than compared
        // against `NULL`.
        let mut visible = vec![
            CollectionModel
                .visibility
                .equals(Visibility::Public)
                .boxed(),
        ];
        if let Some(viewer) = viewer {
            visible.push(CollectionModel.owner.equals(viewer.into_inner()).boxed());
        }

        let collection = rorm::query(&mut *tx, CollectionModel)
            .condition(rorm::and![
                CollectionModel.uuid.equals(uuid.0),
                DynamicCollection::or_unchecked(visible),
            ])
            .optional()
            .await?;
        Ok(collection.map(Collection::from))
    }

    /// Fetch a collection by the secret in its share link
    #[instrument(name = "Collection::get_by_share_token", skip(tx, token))]
    pub async fn get_by_share_token(
        tx: &mut Transaction,
        token: &MaxStr<64>,
    ) -> Result<Option<Collection>, rorm::Error> {
        let collection = rorm::query(&mut *tx, CollectionModel)
            .condition(CollectionModel.share_token.equals(Some(token)))
            .optional()
            .await?;
        Ok(collection.map(Collection::from))
    }

    /// Create a new collection
    #[instrument(name = "Collection::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: CollectionInsert,
    ) -> Result<CollectionUuid, rorm::Error> {
        let uuid = rorm::insert(&mut *tx, CollectionModel)
            .return_primary_key()
            .single(&CollectionInsertPatch {
                uuid: Uuid::now_v7(),
                name: insert.name,
                description: insert.description,
                owner: ForeignModelByField(owner.into_inner()),
                visibility: insert.visibility,
                share_token: None,
            })
            .await?;
        Ok(CollectionUuid(uuid))
    }

    /// Rename a collection and update its description
    ///
    /// Returns `false` if the collection does not exist.
    #[instrument(name = "Collection::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        uuid: CollectionUuid,
        name: MaxStr<255>,
        description: MaxStr<1024>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(&mut *tx, CollectionModel)
            .set(CollectionModel.name, name)
            .set(CollectionModel.description, description)
            .condition(CollectionModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Set a collection's visibility
    ///
    /// Switching to [`Visibility::Unlisted`] mints a share token; switching
    /// away revokes it, so every link handed out so far stops working.
    ///
    /// Returns `false` if the collection does not exist.
    #[instrument(name = "Collection::set_visibility", skip(tx))]
    pub async fn set_visibility(
        tx: &mut Transaction,
        uuid: CollectionUuid,
        visibility: Visibility,
    ) -> Result<bool, rorm::Error> {
        let share_token = match visibility {
            Visibility::Unlisted => Some(generate_share_token()),
            Visibility::Private | Visibility::Public => None,
        };

        let affected = rorm::update(&mut *tx, CollectionModel)
            .set(CollectionModel.visibility, visibility)
            .set(CollectionModel.share_token, share_token)
            .condition(CollectionModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Mint a fresh share token, invalidating every link handed out so far
    ///
    /// Returns `None` if the collection does not exist.
    #[instrument(name = "Collection::rotate_share_token", skip(tx))]
    pub async fn rotate_share_token(
        tx: &mut Transaction,
        uuid: CollectionUuid,
    ) -> Result<Option<MaxStr<64>>, rorm::Error> {
        let token = generate_share_token();
        let affected = rorm::update(&mut *tx, CollectionModel)
            .set(CollectionModel.share_token, Some(token.clone()))
            .condition(CollectionModel.uuid.equals(uuid.0))
            .await?;
        Ok((affected > 0).then_some(token))
    }

    /// Delete a collection and, through the cascade, everything in it
    ///
    /// Returns `false` if the collection does not exist.
    #[instrument(name = "Collection::delete", skip(tx))]
    pub async fn delete(tx: &mut Transaction, uuid: CollectionUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(&mut *tx, CollectionModel)
            .condition(CollectionModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

impl From<CollectionModel> for Collection {
    fn from(value: CollectionModel) -> Self {
        Self {
            uuid: CollectionUuid(value.uuid),
            name: value.name,
            description: value.description,
            owner: AccountUuid::new_from_field(value.owner),
            visibility: value.visibility,
            share_token: value.share_token,
            created_at: value.created_at,
        }
    }
}

/// A stack of identical physical cards inside a [`Collection`]
#[derive(Debug, Clone)]
pub struct CollectionEntry {
    /// Primary key
    pub uuid: CollectionEntryUuid,
    /// The collection this entry belongs to
    pub collection: CollectionUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies this stack holds
    pub quantity: i32,
    /// Condition of the cards in this stack
    pub condition: CardCondition,
    /// Finish of the cards in this stack
    pub finish: CardFinish,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<Date>,
    /// The point in time the entry was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`CollectionEntry`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct CollectionEntryUuid(Uuid);

impl CollectionEntryUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Data for adding cards to a [`Collection`]
#[derive(Debug, Clone)]
pub struct CollectionEntryInsert {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies to add
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<Date>,
}

impl CollectionEntry {
    /// Fetch every entry of a collection
    #[instrument(name = "CollectionEntry::get_all_in_collection", skip(tx))]
    pub async fn get_all_in_collection(
        tx: &mut Transaction,
        collection: CollectionUuid,
    ) -> Result<Vec<CollectionEntry>, rorm::Error> {
        let entries = rorm::query(&mut *tx, CollectionEntryModel)
            .condition(CollectionEntryModel.collection.equals(collection.0))
            .all()
            .await?;
        Ok(entries.into_iter().map(CollectionEntry::from).collect())
    }

    /// Add stacks of cards to a collection
    ///
    /// Every stack becomes its own row; merging identical stacks is the
    /// caller's decision, because a printing can legitimately appear twice in
    /// the same collection — say once played and once near mint.
    #[instrument(name = "CollectionEntry::create_many", skip(tx, inserts))]
    pub async fn create_many(
        tx: &mut Transaction,
        collection: CollectionUuid,
        inserts: Vec<CollectionEntryInsert>,
    ) -> Result<Vec<CollectionEntryUuid>, rorm::Error> {
        let mut uuids = Vec::with_capacity(inserts.len());
        for insert in inserts {
            let uuid = rorm::insert(&mut *tx, CollectionEntryModel)
                .return_primary_key()
                .single(&CollectionEntryInsertPatch {
                    uuid: Uuid::now_v7(),
                    collection: ForeignModelByField(collection.0),
                    printing: insert.printing,
                    quantity: insert.quantity,
                    condition: insert.condition,
                    finish: insert.finish,
                    purchase_price_cents: insert.purchase_price_cents,
                    acquired_at: insert.acquired_at,
                })
                .await?;
            uuids.push(CollectionEntryUuid(uuid));
        }
        Ok(uuids)
    }

    /// Change how many copies a stack holds
    ///
    /// Returns `false` if the entry does not exist.
    #[instrument(name = "CollectionEntry::set_quantity", skip(tx))]
    pub async fn set_quantity(
        tx: &mut Transaction,
        uuid: CollectionEntryUuid,
        quantity: i32,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(&mut *tx, CollectionEntryModel)
            .set(CollectionEntryModel.quantity, quantity)
            .condition(CollectionEntryModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Delete an entry
    ///
    /// Returns `false` if the entry does not exist.
    #[instrument(name = "CollectionEntry::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        uuid: CollectionEntryUuid,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(&mut *tx, CollectionEntryModel)
            .condition(CollectionEntryModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Repoint every entry of a merged Scryfall printing at its replacement
    ///
    /// Scryfall's `/migrations` endpoint reports `merge` migrations that
    /// collapse two printings into one. Because the printing id is not a
    /// foreign key, repairing it is a plain rewrite.
    ///
    /// Returns how many entries were repointed.
    #[instrument(name = "CollectionEntry::apply_printing_merge", skip(tx))]
    pub async fn apply_printing_merge(
        tx: &mut Transaction,
        old_printing: Uuid,
        new_printing: Uuid,
    ) -> Result<u64, rorm::Error> {
        rorm::update(&mut *tx, CollectionEntryModel)
            .set(CollectionEntryModel.printing, new_printing)
            .condition(CollectionEntryModel.printing.equals(old_printing))
            .await
    }
}

impl From<CollectionEntryModel> for CollectionEntry {
    fn from(value: CollectionEntryModel) -> Self {
        Self {
            uuid: CollectionEntryUuid(value.uuid),
            collection: CollectionUuid::new_from_field(value.collection),
            printing: value.printing,
            quantity: value.quantity,
            condition: value.condition,
            finish: value.finish,
            purchase_price_cents: value.purchase_price_cents,
            acquired_at: value.acquired_at,
            created_at: value.created_at,
        }
    }
}

/// Generate the secret for a share link
fn generate_share_token() -> MaxStr<64> {
    let token = Alphanumeric.sample_string(&mut rand::rng(), SHARE_TOKEN_LEN);
    MaxStr::new(token).unwrap_or_else(|_| unreachable!("{SHARE_TOKEN_LEN} is below 64"))
}
