//! Collections of physical cards and the stacks they hold

use std::collections::HashSet;

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
use crate::models::deck::DeckUuid;
use crate::models::share::generate_share_token;
use crate::models::visibility::Visibility;

pub(in crate::models) mod db;
pub mod listing;
pub mod statistics;
pub mod stock;

/// How many stacks go into one `INSERT`
///
/// A collection entry binds eight parameters, and Postgres takes 65535 per
/// statement, so this leaves room to spare while still being a few thousand
/// rows per round trip.
const BULK_INSERT_CHUNK: usize = 4096;

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

    /// The colour the collection is drawn in
    pub color: MaxStr<16>,

    /// The pictogram drawn on the collection
    pub icon: MaxStr<32>,

    /// The deck this collection stands for, `None` for a collection on a shelf
    pub deck: Option<DeckUuid>,

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

    /// Wrap a uuid read back from a hand-written query
    ///
    /// Only for [`listing`], which reads rows the query builder never saw and
    /// so cannot hand over the wrapper itself.
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// Data for creating a new [`Collection`]
#[derive(Debug)]
pub struct CollectionInsert {
    /// Name of the collection
    pub name: MaxStr<255>,
    /// Description shown above the card list
    pub description: MaxStr<1024>,
    /// The colour the collection is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on the collection
    pub icon: MaxStr<32>,
    /// The deck this collection stands for, `None` for a collection on a shelf
    pub deck: Option<DeckUuid>,
    /// Who may see the collection
    pub visibility: Visibility,
}

