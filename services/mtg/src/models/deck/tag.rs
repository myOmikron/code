//! Etiquettes put on a deck's cards
//!
//! What a deck is grouped by besides card type: Ramp, Removal, Draw. A tag
//! belongs to an account; whether it is offered on one deck or on all of them
//! is decided by [`DeckTag::deck`].

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::db::DeckCardModel;
use crate::models::deck::db::DeckCardTagInsertPatch;
use crate::models::deck::db::DeckCardTagModel;
use crate::models::deck::db::DeckTagInsertPatch;
use crate::models::deck::db::DeckTagModel;

/// An etiquette put on a deck's cards
#[derive(Debug, Clone)]
pub struct DeckTag {
    /// Primary key
    pub uuid: DeckTagUuid,
    /// The account whose tag this is
    pub owner: AccountUuid,
    /// The deck it is local to, `None` for one offered on every deck
    pub deck: Option<DeckUuid>,
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
    /// The point in time the tag was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`DeckTag`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct DeckTagUuid(Uuid);

impl DeckTagUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Wrap a uuid read back from a hand-written query
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// Data for creating a new [`DeckTag`]
#[derive(Debug, Clone)]
pub struct DeckTagInsert {
    /// The deck it is local to, `None` for one offered on every deck
    pub deck: Option<DeckUuid>,
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
}

impl DeckTag {
    /// Every tag an account can put on a card of this deck
    ///
    /// Its own, plus the ones it keeps for every deck. Filtered in memory
    /// rather than in the statement: an account has a handful of tags, and a
    /// nullable foreign key makes for a condition nobody enjoys reading.
    #[instrument(name = "DeckTag::get_usable", skip(tx))]
    pub async fn get_usable(
        tx: &mut Transaction,
        owner: AccountUuid,
        deck: DeckUuid,
    ) -> Result<Vec<DeckTag>, rorm::Error> {
        let tags = rorm::query(&mut *tx, DeckTagModel)
            .condition(DeckTagModel.owner.equals(owner.into_inner()))
            .order_asc(DeckTagModel.name)
            .order_asc(DeckTagModel.uuid)
            .all()
            .await?;

        Ok(tags
            .into_iter()
            .map(DeckTag::from)
            .filter(|tag| tag.deck.is_none() || tag.deck == Some(deck))
            .collect())
    }

