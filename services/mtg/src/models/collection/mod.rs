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

/// Outcome of an operation that only a collection's owner may perform
///
/// [`Self::Denied`] is a single variant on purpose: it covers "the collection
/// does not exist" and "it belongs to somebody else" alike. Telling the two
/// apart in a response would reveal that a stranger's collection exists.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CollectionAccess<T = ()> {
    /// The account owns the collection; carries whatever the operation produced
    Granted(T),
    /// The collection is gone, or it is not this account's to touch
    Denied,
}

impl<T> CollectionAccess<T> {
    /// Whether the operation was allowed
    pub fn is_granted(&self) -> bool {
        matches!(self, Self::Granted(_))
    }

    /// The operation's result, or `None` when it was denied
    pub fn granted(self) -> Option<T> {
        match self {
            Self::Granted(value) => Some(value),
            Self::Denied => None,
        }
    }
}

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
    /// Fetch every collection an account owns, alphabetically
    ///
    /// The primary key breaks ties, so the order is total and does not shift
    /// between calls — without it Postgres is free to hand back a renamed row
    /// in a different place and the list reshuffles under the user.
    #[instrument(name = "Collection::get_all_for_account", skip(tx))]
    pub async fn get_all_for_account(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<Collection>, rorm::Error> {
        let collections = rorm::query(&mut *tx, CollectionModel)
            .condition(CollectionModel.owner.equals(account.into_inner()))
            .order_asc(CollectionModel.name)
            .order_asc(CollectionModel.uuid)
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

    /// Whether `account` is allowed to administer the collection
    ///
    /// Prefer the owner-scoped mutators — [`Collection::update`],
    /// [`Collection::set_visibility`], [`Collection::rotate_share_token`] and
    /// [`Collection::delete`] all fold this check into their statement, so
    /// there is nothing to forget and nothing to race. Use this only when a
    /// handler needs the answer *before* doing unrelated work.
    #[instrument(name = "Collection::may_administer", skip(tx))]
    pub async fn may_administer(
        tx: &mut Transaction,
        uuid: CollectionUuid,
        account: AccountUuid,
    ) -> Result<CollectionAccess, rorm::Error> {
        let found = rorm::query(&mut *tx, CollectionModel.uuid)
            .condition(owned_by(uuid, account))
            .optional()
            .await?;
        Ok(match found {
            Some(_) => CollectionAccess::Granted(()),
            None => CollectionAccess::Denied,
        })
    }

    /// Fetch a collection by the secret in its share link
    #[instrument(name = "Collection::get_by_share_token", skip(tx, token))]
    pub async fn get_by_share_token(
        tx: &mut Transaction,
        token: &MaxStr<64>,
    ) -> Result<Option<Collection>, rorm::Error> {
        // The visibility is part of the condition, not just the token: a token
        // left over on a collection that is private again must not resolve.
        let collection = rorm::query(&mut *tx, CollectionModel)
            .condition(rorm::and![
                CollectionModel.share_token.equals(Some(token)),
                CollectionModel.visibility.equals(Visibility::Unlisted),
            ])
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
    ) -> Result<Collection, rorm::Error> {
        let collection = rorm::insert(&mut *tx, CollectionModel)
            .single(&CollectionInsertPatch {
                uuid: Uuid::now_v7(),
                name: insert.name,
                description: insert.description,
                owner: ForeignModelByField(owner.into_inner()),
                visibility: insert.visibility,
                share_token: None,
            })
            .await?;
        Ok(Self::from(collection))
    }

    /// Rename a collection and update its description
    ///
    /// Returns `false` if the collection does not exist or `owner` does not
    /// own it — callers must not tell the two apart.
    #[instrument(name = "Collection::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: CollectionUuid,
        name: MaxStr<255>,
        description: MaxStr<1024>,
    ) -> Result<CollectionAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, CollectionModel)
            .set(CollectionModel.name, name)
            .set(CollectionModel.description, description)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Set a collection's visibility
    ///
    /// Switching to [`Visibility::Unlisted`] mints a share token; switching
    /// away revokes it, so every link handed out so far stops working.
    ///
    /// Returns `false` if the collection does not exist or `owner` does not
    /// own it — callers must not tell the two apart.
    #[instrument(name = "Collection::set_visibility", skip(tx))]
    pub async fn set_visibility(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: CollectionUuid,
        visibility: Visibility,
    ) -> Result<CollectionAccess, rorm::Error> {
        let share_token = match visibility {
            Visibility::Unlisted => Some(generate_share_token()),
            Visibility::Private | Visibility::Public => None,
        };

        let affected = rorm::update(&mut *tx, CollectionModel)
            .set(CollectionModel.visibility, visibility)
            .set(CollectionModel.share_token, share_token)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Mint a fresh share token, invalidating every link handed out so far
    ///
    /// Returns `None` if the collection does not exist or `owner` does not
    /// own it — callers must not tell the two apart.
    #[instrument(name = "Collection::rotate_share_token", skip(tx))]
    pub async fn rotate_share_token(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: CollectionUuid,
    ) -> Result<CollectionAccess<MaxStr<64>>, rorm::Error> {
        let token = generate_share_token();
        let affected = rorm::update(&mut *tx, CollectionModel)
            .set(CollectionModel.share_token, Some(token.clone()))
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, token))
    }

    /// Delete a collection and, through the cascade, everything in it
    ///
    /// Returns `false` if the collection does not exist or `owner` does not
    /// own it — callers must not tell the two apart.
    #[instrument(name = "Collection::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: CollectionUuid,
    ) -> Result<CollectionAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, CollectionModel)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
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
    /// Fetch every entry of a collection, oldest first
    ///
    /// Ordered by the primary key: the uuids are v7, so this is the order the
    /// stacks were filed in, and it is total. Sorting by card name is the
    /// client's job — the backend has no card catalog to sort against.
    #[instrument(name = "CollectionEntry::get_all_in_collection", skip(tx))]
    pub async fn get_all_in_collection(
        tx: &mut Transaction,
        owner: AccountUuid,
        collection: CollectionUuid,
    ) -> Result<Vec<CollectionEntry>, rorm::Error> {
        let entries = rorm::query(&mut *tx, CollectionEntryModel)
            .condition(rorm::and![
                CollectionEntryModel.collection.equals(collection.0),
                CollectionEntryModel
                    .collection
                    .owner
                    .equals(owner.into_inner()),
            ])
            .order_asc(CollectionEntryModel.uuid)
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
    /// The collection is part of the condition, not just the entry: the caller
    /// has only proven it may administer *that* collection, so an entry uuid
    /// from somewhere else must not match.
    ///
    /// Returns `false` if the entry does not exist.
    #[instrument(name = "CollectionEntry::set_quantity", skip(tx))]
    pub async fn set_quantity(
        tx: &mut Transaction,
        collection: CollectionUuid,
        uuid: CollectionEntryUuid,
        quantity: i32,
    ) -> Result<CollectionAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, CollectionEntryModel)
            .set(CollectionEntryModel.quantity, quantity)
            .condition(rorm::and![
                CollectionEntryModel.uuid.equals(uuid.0),
                CollectionEntryModel.collection.equals(collection.0),
            ])
            .await?;
        Ok(access(affected, ()))
    }

    /// Delete an entry
    ///
    /// Scoped by collection for the same reason as [`CollectionEntry::set_quantity`].
    ///
    /// Returns `false` if the entry does not exist.
    #[instrument(name = "CollectionEntry::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        collection: CollectionUuid,
        uuid: CollectionEntryUuid,
    ) -> Result<CollectionAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, CollectionEntryModel)
            .condition(rorm::and![
                CollectionEntryModel.uuid.equals(uuid.0),
                CollectionEntryModel.collection.equals(collection.0),
            ])
            .await?;
        Ok(access(affected, ()))
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

/// Turn a statement's affected-row count into a [`CollectionAccess`]
///
/// Zero rows can only mean the `owned_by` condition did not match, since the
/// primary key is part of it.
fn access<T>(affected: u64, value: T) -> CollectionAccess<T> {
    if affected > 0 {
        CollectionAccess::Granted(value)
    } else {
        CollectionAccess::Denied
    }
}

/// Condition matching a collection only when `account` owns it
///
/// Every administrative statement is scoped through this, so ownership is part
/// of the query rather than a check somebody has to remember to write next to it.
fn owned_by(uuid: CollectionUuid, account: AccountUuid) -> impl Condition<'static> {
    rorm::and![
        CollectionModel.uuid.equals(uuid.0),
        CollectionModel.owner.equals(account.into_inner()),
    ]
}

/// Generate the secret for a share link
fn generate_share_token() -> MaxStr<64> {
    let token = Alphanumeric.sample_string(&mut rand::rng(), SHARE_TOKEN_LEN);
    MaxStr::new(token).unwrap_or_else(|_| unreachable!("{SHARE_TOKEN_LEN} is below 64"))
}
