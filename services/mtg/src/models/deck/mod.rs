//! Decks, their card slots and the zones those sit in
//!
//! Deck *legality* is deliberately absent from this module. Banlists change
//! monthly and Standard rotates, so a stored verdict is a lie waiting to
//! happen. The database keeps cards and a format slug; whether that adds up to
//! a legal deck is computed against the current card catalog, which lives in
//! the client.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
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
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::deck::db::DeckCardInsertPatch;
use crate::models::deck::db::DeckCardModel;
use crate::models::deck::db::DeckInsertPatch;
use crate::models::deck::db::DeckModel;
use crate::models::share::generate_share_token;
use crate::models::visibility::Visibility;

pub(in crate::models) mod db;
pub mod listing;
pub mod tag;

/// How many card slots go into one `INSERT`
///
/// A slot binds five parameters and Postgres takes 65535 per statement, so this
/// is far below the limit and still writes any decklist in one round trip.
const BULK_INSERT_CHUNK: usize = 4096;

/// The zone a [`DeckCard`] sits in
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum DeckZone {
    /// The main deck
    Main,
    /// The sideboard
    Side,
    /// The command zone — one card, or two for Partner decks
    Commander,
    /// The companion slot
    Companion,
    /// Considered but not currently in the deck
    Maybe,
}
custom_db_enum! {
    enum: DeckZone,
    variants: [Main, Side, Commander, Companion, Maybe],
    decoder: DeckZoneDecoder,
}

/// A deck built for a specific format
#[derive(Debug, Clone)]
pub struct Deck {
    /// Primary key
    pub uuid: DeckUuid,

    /// Name of the deck
    pub name: MaxStr<255>,

    /// Optional description, e.g. the deck's game plan
    pub description: Option<MaxStr<1024>>,

    /// The owner of the deck
    pub owner: AccountUuid,

    /// The format this deck is built for, matching Scryfall's `legalities` keys
    pub format: MaxStr<32>,

    /// Who may see this deck
    pub visibility: Visibility,

    /// Secret of the share link, `None` once the link is revoked
    pub share_token: Option<MaxStr<64>>,

    /// The colours the deck may play, `None` for whatever the commander allows
    pub allowed_color_identity: Option<MaxStr<8>>,

    /// Which Commander bracket the deck is built to, `None` when unset
    pub bracket: Option<i16>,

