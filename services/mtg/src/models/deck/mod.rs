//! Decks, their card slots and the zones those sit in
//!
//! Deck *legality* is deliberately absent from this module. Banlists change
//! monthly and Standard rotates, so a stored verdict is a lie waiting to
//! happen. The database keeps cards and a format slug; whether that adds up to
//! a legal deck is computed against the current card catalog, which lives in
//! the client.

use std::str::FromStr;

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
use crate::models::collection::Collection;
use crate::models::collection::CollectionInsert;
use crate::models::collection::db::CollectionEntryModel;
use crate::models::collection::db::CollectionModel;
use crate::models::deck::db::DeckCardInsertPatch;
use crate::models::deck::db::DeckCardModel;
use crate::models::deck::db::DeckInsertPatch;
use crate::models::deck::db::DeckModel;
use crate::models::deck::db::GlobalCardTagModel;
use crate::models::deck::folder::DeckFolder;
use crate::models::deck::folder::DeckFolderUuid;
use crate::models::deck::tag::DeckTag;
use crate::models::format::has_brackets;
use crate::models::share::generate_share_token;
use crate::models::visibility::Visibility;

pub mod advisor;
pub(in crate::models) mod db;
pub mod discovery;
pub mod drift;
pub mod folder;
pub mod listing;
pub mod sourcing;
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

/// Outcome of taking a deck's collection away again
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DetachOutcome {
    /// The deck keeps no collection any more
    Detached,
    /// Cards are still filed in it; they have to be sorted back first
    NotEmpty,
    /// The deck is gone, or it is not this account's to touch
    Denied,
}

/// The colour a deck's own collection is drawn in
///
/// One colour for all of them: on the shelf they stand apart from the collections
/// anyway, and a deck that picked its own would only compete with them.
const DECK_COLLECTION_COLOR: &str = "indigo";

/// The pictogram a deck's own collection wears
const DECK_COLLECTION_ICON: &str = "deckbox";

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

    /// Whether the table agreed to more commanders than the format allows
    pub allow_extra_commanders: bool,

    /// Whether the table agreed to more copies of a card than the format allows
    pub allow_duplicates: bool,

    /// Whether the table agreed to cards the format bans
    pub allow_banned: bool,

    /// How many cards the deck is built to, `None` for the format's rule
    ///
    /// The commanders count toward it, the way [`DeckSize`] counts them.
    ///
    /// [`DeckSize`]: crate::models::format::DeckSize
    pub deck_size: Option<i16>,

    /// The folder the deck is filed in, `None` while it is on no shelf
    pub folder: Option<DeckFolderUuid>,

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