/// The fields of a [`Collection`] its owner may edit
///
/// Visibility is not among them: it has its own endpoint, because switching it
/// mints or revokes the share token.
#[derive(Debug)]
pub struct CollectionUpdate {
    /// Name of the collection
    pub name: MaxStr<255>,
    /// Description shown above the card list
    pub description: MaxStr<1024>,
    /// The colour the collection is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on the collection
    pub icon: MaxStr<32>,
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
                color: insert.color,
                icon: insert.icon,
                deck: insert
                    .deck
                    .map(|deck| ForeignModelByField(deck.into_inner())),
                owner: ForeignModelByField(owner.into_inner()),
                visibility: insert.visibility,
                share_token: None,
            })
            .await?;
        Ok(Self::from(collection))
    }

    /// Rename a collection and update everything else its owner may edit
    ///
    /// Returns `false` if the collection does not exist or `owner` does not
    /// own it — callers must not tell the two apart.
    #[instrument(name = "Collection::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: CollectionUuid,
        update: CollectionUpdate,
    ) -> Result<CollectionAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, CollectionModel)
            .set(CollectionModel.name, update.name)
            .set(CollectionModel.description, update.description)
            .set(CollectionModel.color, update.color)
            .set(CollectionModel.icon, update.icon)
            .condition(owned_standalone_by(uuid, owner))
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
            .condition(owned_standalone_by(uuid, owner))
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
            .condition(owned_standalone_by(uuid, owner))
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
            .condition(owned_standalone_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Delete every collection an account owns, deck collections included
    ///
    /// What an account being deleted needs before the account row goes. The
    /// cascade off `account` would take these too, but the rollup in
    /// `collection_stock` is kept by a trigger on `collection`, and that
    /// trigger writes the owner back into the rollup: run inside the cascade,
    /// it writes a row pointing at an account that no longer exists. Deleting
    /// them first lets the trigger do its bookkeeping while there is still
    /// something to point at, and the zeroed rollup rows leave with the
    /// account.
    ///
    /// Returns how many collections were deleted.
    #[instrument(name = "Collection::delete_all_of_account", skip(tx))]
    pub async fn delete_all_of_account(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<u64, rorm::Error> {
        rorm::delete(&mut *tx, CollectionModel)
            .condition(CollectionModel.owner.equals(owner.into_inner()))
            .await
    }
}

impl From<CollectionModel> for Collection {
    fn from(value: CollectionModel) -> Self {
        Self {
            uuid: CollectionUuid(value.uuid),
            name: value.name,
            description: value.description,
            color: value.color,
            icon: value.icon,
            deck: value.deck.map(DeckUuid::new_from_field),
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
    /// Whether the cards carry an artist's signature
    pub signed: bool,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<Date>,
    /// The collection the cards were taken out of, `None` if they were always here
    pub origin: Option<CollectionUuid>,
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

    /// Wrap a uuid read back from a hand-written query
    ///
    /// Only for [`super::collection::listing`], which reads rows the query
    /// builder never saw and so cannot hand over the wrapper itself.
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
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
    /// Whether the cards carry an artist's signature
    pub signed: bool,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<Date>,
}

/// The fields of a [`CollectionEntry`] a partial update may change
///
/// `None` leaves a field as it is. The nullable ones are wrapped twice, so
/// `Some(None)` can say "clear this" — a plain `None` cannot, because it
/// already means "don't touch it".
#[derive(Debug, Clone, Default)]
pub struct CollectionEntryPatch {
    /// Scryfall's id of the printing — set to correct a mis-identified card
    pub printing: Option<Uuid>,
    /// How many copies the stack holds
    pub quantity: Option<i32>,
    /// Condition of the cards
    pub condition: Option<CardCondition>,
    /// Finish of the cards
    pub finish: Option<CardFinish>,
    /// Whether the cards carry an artist's signature
    pub signed: Option<bool>,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<Option<i64>>,
    /// The day the cards were acquired
    pub acquired_at: Option<Option<Date>>,
}

/// What a stack the copies are split off into differs in
///
/// Whatever is left `None` is inherited from the stack being split — the point
/// of a split is usually that *one* thing changed.
#[derive(Debug, Clone, Default)]
pub struct CollectionEntrySplit {
    /// Condition of the split-off cards
    pub condition: Option<CardCondition>,
    /// Finish of the split-off cards
    pub finish: Option<CardFinish>,
    /// Whether the split-off cards carry an artist's signature
    pub signed: Option<bool>,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<Option<i64>>,
    /// The day the split-off cards were acquired
    pub acquired_at: Option<Option<Date>>,
}

/// Outcome of splitting copies off a stack
///
/// The lopsided variants are deliberate: this is a return value handed up one
/// call stack per request, so the few words a `Denied` carries around are
/// cheaper than a collection on the path that actually did the work.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone)]
pub enum SplitOutcome {
    /// The stack was split, carrying what is left of it and what moved out
    Split {
        /// The original stack, now smaller
        source: CollectionEntry,
        /// The stack the copies moved into
        created: CollectionEntry,
    },
    /// No such stack in this collection
    Denied,
    /// The stack does not hold enough copies to give that many away
    TooFewCopies,
}

/// Outcome of moving copies from one collection into another
///
/// Lopsided for the same reason as [`SplitOutcome`].
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone)]
pub enum MoveOutcome {
    /// The copies moved, carrying what is left behind and what arrived
    Moved {
        /// What is left of the stack they came from, `None` once it is empty
        source: Option<CollectionEntry>,
        /// The stack they are part of now
        filed: CollectionEntry,
    },
    /// No such stack, or one of the two collections is not this account's
    Denied,
    /// The stack does not hold that many copies
    TooFewCopies,
}

/// Outcome of merging stacks into one
#[derive(Debug, Clone)]
pub enum MergeOutcome {
    /// The stacks were merged into this one
    Merged(CollectionEntry),
    /// At least one of the stacks is not in this collection
    Denied,
    /// The stacks are not the same cards, so merging them would lose that
    Incompatible,
}

impl CollectionEntry {
    /// Fetch a single entry of a collection
    ///
    /// Scoped by collection for the same reason as
    /// [`CollectionEntry::set_quantity`]: the caller has only proven it may
    /// administer *that* collection.
    #[instrument(name = "CollectionEntry::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        collection: CollectionUuid,
        uuid: CollectionEntryUuid,
    ) -> Result<Option<CollectionEntry>, rorm::Error> {
        let entry = rorm::query(&mut *tx, CollectionEntryModel)
            .condition(rorm::and![
                CollectionEntryModel.uuid.equals(uuid.0),
                CollectionEntryModel.collection.equals(collection.0),
            ])
            .optional()
            .await?;
        Ok(entry.map(CollectionEntry::from))
    }

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
    ///
    /// Written as bulk inserts rather than a row at a time: importing a
    /// collection from another tracker arrives here as thousands of stacks at
    /// once, and a round trip each turns that into minutes of waiting.
    #[instrument(name = "CollectionEntry::create_many", skip(tx, inserts))]
    pub async fn create_many(
        tx: &mut Transaction,
        collection: CollectionUuid,
        inserts: Vec<CollectionEntryInsert>,
    ) -> Result<Vec<CollectionEntryUuid>, rorm::Error> {
        let patches: Vec<_> = inserts
            .into_iter()
            .map(|insert| CollectionEntryInsertPatch {
                uuid: Uuid::now_v7(),
                collection: ForeignModelByField(collection.0),
                printing: insert.printing,
                quantity: insert.quantity,
                condition: insert.condition,
                finish: insert.finish,
                signed: insert.signed,
                purchase_price_cents: insert.purchase_price_cents,
                acquired_at: insert.acquired_at,
                // Filing cards straight into a collection is where they have always
                // been as far as this app is concerned. Only a move out of
                // another collection carries an origin.
                origin: None,
            })
            .collect();
        let uuids = patches
            .iter()
            .map(|patch| CollectionEntryUuid(patch.uuid))
            .collect();

        // Postgres binds at most 65535 parameters per statement, so a big
        // enough import has to be split however this is written. The chunk is
        // sized off that limit rather than off the caller's batching, which is
        // not something this can rely on.
        for chunk in patches.chunks(BULK_INSERT_CHUNK) {
            rorm::insert(&mut *tx, CollectionEntryModel)
                .bulk(chunk)
                .await?;
        }

        Ok(uuids)
    }

    /// Change some of a stack's fields, leaving the rest alone
    ///
    /// The collection is part of the condition, not just the entry: the caller
    /// has only proven it may administer *that* collection, so an entry uuid
    /// from somewhere else must not match.
    ///
    /// Deliberately does not fold the result into an identical stack that may
    /// already exist. Two stacks of the same printing in the same condition and
    /// finish are not a mistake — they are the same card bought twice, at
    /// different prices and on different days, and that is exactly what the
    /// purchase price is recorded for. Combining them is
    /// [`CollectionEntry::merge`], which the user asks for explicitly.
    ///
    /// Returns the stack as it now stands, or [`CollectionAccess::Denied`] if
    /// there is no such stack here.
    #[instrument(name = "CollectionEntry::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        collection: CollectionUuid,
        uuid: CollectionEntryUuid,
        patch: CollectionEntryPatch,
    ) -> Result<CollectionAccess<CollectionEntry>, rorm::Error> {
        let builder = rorm::update(&mut *tx, CollectionEntryModel)
            .begin_dyn_set()
            .set_if(CollectionEntryModel.printing, patch.printing)
            .set_if(CollectionEntryModel.quantity, patch.quantity)
            .set_if(CollectionEntryModel.condition, patch.condition)
            .set_if(CollectionEntryModel.finish, patch.finish)
            .set_if(CollectionEntryModel.signed, patch.signed)
            .set_if(
                CollectionEntryModel.purchase_price_cents,
                patch.purchase_price_cents,
            )
            .set_if(CollectionEntryModel.acquired_at, patch.acquired_at);

        // A patch that changes nothing is not an error — it still has to answer
        // with the stack, and the caller should not have to special-case it.
        let Ok(builder) = builder.finish_dyn_set() else {
            return Ok(match Self::get(&mut *tx, collection, uuid).await? {
                Some(entry) => CollectionAccess::Granted(entry),
                None => CollectionAccess::Denied,
            });
        };

        let affected = builder
            .condition(rorm::and![
                CollectionEntryModel.uuid.equals(uuid.0),
                CollectionEntryModel.collection.equals(collection.0),
            ])
            .await?;
        if affected == 0 {
            return Ok(CollectionAccess::Denied);
        }

        // Read back rather than patching the values together in memory: the
        // response should be what the database holds, not what this thinks it
        // wrote.
        Ok(match Self::get(&mut *tx, collection, uuid).await? {
            Some(entry) => CollectionAccess::Granted(entry),
            None => CollectionAccess::Denied,
        })
    }

    /// Move `quantity` copies out of a stack into a new one
    ///
    /// This is the "three of them are still near mint, one got played" case.
    /// Strictly fewer copies than the stack holds may move: handing over all of
    /// them is not a split, it is [`CollectionEntry::update`].
    ///
    /// Everything the split does not override is inherited, so splitting off a
    /// played copy keeps the price it was bought at.
    #[instrument(name = "CollectionEntry::split", skip(tx))]
    pub async fn split(
        tx: &mut Transaction,
        collection: CollectionUuid,
        uuid: CollectionEntryUuid,
        quantity: i32,
        split: CollectionEntrySplit,
    ) -> Result<SplitOutcome, rorm::Error> {
        let Some(source) = Self::get(&mut *tx, collection, uuid).await? else {
            return Ok(SplitOutcome::Denied);
        };
        if quantity < 1 || quantity >= source.quantity {
            return Ok(SplitOutcome::TooFewCopies);
        }

        let created = rorm::insert(&mut *tx, CollectionEntryModel)
            .single(&CollectionEntryInsertPatch {
                uuid: Uuid::now_v7(),
                collection: ForeignModelByField(collection.0),
                printing: source.printing,
                quantity,
                condition: split.condition.unwrap_or(source.condition),
                finish: split.finish.unwrap_or(source.finish),
                signed: split.signed.unwrap_or(source.signed),
                purchase_price_cents: split
                    .purchase_price_cents
                    .unwrap_or(source.purchase_price_cents),
                acquired_at: split.acquired_at.unwrap_or(source.acquired_at),
                origin: source
                    .origin
                    .map(|origin| ForeignModelByField(origin.into_inner())),
            })
            .await?;

        let remaining = source.quantity - quantity;
        rorm::update(&mut *tx, CollectionEntryModel)
            .set(CollectionEntryModel.quantity, remaining)
            .condition(rorm::and![
                CollectionEntryModel.uuid.equals(uuid.0),
                CollectionEntryModel.collection.equals(collection.0),
            ])
            .await?;

        Ok(SplitOutcome::Split {
            source: CollectionEntry {
                quantity: remaining,
                ..source
            },
            created: CollectionEntry::from(created),
        })
    }

    /// Combine several stacks of the same cards into one
    ///
    /// Only stacks that are genuinely interchangeable may be merged — same
    /// printing, same condition, same finish, and signed alike. Merging across
    /// those would throw away the very thing that made them separate rows.
    ///
    /// The oldest stack survives (uuids are v7, so the smallest is the one filed
    /// first) and keeps that identity. Its purchase price is folded by
    /// [`folded_price`] and its acquisition date becomes the earliest of them —
    /// the stack now *is* those cards, so its numbers have to describe all of
    /// them.
    #[instrument(name = "CollectionEntry::merge", skip(tx))]
    pub async fn merge(
        tx: &mut Transaction,
        collection: CollectionUuid,
        uuids: &[CollectionEntryUuid],
    ) -> Result<MergeOutcome, rorm::Error> {
        let wanted: HashSet<Uuid> = uuids.iter().map(|uuid| uuid.0).collect();
        if wanted.len() < 2 {
            return Ok(MergeOutcome::Incompatible);
        }

        let entries = rorm::query(&mut *tx, CollectionEntryModel)
            .condition(rorm::and![
                CollectionEntryModel.collection.equals(collection.0),
                DynamicCollection::or_unchecked(
                    wanted
                        .iter()
                        .map(|uuid| CollectionEntryModel.uuid.equals(*uuid).boxed())
                        .collect(),
                ),
            ])
            .all()
            .await?;
        // Anything missing here was either deleted or belongs elsewhere, and
        // the caller must not be able to tell those apart.
        if entries.len() != wanted.len() {
            return Ok(MergeOutcome::Denied);
        }

        let mut entries: Vec<CollectionEntry> =
            entries.into_iter().map(CollectionEntry::from).collect();
        entries.sort_by_key(|entry| entry.uuid.0);

        let (survivor, rest) = entries
            .split_first()
            .unwrap_or_else(|| unreachable!("at least two entries were just counted"));
        if rest.iter().any(|entry| {
            entry.printing != survivor.printing
                || entry.condition != survivor.condition
                || entry.finish != survivor.finish
                || entry.signed != survivor.signed
        }) {
            return Ok(MergeOutcome::Incompatible);
        }

        let quantity: i32 = entries.iter().map(|entry| entry.quantity).sum();
        let folded: Vec<(Option<i64>, i32)> = entries
            .iter()
            .map(|entry| (entry.purchase_price_cents, entry.quantity))
            .collect();
        let purchase_price_cents = folded_price(&folded);
        let acquired_at = entries.iter().filter_map(|entry| entry.acquired_at).min();

        rorm::update(&mut *tx, CollectionEntryModel)
            .set(CollectionEntryModel.quantity, quantity)
            .set(
                CollectionEntryModel.purchase_price_cents,
                purchase_price_cents,
            )
            .set(CollectionEntryModel.acquired_at, acquired_at)
            .condition(CollectionEntryModel.uuid.equals(survivor.uuid.0))
            .await?;

        rorm::delete(&mut *tx, CollectionEntryModel)
            .condition(DynamicCollection::or_unchecked(
                rest.iter()
                    .map(|entry| CollectionEntryModel.uuid.equals(entry.uuid.0).boxed())
                    .collect(),
            ))
            .await?;

        Ok(MergeOutcome::Merged(CollectionEntry {
            quantity,
            purchase_price_cents,
            acquired_at,
            ..survivor.clone()
        }))
    }

    /// Which collection a stack lies in, if this account owns it
    ///
    /// The sourcing view hands out stack ids from every collection at once, so the
    /// handler taking one of them has to ask where it came from before it can
    /// write that down.
    #[instrument(name = "CollectionEntry::collection_of", skip(tx))]
    pub async fn collection_of(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: CollectionEntryUuid,
    ) -> Result<Option<CollectionUuid>, rorm::Error> {
        let entry = rorm::query(&mut *tx, CollectionEntryModel)
            .condition(rorm::and![
                CollectionEntryModel.uuid.equals(uuid.0),
                CollectionEntryModel
                    .collection
                    .owner
                    .equals(owner.into_inner()),
            ])
            .optional()
            .await?;
        Ok(entry.map(|entry| CollectionUuid::new_from_field(entry.collection)))
    }

    /// File cards into a collection, folding them into the stack they belong to
    ///
    /// Where [`CollectionEntry::create_many`] deliberately keeps every filing
    /// its own row, cards that *move* have a stack to return to: copies out of
    /// the same collection, in the same state, finish and signed alike, are the
    /// same stack again.
    /// Price and date are folded the way [`CollectionEntry::merge`] folds them,
    /// so the numbers keep describing every copy in the stack.
    #[instrument(name = "CollectionEntry::file_into", skip(tx))]
    pub async fn file_into(
        tx: &mut Transaction,
        collection: CollectionUuid,
        insert: CollectionEntryInsert,
        origin: Option<CollectionUuid>,
    ) -> Result<CollectionEntry, rorm::Error> {
        let existing = rorm::query(&mut *tx, CollectionEntryModel)
            .condition(rorm::and![
                CollectionEntryModel.collection.equals(collection.0),
                CollectionEntryModel.printing.equals(insert.printing),
                CollectionEntryModel.condition.equals(insert.condition),
                CollectionEntryModel.finish.equals(insert.finish),
                CollectionEntryModel.signed.equals(insert.signed),
                CollectionEntryModel
                    .origin
                    .equals(origin.map(|origin| origin.0)),
            ])
            .all()
            .await?;

        // The oldest stack takes them, the same rule a merge follows: uuids are
        // v7, so the smallest is the one filed first.
        let into = existing
            .into_iter()
            .map(CollectionEntry::from)
            .min_by_key(|entry| entry.uuid.0);

        let Some(into) = into else {
            let created = rorm::insert(&mut *tx, CollectionEntryModel)
                .single(&CollectionEntryInsertPatch {
                    uuid: Uuid::now_v7(),
                    collection: ForeignModelByField(collection.0),
                    printing: insert.printing,
                    quantity: insert.quantity,
                    condition: insert.condition,
                    finish: insert.finish,
                    signed: insert.signed,
                    purchase_price_cents: insert.purchase_price_cents,
                    acquired_at: insert.acquired_at,
                    origin: origin.map(|origin| ForeignModelByField(origin.0)),
                })
                .await?;
            return Ok(CollectionEntry::from(created));
        };

        let quantity = into.quantity + insert.quantity;
        let purchase_price_cents = folded_price(&[
            (into.purchase_price_cents, into.quantity),
            (insert.purchase_price_cents, insert.quantity),
        ]);
        let acquired_at = [into.acquired_at, insert.acquired_at]
            .into_iter()
            .flatten()
            .min();

        rorm::update(&mut *tx, CollectionEntryModel)
            .set(CollectionEntryModel.quantity, quantity)
            .set(
                CollectionEntryModel.purchase_price_cents,
                purchase_price_cents,
            )
            .set(CollectionEntryModel.acquired_at, acquired_at)
            .condition(CollectionEntryModel.uuid.equals(into.uuid.0))
            .await?;

        Ok(CollectionEntry {
            quantity,
            purchase_price_cents,
            acquired_at,
            ..into
        })
    }

    /// Move copies out of one collection into another
    ///
    /// The one write that makes a card change place instead of being counted
    /// twice: the stack it came from shrinks by exactly what arrives on the
    /// other side, so the account's total never moves. `origin` is what the
    /// copies remember of where they were, which is how a deck is taken apart
    /// again; the way back is this same call with the origin as the target and
    /// no origin of its own.
    ///
    /// Both collections are checked against `owner` here rather than by the
    /// caller: a move touches two of them, and only one of the two is ever the
    /// one a handler has already proven itself allowed to administer.
    #[instrument(name = "CollectionEntry::move_copies", skip(tx))]
    pub async fn move_copies(
        tx: &mut Transaction,
        owner: AccountUuid,
        from: CollectionEntryUuid,
        quantity: i32,
        into: CollectionUuid,
        origin: Option<CollectionUuid>,
    ) -> Result<MoveOutcome, rorm::Error> {
        let target = rorm::query(&mut *tx, CollectionModel.uuid)
            .condition(owned_by(into, owner))
            .optional()
            .await?;
        if target.is_none() {
            return Ok(MoveOutcome::Denied);
        }

        let source = rorm::query(&mut *tx, CollectionEntryModel)
            .condition(rorm::and![
                CollectionEntryModel.uuid.equals(from.0),
                CollectionEntryModel
                    .collection
                    .owner
                    .equals(owner.into_inner()),
            ])
            .optional()
            .await?;
        let Some(source) = source.map(CollectionEntry::from) else {
            return Ok(MoveOutcome::Denied);
        };
        if quantity < 1 || quantity > source.quantity {
            return Ok(MoveOutcome::TooFewCopies);
        }

        let remaining = source.quantity - quantity;
        if remaining == 0 {
            rorm::delete(&mut *tx, CollectionEntryModel)
                .condition(CollectionEntryModel.uuid.equals(from.0))
                .await?;
        } else {
            rorm::update(&mut *tx, CollectionEntryModel)
                .set(CollectionEntryModel.quantity, remaining)
                .condition(CollectionEntryModel.uuid.equals(from.0))
                .await?;
        }

        let filed = Self::file_into(
            &mut *tx,
            into,
            CollectionEntryInsert {
                printing: source.printing,
                quantity,
                condition: source.condition,
                finish: source.finish,
                signed: source.signed,
                purchase_price_cents: source.purchase_price_cents,
                acquired_at: source.acquired_at,
            },
            origin,
        )
        .await?;

        Ok(MoveOutcome::Moved {
            source: (remaining > 0).then_some(CollectionEntry {
                quantity: remaining,
                ..source
            }),
            filed,
        })
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
            signed: value.signed,
            purchase_price_cents: value.purchase_price_cents,
            acquired_at: value.acquired_at,
            origin: value.origin.map(CollectionUuid::new_from_field),
            created_at: value.created_at,
        }
    }
}