    /// The point in time the deck was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`Deck`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct DeckUuid(Uuid);

impl DeckUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `DeckUuid` from a `ForeignModel<DeckModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<DeckModel>) -> Self {
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

/// Data for creating a new [`Deck`]
#[derive(Debug)]
pub struct DeckInsert {
    /// Name of the deck
    pub name: MaxStr<255>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The format the deck is built for
    pub format: MaxStr<32>,
    /// Who may see the deck
    pub visibility: Visibility,
}

/// Outcome of an operation that only a deck's owner may perform
///
/// [`Self::Denied`] covers "no such deck" and "somebody else's deck" alike, see
/// [`crate::models::collection::CollectionAccess`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeckAccess<T = ()> {
    /// The account owns the deck; carries whatever the operation produced
    Granted(T),
    /// The deck is gone, or it is not this account's to touch
    Denied,
}

impl<T> DeckAccess<T> {
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

impl Deck {
    /// Fetch every deck an account owns, alphabetically
    ///
    /// The primary key breaks ties, so the order is total and a renamed deck
    /// does not jump somewhere else in the list.
    #[instrument(name = "Deck::get_all_for_account", skip(tx))]
    pub async fn get_all_for_account(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<Deck>, rorm::Error> {
        let decks = rorm::query(&mut *tx, DeckModel)
            .condition(DeckModel.owner.equals(account.into_inner()))
            .order_asc(DeckModel.name)
            .order_asc(DeckModel.uuid)
            .all()
            .await?;
        Ok(decks.into_iter().map(Deck::from).collect())
    }

    /// Fetch a deck if `viewer` is allowed to see it
    ///
    /// Returns `None` both for "does not exist" and "not visible", for the same
    /// reason as [`crate::models::collection::Collection::get_visible`].
    #[instrument(name = "Deck::get_visible", skip(tx))]
    pub async fn get_visible(
        tx: &mut Transaction,
        uuid: DeckUuid,
        viewer: Option<AccountUuid>,
    ) -> Result<Option<Deck>, rorm::Error> {
        let mut visible = vec![DeckModel.visibility.equals(Visibility::Public).boxed()];
        if let Some(viewer) = viewer {
            visible.push(DeckModel.owner.equals(viewer.into_inner()).boxed());
        }

        let deck = rorm::query(&mut *tx, DeckModel)
            .condition(rorm::and![
                DeckModel.uuid.equals(uuid.0),
                DynamicCollection::or_unchecked(visible),
            ])
            .optional()
            .await?;
        Ok(deck.map(Deck::from))
    }

    /// Whether `account` is allowed to administer the deck
    ///
    /// Prefer the owner-scoped mutators below, which fold this into their
    /// statement. Use this only when a handler needs the answer before doing
    /// unrelated work.
    #[instrument(name = "Deck::may_administer", skip(tx))]
    pub async fn may_administer(
        tx: &mut Transaction,
        uuid: DeckUuid,
        account: AccountUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        let found = rorm::query(&mut *tx, DeckModel.uuid)
            .condition(owned_by(uuid, account))
            .optional()
            .await?;
        Ok(match found {
            Some(_) => DeckAccess::Granted(()),
            None => DeckAccess::Denied,
        })
    }

    /// Fetch a deck by the secret in its share link
    ///
    /// The visibility is part of the condition, so a token left over on a deck
    /// that is private again does not resolve.
    #[instrument(name = "Deck::get_by_share_token", skip(tx, token))]
    pub async fn get_by_share_token(
        tx: &mut Transaction,
        token: &MaxStr<64>,
    ) -> Result<Option<Deck>, rorm::Error> {
        let deck = rorm::query(&mut *tx, DeckModel)
            .condition(rorm::and![
                DeckModel.share_token.equals(Some(token)),
                DeckModel.visibility.equals(Visibility::Unlisted),
            ])
            .optional()
            .await?;
        Ok(deck.map(Deck::from))
    }

    /// Create a new, empty deck
    #[instrument(name = "Deck::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: DeckInsert,
    ) -> Result<Deck, rorm::Error> {
        let deck = rorm::insert(&mut *tx, DeckModel)
            .single(&DeckInsertPatch {
                uuid: Uuid::now_v7(),
                name: insert.name,
                description: insert.description,
                owner: ForeignModelByField(owner.into_inner()),
                format: insert.format,
                visibility: insert.visibility,
                share_token: match insert.visibility {
                    Visibility::Unlisted => Some(generate_share_token()),
                    Visibility::Private | Visibility::Public => None,
                },
                allowed_color_identity: None,
                bracket: None,
            })
            .await?;
        Ok(Deck::from(deck))
    }

    /// Update a deck's metadata
    ///
    /// Changing the format is allowed even when it makes the deck illegal —
    /// the frontend reports violations, it does not prevent the edit.
    #[instrument(name = "Deck::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
        name: MaxStr<255>,
        description: Option<MaxStr<1024>>,
        format: MaxStr<32>,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.name, name)
            .set(DeckModel.description, description)
            .set(DeckModel.format, format)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Overrule which colours the deck may play, or go back to the commander's
    ///
    /// `None` hands the decision back to the commander zone.
    #[instrument(name = "Deck::set_allowed_color_identity", skip(tx))]
    pub async fn set_allowed_color_identity(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
        colors: Option<MaxStr<8>>,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.allowed_color_identity, colors)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Set which Commander bracket the deck is built to
    ///
    /// `None` clears it. Nothing is checked here: which bracket a deck belongs
    /// in is its builder's claim, and the client says where the claim and the
    /// cards disagree.
    #[instrument(name = "Deck::set_bracket", skip(tx))]
    pub async fn set_bracket(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
        bracket: Option<i16>,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.bracket, bracket)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Set a deck's visibility
    ///
    /// Switching to [`Visibility::Unlisted`] mints a share token; switching away
    /// revokes it, so every link handed out so far stops working.
    #[instrument(name = "Deck::set_visibility", skip(tx))]
    pub async fn set_visibility(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
        visibility: Visibility,
    ) -> Result<DeckAccess, rorm::Error> {
        let share_token = match visibility {
            Visibility::Unlisted => Some(generate_share_token()),
            Visibility::Private | Visibility::Public => None,
        };

        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.visibility, visibility)
            .set(DeckModel.share_token, share_token)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Mint a fresh share token, invalidating every link handed out so far
    #[instrument(name = "Deck::rotate_share_token", skip(tx))]
    pub async fn rotate_share_token(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
    ) -> Result<DeckAccess<MaxStr<64>>, rorm::Error> {
        let token = generate_share_token();
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.share_token, Some(token.clone()))
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, token))
    }

    /// Delete a deck and, through the cascade, all its cards
    #[instrument(name = "Deck::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, DeckModel)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }
}

/// Turn a statement's affected-row count into a [`DeckAccess`]
fn access<T>(affected: u64, value: T) -> DeckAccess<T> {
    if affected > 0 {
        DeckAccess::Granted(value)
    } else {
        DeckAccess::Denied
    }
}

/// Condition matching a deck only when `account` owns it
fn owned_by(uuid: DeckUuid, account: AccountUuid) -> impl Condition<'static> {
    rorm::and![
        DeckModel.uuid.equals(uuid.0),
        DeckModel.owner.equals(account.into_inner()),
    ]
}

impl From<DeckModel> for Deck {
    fn from(value: DeckModel) -> Self {
        Self {
            uuid: DeckUuid(value.uuid),
            name: value.name,
            description: value.description,
            owner: AccountUuid::new_from_field(value.owner),
            format: value.format,
            visibility: value.visibility,
            share_token: value.share_token,
            allowed_color_identity: value.allowed_color_identity,
            bracket: value.bracket,
            created_at: value.created_at,
        }
    }
}

/// One card slot of a [`Deck`]
#[derive(Debug, Clone)]
pub struct DeckCard {
    /// Primary key
    pub uuid: DeckCardUuid,
    /// The deck this card belongs to
    pub deck: DeckUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies of this card the zone holds
    pub quantity: i32,
    /// Which zone the card sits in
    pub zone: DeckZone,
    /// Whether the copies in this slot are the foil ones
    pub foil: bool,
}

/// Wrapper for the primary key of the [`DeckCard`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct DeckCardUuid(Uuid);

impl DeckCardUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Wrap a uuid read back from a hand-written query
    ///
    /// Only for [`super::deck::listing`], which reads rows the query builder
    /// never saw and so cannot hand over the wrapper itself.
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// The fields of a [`DeckCard`] a partial update may change
///
/// `None` leaves a field alone.
#[derive(Debug, Clone, Default)]
pub struct DeckCardPatch {
    /// Scryfall's id of the printing — set to sleeve a different print
    pub printing: Option<Uuid>,
    /// How many copies the slot holds
    pub quantity: Option<i32>,
    /// Which zone the card sits in
    pub zone: Option<DeckZone>,
    /// Whether the copies in this slot are the foil ones
    pub foil: Option<bool>,
}

/// One card slot to write into a [`Deck`]
#[derive(Debug, Clone)]
pub struct DeckCardInsert {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies of this card the zone holds
    pub quantity: i32,
    /// Which zone the card sits in
    pub zone: DeckZone,
    /// Whether the copies in this slot are the foil ones
    pub foil: bool,
}

impl DeckCard {
    /// Fetch every card of a deck, in the order the slots were added
    ///
    /// Ordered by the primary key alone, which is v7 and therefore insertion
    /// order. Grouping by zone is left to the client on purpose: sorting by the
    /// `zone` column would order the groups alphabetically (Commander,
    /// Companion, Main, Maybe, Side), which is not how a decklist reads, and
    /// SQL cannot be given the gameplay order without a second definition of it
    /// living next to the enum.
    #[instrument(name = "DeckCard::get_all_in_deck", skip(tx))]
    pub async fn get_all_in_deck(
        tx: &mut Transaction,
        deck: DeckUuid,
    ) -> Result<Vec<DeckCard>, rorm::Error> {
        let cards = rorm::query(&mut *tx, DeckCardModel)
            .condition(DeckCardModel.deck.equals(deck.0))
            .order_asc(DeckCardModel.uuid)
            .all()
            .await?;
        Ok(cards.into_iter().map(DeckCard::from).collect())
    }

    /// Fetch a single card slot of a deck
    #[instrument(name = "DeckCard::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        deck: DeckUuid,
        uuid: DeckCardUuid,
    ) -> Result<Option<DeckCard>, rorm::Error> {
        let card = rorm::query(&mut *tx, DeckCardModel)
            .condition(rorm::and![
                DeckCardModel.uuid.equals(uuid.0),
                DeckCardModel.deck.equals(deck.0),
            ])
            .optional()
            .await?;
        Ok(card.map(DeckCard::from))
    }

    /// Put a card into a deck
    ///
    /// One row per slot, and no folding into an existing one: the same card can
    /// legitimately sit in two zones, and which print is sleeved is the owner's
    /// choice. Combining is the caller's decision.
    #[instrument(name = "DeckCard::add", skip(tx))]
    pub async fn add(
        tx: &mut Transaction,
        deck: DeckUuid,
        insert: DeckCardInsert,
    ) -> Result<DeckCard, rorm::Error> {
        let card = rorm::insert(&mut *tx, DeckCardModel)
            .single(&DeckCardInsertPatch {
                uuid: Uuid::now_v7(),
                deck: ForeignModelByField(deck.0),
                printing: insert.printing,
                quantity: insert.quantity,
                zone: insert.zone,
                foil: insert.foil,
            })
            .await?;
        Ok(DeckCard::from(card))
    }

    /// Change some of a slot's fields, leaving the rest alone
    ///
    /// The slot keeps its identity, which is the whole point of editing a deck
    /// card by card rather than rewriting the list: a later link back to the
    /// collection entry a card came from hangs off this uuid.
    #[instrument(name = "DeckCard::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        deck: DeckUuid,
        uuid: DeckCardUuid,
        patch: DeckCardPatch,
    ) -> Result<DeckAccess<DeckCard>, rorm::Error> {
        let builder = rorm::update(&mut *tx, DeckCardModel)
            .begin_dyn_set()
            .set_if(DeckCardModel.printing, patch.printing)
            .set_if(DeckCardModel.quantity, patch.quantity)
            .set_if(DeckCardModel.zone, patch.zone)
            .set_if(DeckCardModel.foil, patch.foil);

        let Ok(builder) = builder.finish_dyn_set() else {
            return Ok(match Self::get(&mut *tx, deck, uuid).await? {
                Some(card) => DeckAccess::Granted(card),
                None => DeckAccess::Denied,
            });
        };

        let affected = builder
            .condition(rorm::and![
                DeckCardModel.uuid.equals(uuid.0),
                DeckCardModel.deck.equals(deck.0),
            ])
            .await?;
        if affected == 0 {
            return Ok(DeckAccess::Denied);
        }

        Ok(match Self::get(&mut *tx, deck, uuid).await? {
            Some(card) => DeckAccess::Granted(card),
            None => DeckAccess::Denied,
        })
    }

    /// Take a card out of a deck
    #[instrument(name = "DeckCard::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        deck: DeckUuid,
        uuid: DeckCardUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, DeckCardModel)
            .condition(rorm::and![
                DeckCardModel.uuid.equals(uuid.0),
                DeckCardModel.deck.equals(deck.0),
            ])
            .await?;
        Ok(access(affected, ()))
    }

    /// Replace a deck's card list wholesale
    ///
    /// For importing a decklist, not for editing: every slot is deleted and
    /// written again, so the uuids change and anything hanging off them is
    /// lost. Editing goes through [`DeckCard::add`], [`DeckCard::update`] and
    /// [`DeckCard::delete`].
    ///
    /// Returns `false` if the deck does not exist.
    #[instrument(name = "DeckCard::replace_all", skip(tx, cards))]
    pub async fn replace_all(
        tx: &mut Transaction,
        deck: DeckUuid,
        cards: Vec<DeckCardInsert>,
    ) -> Result<bool, rorm::Error> {
        let exists = rorm::query(&mut *tx, DeckModel.uuid)
            .condition(DeckModel.uuid.equals(deck.0))
            .optional()
            .await?
            .is_some();
        if !exists {
            return Ok(false);
        }

        rorm::delete(&mut *tx, DeckCardModel)
            .condition(DeckCardModel.deck.equals(deck.0))
            .await?;

        Self::add_many(&mut *tx, deck, cards).await?;
        Ok(true)
    }

    /// Put a whole decklist into a deck at once
    ///
    /// What an import writes. One statement per chunk rather than one per card:
    /// a pasted decklist is a hundred rows, and a round trip each turns pasting
    /// into waiting.
    #[instrument(name = "DeckCard::add_many", skip(tx, cards))]
    pub async fn add_many(
        tx: &mut Transaction,
        deck: DeckUuid,
        cards: Vec<DeckCardInsert>,
    ) -> Result<Vec<DeckCardUuid>, rorm::Error> {
        let patches: Vec<_> = cards
            .into_iter()
            .map(|card| DeckCardInsertPatch {
                uuid: Uuid::now_v7(),
                deck: ForeignModelByField(deck.0),
                printing: card.printing,
                quantity: card.quantity,
                zone: card.zone,
                foil: card.foil,
            })
            .collect();
        let uuids = patches
            .iter()
            .map(|patch| DeckCardUuid(patch.uuid))
            .collect();

        for chunk in patches.chunks(BULK_INSERT_CHUNK) {
            rorm::insert(&mut *tx, DeckCardModel).bulk(chunk).await?;
        }

        Ok(uuids)
    }

    /// Repoint every deck card of a merged Scryfall printing at its replacement
    ///
    /// See [`crate::models::collection::CollectionEntry::apply_printing_merge`].
    #[instrument(name = "DeckCard::apply_printing_merge", skip(tx))]
    pub async fn apply_printing_merge(
        tx: &mut Transaction,
        old_printing: Uuid,
        new_printing: Uuid,
    ) -> Result<u64, rorm::Error> {
        rorm::update(&mut *tx, DeckCardModel)
            .set(DeckCardModel.printing, new_printing)
            .condition(DeckCardModel.printing.equals(old_printing))
            .await
    }
}

impl From<DeckCardModel> for DeckCard {
    fn from(value: DeckCardModel) -> Self {
        Self {
            uuid: DeckCardUuid(value.uuid),
            deck: DeckUuid::new_from_field(value.deck),
            printing: value.printing,
            quantity: value.quantity,
            zone: value.zone,
            foil: value.foil,
        }
    }
}