/// Reads a deck's id out of text, which is what a link to one holds
impl FromStr for DeckUuid {
    type Err = uuid::Error;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Ok(Self(Uuid::parse_str(value)?))
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
                // A new deck is played by the format's rules until a table says
                // otherwise.
                allow_extra_commanders: false,
                allow_duplicates: false,
                allow_banned: false,
                deck_size: None,
                // A new deck stands on no shelf. Filing it is a decision about
                // a deck that already exists, and asking for one up front would
                // be a question in front of every new deck.
                folder: None,
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
        let brackets = has_brackets(&format);
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.name, name)
            .set(DeckModel.description, description)
            .set(DeckModel.format, format)
            .condition(owned_by(uuid, owner))
            .await?;

        // A deck moved to a format without brackets drops the claim it made in
        // the one it came from: the picker is gone from that page, so a claim
        // left behind is one nobody can take back off — and it would still be
        // read out on the deck's public tile.
        if affected > 0 && !brackets {
            rorm::update(&mut *tx, DeckModel)
                .set(DeckModel.bracket, None)
                .condition(owned_by(uuid, owner))
                .await?;
        }

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

    /// Record the house rules the deck is played under
    ///
    /// All four at once: they are one agreement, edited as one. `deck_size` of
    /// `None` hands the count back to the format. Nothing is checked here
    /// either — what a table agreed to is not the service's to second-guess.
    #[instrument(name = "Deck::set_rule_zero", skip(tx))]
    pub async fn set_rule_zero(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
        allow_extra_commanders: bool,
        allow_duplicates: bool,
        allow_banned: bool,
        deck_size: Option<i16>,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.allow_extra_commanders, allow_extra_commanders)
            .set(DeckModel.allow_duplicates, allow_duplicates)
            .set(DeckModel.allow_banned, allow_banned)
            .set(DeckModel.deck_size, deck_size)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// The collection that stands for this deck, `None` while it keeps none
    #[instrument(name = "Deck::collection", skip(tx))]
    pub async fn collection(
        tx: &mut Transaction,
        uuid: DeckUuid,
    ) -> Result<Option<Collection>, rorm::Error> {
        let collection = rorm::query(&mut *tx, CollectionModel)
            .condition(CollectionModel.deck.equals(Some(uuid.into_inner())))
            .optional()
            .await?;
        Ok(collection.map(Collection::from))
    }

    /// Start keeping the cards that are physically in this deck
    ///
    /// The deck gets a collection of its own, which is where cards taken out of
    /// a collection live while they are sleeved up. Idempotent: a deck that already
    /// keeps one gets that one back, so switching this on twice is harmless.
    #[instrument(name = "Deck::attach_collection", skip(tx))]
    pub async fn attach_collection(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
    ) -> Result<DeckAccess<Collection>, rorm::Error> {
        let deck = rorm::query(&mut *tx, DeckModel)
            .condition(owned_by(uuid, owner))
            .optional()
            .await?;
        let Some(deck) = deck else {
            return Ok(DeckAccess::Denied);
        };

        if let Some(existing) = Self::collection(&mut *tx, uuid).await? {
            return Ok(DeckAccess::Granted(existing));
        }

        let collection = Collection::create(
            &mut *tx,
            owner,
            CollectionInsert {
                name: deck.name,
                description: MaxStr::new(String::new())
                    .unwrap_or_else(|_| unreachable!("the empty string fits everywhere")),
                color: MaxStr::new(DECK_COLLECTION_COLOR.to_owned())
                    .unwrap_or_else(|_| unreachable!("{DECK_COLLECTION_COLOR} is below 16")),
                icon: MaxStr::new(DECK_COLLECTION_ICON.to_owned())
                    .unwrap_or_else(|_| unreachable!("{DECK_COLLECTION_ICON} is below 32")),
                deck: Some(uuid),
                // Never shared: what is shared about a deck is its list, and
                // that has a link of its own.
                visibility: Visibility::Private,
            },
        )
        .await?;

        Ok(DeckAccess::Granted(collection))
    }

    /// Stop keeping them
    ///
    /// Only while the collection is empty. Dropping it with cards still in it
    /// would take them out of the account's inventory without anybody saying
    /// where they went, so they have to be sorted back first.
    #[instrument(name = "Deck::detach_collection", skip(tx))]
    pub async fn detach_collection(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
    ) -> Result<DetachOutcome, rorm::Error> {
        if !Self::may_administer(&mut *tx, uuid, owner)
            .await?
            .is_granted()
        {
            return Ok(DetachOutcome::Denied);
        }
        let Some(collection) = Self::collection(&mut *tx, uuid).await? else {
            return Ok(DetachOutcome::Detached);
        };

        let filed = rorm::query(&mut *tx, CollectionEntryModel.uuid)
            .condition(
                CollectionEntryModel
                    .collection
                    .equals(collection.uuid.into_inner()),
            )
            .optional()
            .await?;
        if filed.is_some() {
            return Ok(DetachOutcome::NotEmpty);
        }

        rorm::delete(&mut *tx, CollectionModel)
            .condition(CollectionModel.uuid.equals(collection.uuid.into_inner()))
            .await?;
        Ok(DetachOutcome::Detached)
    }

    /// File a deck into one of the account's folders, or onto no shelf at all
    ///
    /// Filing is about the list of decks staying readable, the archive
    /// included. Everything the deck holds stays where it is, its collection
    /// included: a deck put away is still a deck with cards in it.
    ///
    /// The folder is checked against the same account, so a deck cannot be
    /// filed onto somebody else's shelf.
    #[instrument(name = "Deck::set_folder", skip(tx))]
    pub async fn set_folder(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckUuid,
        folder: Option<DeckFolderUuid>,
    ) -> Result<DeckAccess, rorm::Error> {
        if let Some(folder) = folder
            && !DeckFolder::belongs_to(&mut *tx, owner, folder).await?
        {
            return Ok(DeckAccess::Denied);
        }

        let affected = rorm::update(&mut *tx, DeckModel)
            .set(
                DeckModel.folder,
                folder.map(|folder| ForeignModelByField(folder.into_inner())),
            )
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

    /// Hand an account's public decks over to another owner
    ///
    /// What keeps a decklist readable after the account that built it is gone.
    /// Only the decks at [`Visibility::Public`] move: an unlisted or private
    /// deck was never anybody else's to read, so it leaves with its owner.
    ///
    /// They land unfiled, since a folder belongs to the account going away and
    /// the cascade is about to take it. Returns how many decks moved.
    #[instrument(name = "Deck::hand_over_public", skip(tx))]
    pub async fn hand_over_public(
        tx: &mut Transaction,
        owner: AccountUuid,
        new_owner: AccountUuid,
    ) -> Result<u64, rorm::Error> {
        rorm::update(&mut *tx, DeckModel)
            .set(DeckModel.owner, ForeignModelByField(new_owner.into_inner()))
            .set(DeckModel.folder, None)
            .condition(rorm::and![
                DeckModel.owner.equals(owner.into_inner()),
                DeckModel.visibility.equals(Visibility::Public),
            ])
            .await
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
            allow_extra_commanders: value.allow_extra_commanders,
            allow_duplicates: value.allow_duplicates,
            allow_banned: value.allow_banned,
            deck_size: value.deck_size,
            folder: value.folder.map(DeckFolderUuid::new_from_field),
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
    /// Whether the copies in this slot are stand-ins rather than the real cards
    pub proxy: bool,
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
    /// Whether the copies in this slot are stand-ins rather than the real cards
    pub proxy: Option<bool>,
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
    /// Whether the copies in this slot are stand-ins rather than the real cards
    pub proxy: bool,
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
                proxy: insert.proxy,
            })
            .await?;
        Ok(DeckCard::from(card))
    }

    /// Put a card into a deck, folding it into the slot that already holds it
    ///
    /// Two rows of the same card in the same zone is never what was meant, so
    /// when the deck already holds a slot with this printing, zone, finish and
    /// proxy status, the copies raise that slot's count instead of opening
    /// another row beside it. Only an exact match folds — which print is
    /// sleeved is the owner's choice, and a different edition, finish or proxy
    /// status stays its own slot; a real add must not silently launder into a
    /// slot of stand-ins, or the other way around.
    ///
    /// A deck that already holds duplicates (from before folding existed)
    /// folds into the oldest of them; the others are left alone.
    #[instrument(name = "DeckCard::add_folded", skip(tx))]
    pub async fn add_folded(
        tx: &mut Transaction,
        deck: DeckUuid,
        insert: DeckCardInsert,
    ) -> Result<DeckCard, rorm::Error> {
        let existing = rorm::query(&mut *tx, DeckCardModel)
            .condition(rorm::and![
                DeckCardModel.deck.equals(deck.0),
                DeckCardModel.printing.equals(insert.printing),
                DeckCardModel.zone.equals(insert.zone),
                DeckCardModel.foil.equals(insert.foil),
                DeckCardModel.proxy.equals(insert.proxy),
            ])
            .order_asc(DeckCardModel.uuid)
            .all()
            .await?
            .into_iter()
            .next()
            .map(DeckCard::from);

        if let Some(slot) = existing {
            let updated = Self::update(
                &mut *tx,
                deck,
                slot.uuid,
                DeckCardPatch {
                    quantity: Some(slot.quantity + insert.quantity),
                    ..Default::default()
                },
            )
            .await?;
            if let DeckAccess::Granted(card) = updated {
                return Ok(card);
            }
        }

        Self::add(tx, deck, insert).await
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
            .set_if(DeckCardModel.foil, patch.foil)
            .set_if(DeckCardModel.proxy, patch.proxy);

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

    /// Point a slot at the printing that is really sleeved up in it
    ///
    /// Sourcing a card in another edition than the list names makes the list
    /// wrong, so the list follows: the slot takes the printing that arrived.
    /// When only part of the slot was covered, it is split, because two editions
    /// of a card are two piles of cardboard and one row cannot honestly stand
    /// for both. The new row inherits the old one's tags — they say what the
    /// card is for in this deck, which a different artwork does not change.
    ///
    /// Filing real cardboard also clears a proxy flag — this is how "I found a
    /// copy" turns a stand-in back into the genuine article, covered or split
    /// the same way as a printing change. A slot already pointed at this exact
    /// printing and finish still needs to run through when it is proxied, so a
    /// proxy of the very printing later acquired clears too.
    ///
    /// Does nothing when the slot already says what arrived and is not proxied.
    #[instrument(name = "DeckCard::point_at", skip(tx))]
    pub async fn point_at(
        tx: &mut Transaction,
        deck: DeckUuid,
        uuid: DeckCardUuid,
        printing: Uuid,
        foil: bool,
        quantity: i32,
    ) -> Result<DeckAccess<DeckCard>, rorm::Error> {
        let Some(slot) = Self::get(&mut *tx, deck, uuid).await? else {
            return Ok(DeckAccess::Denied);
        };
        if slot.printing == printing && slot.foil == foil && !slot.proxy {
            return Ok(DeckAccess::Granted(slot));
        }

        if quantity >= slot.quantity {
            return Self::update(
                &mut *tx,
                deck,
                uuid,
                DeckCardPatch {
                    printing: Some(printing),
                    foil: Some(foil),
                    proxy: Some(false),
                    ..Default::default()
                },
            )
            .await;
        }

        Self::update(
            &mut *tx,
            deck,
            uuid,
            DeckCardPatch {
                quantity: Some(slot.quantity - quantity),
                ..Default::default()
            },
        )
        .await?;

        let created = Self::add(
            &mut *tx,
            deck,
            DeckCardInsert {
                printing,
                quantity,
                zone: slot.zone,
                foil,
                proxy: false,
            },
        )
        .await?;
        DeckTag::copy_assignments(&mut *tx, uuid, created.uuid).await?;

        Ok(DeckAccess::Granted(created))
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
    /// lost. Editing goes through [`DeckCard::add_folded`], [`DeckCard::update`]
    /// and [`DeckCard::delete`].
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
                proxy: card.proxy,
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
        let affected = rorm::update(&mut *tx, DeckCardModel)
            .set(DeckCardModel.printing, new_printing)
            .condition(DeckCardModel.printing.equals(old_printing))
            .await?;
        rorm::update(&mut *tx, GlobalCardTagModel)
            .set(GlobalCardTagModel.printing, new_printing)
            .condition(GlobalCardTagModel.printing.equals(old_printing))
            .await?;
        Ok(affected)
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
            proxy: value.proxy,
        }
    }
}
