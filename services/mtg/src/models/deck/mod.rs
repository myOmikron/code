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
use crate::models::visibility::Visibility;

pub(in crate::models) mod db;

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

impl Deck {
    /// Fetch every deck an account owns
    #[instrument(name = "Deck::get_all_for_account", skip(tx))]
    pub async fn get_all_for_account(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<Deck>, rorm::Error> {
        let decks = rorm::query(&mut *tx, DeckModel)
            .condition(DeckModel.owner.equals(account.into_inner()))
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

    /// Create a new, empty deck
    #[instrument(name = "Deck::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: DeckInsert,
    ) -> Result<DeckUuid, rorm::Error> {
        let uuid = rorm::insert(&mut *tx, DeckModel)
            .return_primary_key()
            .single(&DeckInsertPatch {
                uuid: Uuid::now_v7(),
                name: insert.name,
                description: insert.description,
                owner: ForeignModelByField(owner.into_inner()),
                format: insert.format,
                visibility: insert.visibility,
            })
            .await?;
        Ok(DeckUuid(uuid))
    }

    /// Update a deck's metadata
    ///
    /// Changing the format is allowed even when it makes the deck illegal —
    /// the frontend reports violations, it does not prevent the edit.
    ///
    /// Returns `false` if the deck does not exist.
    #[instrument(name = "Deck::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        uuid: DeckUuid,
        name: MaxStr<255>,
        description: Option<MaxStr<1024>>,
        format: MaxStr<32>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.name, name)
            .set(DeckModel.description, description)
            .set(DeckModel.format, format)
            .condition(DeckModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Set a deck's visibility
    ///
    /// Returns `false` if the deck does not exist.
    #[instrument(name = "Deck::set_visibility", skip(tx))]
    pub async fn set_visibility(
        tx: &mut Transaction,
        uuid: DeckUuid,
        visibility: Visibility,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.visibility, visibility)
            .condition(DeckModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Delete a deck and, through the cascade, all its cards
    ///
    /// Returns `false` if the deck does not exist.
    #[instrument(name = "Deck::delete", skip(tx))]
    pub async fn delete(tx: &mut Transaction, uuid: DeckUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(&mut *tx, DeckModel)
            .condition(DeckModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
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
}

impl DeckCard {
    /// Fetch every card of a deck
    #[instrument(name = "DeckCard::get_all_in_deck", skip(tx))]
    pub async fn get_all_in_deck(
        tx: &mut Transaction,
        deck: DeckUuid,
    ) -> Result<Vec<DeckCard>, rorm::Error> {
        let cards = rorm::query(&mut *tx, DeckCardModel)
            .condition(DeckCardModel.deck.equals(deck.0))
            .all()
            .await?;
        Ok(cards.into_iter().map(DeckCard::from).collect())
    }

    /// Replace a deck's card list wholesale
    ///
    /// Deck editing is a document edit, not a stream of row operations: the
    /// client sends the list it wants, the server makes the table match.
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

        for card in cards {
            rorm::insert(&mut *tx, DeckCardModel)
                .single(&DeckCardInsertPatch {
                    uuid: Uuid::now_v7(),
                    deck: ForeignModelByField(deck.0),
                    printing: card.printing,
                    quantity: card.quantity,
                    zone: card.zone,
                })
                .await?;
        }
        Ok(true)
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
        }
    }
}