/// The price per copy a stack carries once several of them became one
///
/// A stack records what one copy cost, so the money it stands for is that price
/// times its count. Folding stacks together therefore has to spread what was
/// actually spent over *every* copy that ends up in the stack, not only over
/// the ones that came with a price: averaging over the priced copies alone and
/// writing the result onto the whole stack would multiply the spend by the
/// copies that were free of one, and the statistics would report money nobody
/// paid.
///
/// `None` when no stack recorded a price at all — that is "nobody wrote it
/// down", which is not the same as having paid nothing, and it stays that way.
///
/// Takes the price and the count of each stack, in cents and copies.
fn folded_price(stacks: &[(Option<i64>, i32)]) -> Option<i64> {
    let copies: i64 = stacks
        .iter()
        .map(|(_, quantity)| i64::from(*quantity))
        .sum();
    if copies < 1 || !stacks.iter().any(|(price, _)| price.is_some()) {
        return None;
    }

    let spent: i64 = stacks
        .iter()
        .filter_map(|(price, quantity)| Some((*price)? * i64::from(*quantity)))
        .sum();
    Some(spent / copies)
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

/// Condition matching a collection only when `account` owns it and no deck
/// stands behind it
///
/// The collection a deck stands for is administered through its deck. Renaming,
/// sharing or deleting it from the shelf would leave the deck pointing at
/// something that is no longer what it says it is, so those statements simply
/// never match it.
fn owned_standalone_by(uuid: CollectionUuid, account: AccountUuid) -> impl Condition<'static> {
    rorm::and![
        owned_by(uuid, account),
        CollectionModel.deck.equals(None::<Uuid>),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folding_spreads_the_spend_over_every_copy() {
        assert_eq!(folded_price(&[(Some(1000), 1), (None, 3)]), Some(250));
        assert_eq!(folded_price(&[(Some(1000), 1), (Some(500), 1)]), Some(750));
        assert_eq!(folded_price(&[(Some(0), 2), (None, 2)]), Some(0));
    }

    #[test]
    fn folding_keeps_an_unrecorded_price_unrecorded() {
        assert_eq!(folded_price(&[(None, 1), (None, 4)]), None);
        assert_eq!(folded_price(&[]), None);
    }
}