    /// Create a tag
    #[instrument(name = "DeckTag::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: DeckTagInsert,
    ) -> Result<DeckTag, rorm::Error> {
        let tag = rorm::insert(&mut *tx, DeckTagModel)
            .single(&DeckTagInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                deck: insert
                    .deck
                    .map(|deck| ForeignModelByField(deck.into_inner())),
                name: insert.name,
                color: insert.color,
                icon: insert.icon,
            })
            .await?;
        Ok(DeckTag::from(tag))
    }

    /// Rename a tag, recolour it or move it between the decks it is offered on
    ///
    /// The scope is part of an edit rather than fixed at creation: a tag that
    /// turns out to be useful everywhere should not have to be made again on
    /// every deck.
    #[instrument(name = "DeckTag::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckTagUuid,
        deck: Option<DeckUuid>,
        name: MaxStr<64>,
        color: MaxStr<16>,
        icon: MaxStr<32>,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckTagModel)
            .set(
                DeckTagModel.deck,
                deck.map(|deck| ForeignModelByField(deck.into_inner())),
            )
            .set(DeckTagModel.name, name)
            .set(DeckTagModel.color, color)
            .set(DeckTagModel.icon, icon)
            .condition(rorm::and![
                DeckTagModel.uuid.equals(uuid.0),
                DeckTagModel.owner.equals(owner.into_inner()),
            ])
            .await?;
        Ok(granted(affected))
    }

    /// Delete a tag, taking it off every card it sat on
    #[instrument(name = "DeckTag::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckTagUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, DeckTagModel)
            .condition(rorm::and![
                DeckTagModel.uuid.equals(uuid.0),
                DeckTagModel.owner.equals(owner.into_inner()),
            ])
            .await?;
        Ok(granted(affected))
    }

    /// Put a tag on a card of a deck
    ///
    /// Both halves are checked against the deck and the account, so a tag from
    /// somebody else's deck cannot be stuck onto this one. Putting a tag on
    /// twice is not an error and changes nothing.
    #[instrument(name = "DeckTag::assign", skip(tx))]
    pub async fn assign(
        tx: &mut Transaction,
        owner: AccountUuid,
        deck: DeckUuid,
        card: DeckCardUuid,
        tag: DeckTagUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        if !usable_on(&mut *tx, owner, deck, card, tag).await? {
            return Ok(DeckAccess::Denied);
        }

        let existing = rorm::query(&mut *tx, DeckCardTagModel.uuid)
            .condition(rorm::and![
                DeckCardTagModel.deck_card.equals(card.into_inner()),
                DeckCardTagModel.tag.equals(tag.0),
            ])
            .optional()
            .await?;
        if existing.is_some() {
            return Ok(DeckAccess::Granted(()));
        }

        rorm::insert(&mut *tx, DeckCardTagModel)
            .single(&DeckCardTagInsertPatch {
                uuid: Uuid::now_v7(),
                deck_card: ForeignModelByField(card.into_inner()),
                tag: ForeignModelByField(tag.0),
            })
            .await?;
        Ok(DeckAccess::Granted(()))
    }

    /// Take a tag off a card
    #[instrument(name = "DeckTag::unassign", skip(tx))]
    pub async fn unassign(
        tx: &mut Transaction,
        owner: AccountUuid,
        deck: DeckUuid,
        card: DeckCardUuid,
        tag: DeckTagUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        if !usable_on(&mut *tx, owner, deck, card, tag).await? {
            return Ok(DeckAccess::Denied);
        }

        let affected = rorm::delete(&mut *tx, DeckCardTagModel)
            .condition(rorm::and![
                DeckCardTagModel.deck_card.equals(card.into_inner()),
                DeckCardTagModel.tag.equals(tag.0),
            ])
            .await?;
        Ok(granted(affected))
    }
}

impl From<DeckTagModel> for DeckTag {
    fn from(value: DeckTagModel) -> Self {
        Self {
            uuid: DeckTagUuid(value.uuid),
            owner: AccountUuid::new_from_field(value.owner),
            deck: value.deck.map(DeckUuid::new_from_field),
            name: value.name,
            color: value.color,
            icon: value.icon,
            created_at: value.created_at,
        }
    }
}

/// Whether this card and this tag both belong where the caller says they do
async fn usable_on(
    tx: &mut Transaction,
    owner: AccountUuid,
    deck: DeckUuid,
    card: DeckCardUuid,
    tag: DeckTagUuid,
) -> Result<bool, rorm::Error> {
    let card_in_deck = rorm::query(&mut *tx, DeckCardModel.uuid)
        .condition(rorm::and![
            DeckCardModel.uuid.equals(card.into_inner()),
            DeckCardModel.deck.equals(deck.into_inner()),
        ])
        .optional()
        .await?
        .is_some();
    if !card_in_deck {
        return Ok(false);
    }

    let tag = rorm::query(&mut *tx, DeckTagModel)
        .condition(rorm::and![
            DeckTagModel.uuid.equals(tag.0),
            DeckTagModel.owner.equals(owner.into_inner()),
        ])
        .optional()
        .await?;
    Ok(match tag.map(DeckTag::from) {
        Some(tag) => tag.deck.is_none() || tag.deck == Some(deck),
        None => false,
    })
}

/// Turn a statement's affected-row count into a [`DeckAccess`]
fn granted(affected: u64) -> DeckAccess {
    if affected > 0 {
        DeckAccess::Granted(())
    } else {
        DeckAccess::Denied
    }
}
