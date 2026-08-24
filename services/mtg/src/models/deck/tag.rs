//! Etiquettes put on a deck's cards
//!
//! What a deck is grouped by besides card type: Ramp, Removal, Draw. A tag
//! belongs to an account; [`DeckTag::deck`] decides whether its assignments are
//! local slots or card-wide across every deck of that account.

use std::collections::HashSet;

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
use crate::models::deck::DeckCard;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::db::DeckCardModel;
use crate::models::deck::db::DeckCardTagInsertPatch;
use crate::models::deck::db::DeckCardTagModel;
use crate::models::deck::db::DeckTagInsertPatch;
use crate::models::deck::db::DeckTagModel;
use crate::models::deck::db::GlobalCardTagInsertPatch;
use crate::models::deck::db::GlobalCardTagModel;
use crate::models::printing::db::PrintingModel;

/// An etiquette put on a deck's cards
#[derive(Debug, Clone)]
pub struct DeckTag {
    /// Primary key
    pub uuid: DeckTagUuid,
    /// The account whose tag this is
    pub owner: AccountUuid,
    /// The deck it is local to, `None` for card-wide use on every deck
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
    /// The deck it is local to, `None` for card-wide use on every deck
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

    /// Every card-wide tag an account keeps
    ///
    /// The ones that are not tied to a deck, which are the only ones a
    /// collection can put on a card: a stack on a shelf is not in any deck, so
    /// a tag local to one has nothing to say about it.
    #[instrument(name = "DeckTag::get_global", skip(tx))]
    pub async fn get_global(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<DeckTag>, rorm::Error> {
        let tags = rorm::query(&mut *tx, DeckTagModel)
            .condition(rorm::and![
                DeckTagModel.owner.equals(owner.into_inner()),
                DeckTagModel.deck.equals(None::<Uuid>),
            ])
            .order_asc(DeckTagModel.name)
            .order_asc(DeckTagModel.uuid)
            .all()
            .await?;
        Ok(tags.into_iter().map(DeckTag::from).collect())
    }

    /// Put a card-wide tag on the card a printing stands for
    ///
    /// For everything outside a deck, a collection's stacks above all. Refuses
    /// a tag that is not the account's, and one that is local to a deck: that
    /// one only means something inside it. Putting a tag on twice is not an
    /// error and changes nothing.
    #[instrument(name = "DeckTag::assign_to_card", skip(tx))]
    pub async fn assign_to_card(
        tx: &mut Transaction,
        owner: AccountUuid,
        tag: DeckTagUuid,
        printing: Uuid,
    ) -> Result<DeckAccess, rorm::Error> {
        if !is_global_tag_of(&mut *tx, owner, tag).await? {
            return Ok(DeckAccess::Denied);
        }
        assign_global(&mut *tx, tag, printing).await?;
        Ok(DeckAccess::Granted(()))
    }

    /// Take a card-wide tag off the card a printing stands for
    ///
    /// Taking off what was not on is not an error, see
    /// [`DeckTag::assign_to_card`].
    #[instrument(name = "DeckTag::unassign_from_card", skip(tx))]
    pub async fn unassign_from_card(
        tx: &mut Transaction,
        owner: AccountUuid,
        tag: DeckTagUuid,
        printing: Uuid,
    ) -> Result<DeckAccess, rorm::Error> {
        if !is_global_tag_of(&mut *tx, owner, tag).await? {
            return Ok(DeckAccess::Denied);
        }
        unassign_global(&mut *tx, tag, printing).await?;
        Ok(DeckAccess::Granted(()))
    }

    /// Rename a card-wide tag or change its marker
    ///
    /// Stays card-wide: moving a tag into a deck is a decision made in that
    /// deck's tag manager, where the consequence, every assignment turning
    /// local, is in front of the person making it. A tag that is not the
    /// account's card-wide one is refused.
    #[instrument(name = "DeckTag::update_global", skip(tx))]
    pub async fn update_global(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckTagUuid,
        name: MaxStr<64>,
        color: MaxStr<16>,
        icon: MaxStr<32>,
    ) -> Result<DeckAccess, rorm::Error> {
        if !is_global_tag_of(&mut *tx, owner, uuid).await? {
            return Ok(DeckAccess::Denied);
        }
        Self::update(&mut *tx, owner, uuid, None, name, color, icon).await
    }

    /// Throw a card-wide tag away, taking it off every card it sat on
    ///
    /// Refuses a tag local to a deck, see [`DeckTag::update_global`].
    #[instrument(name = "DeckTag::delete_global", skip(tx))]
    pub async fn delete_global(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckTagUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        if !is_global_tag_of(&mut *tx, owner, uuid).await? {
            return Ok(DeckAccess::Denied);
        }
        Self::delete(&mut *tx, owner, uuid).await
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
        let existing = rorm::query(&mut *tx, DeckTagModel)
            .condition(rorm::and![
                DeckTagModel.uuid.equals(uuid.0),
                DeckTagModel.owner.equals(owner.into_inner()),
            ])
            .optional()
            .await?;
        let Some(existing) = existing.map(DeckTag::from) else {
            return Ok(DeckAccess::Denied);
        };

        if existing.deck != deck {
            match (existing.deck, deck) {
                (Some(_), None) => local_to_global(&mut *tx, uuid).await?,
                (None, Some(target)) => global_to_local(&mut *tx, uuid, target).await?,
                (Some(_), Some(target)) => {
                    local_to_global(&mut *tx, uuid).await?;
                    global_to_local(&mut *tx, uuid, target).await?;
                }
                (None, None) => {}
            }
        }

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
    /// somebody else's deck cannot be stuck onto this one. Global tags follow
    /// the card's oracle identity across printings and decks. Putting a tag on
    /// twice is not an error and changes nothing.
    #[instrument(name = "DeckTag::assign", skip(tx))]
    pub async fn assign(
        tx: &mut Transaction,
        owner: AccountUuid,
        deck: DeckUuid,
        card: DeckCardUuid,
        tag: DeckTagUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        let Some((definition, printing)) =
            assignment_target(&mut *tx, owner, deck, card, tag).await?
        else {
            return Ok(DeckAccess::Denied);
        };

        if definition.deck.is_none() {
            assign_global(&mut *tx, tag, printing).await?;
            return Ok(DeckAccess::Granted(()));
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

    /// Put every tag of one slot onto another
    ///
    /// Used when a slot is split because part of it is sleeved up in a different
    /// printing: what the card is for in this deck did not change with its
    /// artwork. Only the deck's own assignments are copied; a card-wide tag
    /// finds the new slot by itself, through the printing.
    #[instrument(name = "DeckTag::copy_assignments", skip(tx))]
    pub async fn copy_assignments(
        tx: &mut Transaction,
        from: DeckCardUuid,
        onto: DeckCardUuid,
    ) -> Result<(), rorm::Error> {
        let assignments = rorm::query(&mut *tx, DeckCardTagModel)
            .condition(DeckCardTagModel.deck_card.equals(from.into_inner()))
            .all()
            .await?;

        for assignment in assignments {
            rorm::insert(&mut *tx, DeckCardTagModel)
                .single(&DeckCardTagInsertPatch {
                    uuid: Uuid::now_v7(),
                    deck_card: ForeignModelByField(onto.into_inner()),
                    tag: assignment.tag,
                })
                .await?;
        }
        Ok(())
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
        let Some((definition, printing)) =
            assignment_target(&mut *tx, owner, deck, card, tag).await?
        else {
            return Ok(DeckAccess::Denied);
        };

        if definition.deck.is_none() {
            return Ok(granted(unassign_global(&mut *tx, tag, printing).await?));
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

/// Validate an assignment and return its tag definition plus printing
async fn assignment_target(
    tx: &mut Transaction,
    owner: AccountUuid,
    deck: DeckUuid,
    card: DeckCardUuid,
    tag: DeckTagUuid,
) -> Result<Option<(DeckTag, Uuid)>, rorm::Error> {
    let card = rorm::query(&mut *tx, DeckCardModel)
        .condition(rorm::and![
            DeckCardModel.uuid.equals(card.into_inner()),
            DeckCardModel.deck.equals(deck.into_inner()),
        ])
        .optional()
        .await?;
    let Some(card) = card else {
        return Ok(None);
    };

    let tag = rorm::query(&mut *tx, DeckTagModel)
        .condition(rorm::and![
            DeckTagModel.uuid.equals(tag.0),
            DeckTagModel.owner.equals(owner.into_inner()),
        ])
        .optional()
        .await?;
    let Some(tag) = tag.map(DeckTag::from) else {
        return Ok(None);
    };
    if tag.deck.is_some() && tag.deck != Some(deck) {
        return Ok(None);
    }
    Ok(Some((tag, card.printing)))
}

/// Resolve a printing to the identity shared by all its artworks and languages
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
enum CardIdentity {
    Oracle(Uuid),
    Name(String),
    Printing(Uuid),
}

async fn printing_identity(
    tx: &mut Transaction,
    printing: Uuid,
) -> Result<CardIdentity, rorm::Error> {
    let catalog = rorm::query(&mut *tx, (PrintingModel.oracle_id, PrintingModel.name_sort))
        .condition(PrintingModel.id.equals(printing))
        .optional()
        .await?;
    Ok(match catalog {
        Some((oracle_id, name_sort)) => match oracle_id {
            Some(oracle_id) => CardIdentity::Oracle(oracle_id),
            None => CardIdentity::Name(name_sort.to_string()),
        },
        None => CardIdentity::Printing(printing),
    })
}

/// Whether a tag is the account's and kept for every deck
async fn is_global_tag_of(
    tx: &mut Transaction,
    owner: AccountUuid,
    tag: DeckTagUuid,
) -> Result<bool, rorm::Error> {
    let definition = rorm::query(&mut *tx, DeckTagModel)
        .condition(rorm::and![
            DeckTagModel.uuid.equals(tag.0),
            DeckTagModel.owner.equals(owner.into_inner()),
            DeckTagModel.deck.equals(None::<Uuid>),
        ])
        .optional()
        .await?;
    Ok(definition.is_some())
}

/// Attach a global tag once per resolved card identity
async fn assign_global(
    tx: &mut Transaction,
    tag: DeckTagUuid,
    printing: Uuid,
) -> Result<(), rorm::Error> {
    let identity = printing_identity(&mut *tx, printing).await?;
    let assignments = rorm::query(&mut *tx, GlobalCardTagModel)
        .condition(GlobalCardTagModel.tag.equals(tag.0))
        .all()
        .await?;
    for assignment in assignments {
        if printing_identity(&mut *tx, assignment.printing).await? == identity {
            return Ok(());
        }
    }

    rorm::insert(&mut *tx, GlobalCardTagModel)
        .single(&GlobalCardTagInsertPatch {
            uuid: Uuid::now_v7(),
            tag: ForeignModelByField(tag.0),
            printing,
        })
        .await?;
    Ok(())
}

/// Remove every anchor which currently resolves to the card's identity
async fn unassign_global(
    tx: &mut Transaction,
    tag: DeckTagUuid,
    printing: Uuid,
) -> Result<u64, rorm::Error> {
    let identity = printing_identity(&mut *tx, printing).await?;
    let assignments = rorm::query(&mut *tx, GlobalCardTagModel)
        .condition(GlobalCardTagModel.tag.equals(tag.0))
        .all()
        .await?;
    let mut affected = 0;
    for assignment in assignments {
        if printing_identity(&mut *tx, assignment.printing).await? == identity {
            affected += rorm::delete(&mut *tx, GlobalCardTagModel)
                .condition(GlobalCardTagModel.uuid.equals(assignment.uuid))
                .await?;
        }
    }
    Ok(affected)
}

/// Promote every local assignment to its card-wide global equivalent
async fn local_to_global(tx: &mut Transaction, tag: DeckTagUuid) -> Result<(), rorm::Error> {
    let assignments = rorm::query(&mut *tx, DeckCardTagModel)
        .condition(DeckCardTagModel.tag.equals(tag.0))
        .all()
        .await?;
    for assignment in assignments {
        let card = rorm::query(&mut *tx, DeckCardModel)
            .condition(DeckCardModel.uuid.equals(assignment.deck_card.0))
            .optional()
            .await?;
        if let Some(card) = card {
            assign_global(&mut *tx, tag, card.printing).await?;
        }
    }
    rorm::delete(&mut *tx, DeckCardTagModel)
        .condition(DeckCardTagModel.tag.equals(tag.0))
        .await?;
    Ok(())
}

/// Materialise a global assignment on every matching slot of one target deck
async fn global_to_local(
    tx: &mut Transaction,
    tag: DeckTagUuid,
    deck: DeckUuid,
) -> Result<(), rorm::Error> {
    let assignments = rorm::query(&mut *tx, GlobalCardTagModel)
        .condition(GlobalCardTagModel.tag.equals(tag.0))
        .all()
        .await?;
    let mut identities = HashSet::with_capacity(assignments.len());
    for assignment in &assignments {
        identities.insert(printing_identity(&mut *tx, assignment.printing).await?);
    }

    for card in DeckCard::get_all_in_deck(&mut *tx, deck).await? {
        let identity = printing_identity(&mut *tx, card.printing).await?;
        if !identities.contains(&identity) {
            continue;
        }
        let existing = rorm::query(&mut *tx, DeckCardTagModel.uuid)
            .condition(rorm::and![
                DeckCardTagModel.deck_card.equals(card.uuid.into_inner()),
                DeckCardTagModel.tag.equals(tag.0),
            ])
            .optional()
            .await?;
        if existing.is_none() {
            rorm::insert(&mut *tx, DeckCardTagModel)
                .single(&DeckCardTagInsertPatch {
                    uuid: Uuid::now_v7(),
                    deck_card: ForeignModelByField(card.uuid.into_inner()),
                    tag: ForeignModelByField(tag.0),
                })
                .await?;
        }
    }

    rorm::delete(&mut *tx, GlobalCardTagModel)
        .condition(GlobalCardTagModel.tag.equals(tag.0))
        .await?;
    Ok(())
}

/// Turn a statement's affected-row count into a [`DeckAccess`]
fn granted(affected: u64) -> DeckAccess {
    if affected > 0 {
        DeckAccess::Granted(())
    } else {
        DeckAccess::Denied
    }
}
