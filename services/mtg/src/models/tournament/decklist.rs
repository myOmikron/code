//! A participant's decklist: guarded reads and writes, and rendering a deck to text

use std::collections::HashMap;
use std::collections::HashSet;

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use tracing::warn;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::deck::Deck;
use crate::models::deck::DeckCard;
use crate::models::deck::DeckUuid;
use crate::models::deck::DeckZone;
use crate::models::printing::db::PrintingModel;
use crate::models::tournament::AuditAction;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAccess;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentDecklistInsertPatch;
use crate::models::tournament::db::TournamentDecklistModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::participant;
use crate::tournament::decklist::DecklistLine;
use crate::tournament::decklist::DecklistSection;
use crate::tournament::decklist::MAX_DECKLIST_CHARS;
use crate::tournament::decklist::SECTION_HEADINGS;
use crate::tournament::decklist::render;

/// A participant's decklist, as read back for its owner or for staff
#[derive(Debug, Clone)]
pub struct Decklist {
    /// The player it belongs to
    pub participant: TournamentParticipantUuid,
    /// The Planarium deck the text was rendered from, if any — provenance only
    pub deck: Option<DeckUuid>,
    /// The list itself
    pub text: MaxStr<16384>,
    /// When it was last written
    pub updated_at: OffsetDateTime,
}

/// Where a decklist comes from when it is written
#[derive(Debug, Clone)]
pub enum DecklistSource {
    /// Rendered from a Planarium deck — the caller's `deck_owner` must own it
    Deck(DeckUuid),
    /// Pasted text, trimmed and checked non-blank by [`write`]
    Text(MaxStr<16384>),
}

/// Outcome of [`set`]/[`write`]
#[derive(Debug, Clone)]
pub enum DecklistChange {
    /// The list was written
    Written(Decklist),
    /// The row was deleted — also the answer when there was none to delete
    Cleared,
    /// Decklists are locked and the actor is not staff; nothing was written
    Locked,
    /// The named deck does not exist, or the caller does not own it
    UnknownDeck,
    /// The named deck rendered to nothing playable
    EmptyDeck,
    /// The pasted text was blank once trimmed
    Invalid,
}

/// Who the actor is relative to the participant row, as [`participant::self_serve`] answers it
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelfServe {
    /// Holds a role on the tournament
    Staff,
    /// Is the participant themself
    Own,
}

/// Read a participant's decklist (staff or the participant); `Granted(None)` if none submitted
#[instrument(name = "decklist::get", skip(tx))]
pub async fn get(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<Option<Decklist>>, rorm::Error> {
    if participant::self_serve(&mut *tx, actor, tournament, participant)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }

    let row = rorm::query(&mut *tx, TournamentDecklistModel)
        .condition(
            TournamentDecklistModel
                .participant
                .equals(participant.into_inner()),
        )
        .optional()
        .await?;

    Ok(TournamentAccess::Granted(row.map(Decklist::from)))
}

/// Write, replace or clear a participant's decklist; players are refused while locked, staff not
#[instrument(name = "decklist::set", skip(tx, source))]
pub async fn set(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
    source: Option<DecklistSource>,
) -> Result<TournamentAccess<DecklistChange>, rorm::Error> {
    let Some(role) = participant::self_serve(&mut *tx, actor, tournament, participant).await?
    else {
        return Ok(TournamentAccess::Denied);
    };

    if role == SelfServe::Own {
        let locked = rorm::query(&mut *tx, TournamentModel.decklists_locked_at)
            .condition(TournamentModel.uuid.equals(tournament.into_inner()))
            .optional()
            .await?
            .unwrap_or_else(|| unreachable!("self_serve already confirmed this tournament exists"))
            .is_some();
        if locked {
            return Ok(TournamentAccess::Granted(DecklistChange::Locked));
        }
    }

    let account = match actor {
        TournamentActor::Account(account) => Some(account.uuid),
        TournamentActor::Guest(_) => None,
    };

    Ok(TournamentAccess::Granted(
        write(&mut *tx, tournament, participant, source, account, account).await?,
    ))
}

/// Write, replace or clear a decklist without a guard; also called by the registration handlers
#[instrument(name = "decklist::write", skip(tx, source))]
pub(crate) async fn write(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
    source: Option<DecklistSource>,
    deck_owner: Option<AccountUuid>,
    actor: Option<AccountUuid>,
) -> Result<DecklistChange, rorm::Error> {
    let Some(source) = source else {
        rorm::delete(&mut *tx, TournamentDecklistModel)
            .condition(
                TournamentDecklistModel
                    .participant
                    .equals(participant.into_inner()),
            )
            .await?;

        Tournament::audit(
            &mut *tx,
            tournament,
            actor,
            AuditAction::DecklistChanged,
            Some(participant.into_inner()),
            Some("cleared".to_owned()),
        )
        .await?;

        return Ok(DecklistChange::Cleared);
    };

    let (text, deck, detail) = match source {
        DecklistSource::Deck(deck_uuid) => {
            let owned = match deck_owner {
                Some(owner) => Deck::may_administer(&mut *tx, deck_uuid, owner)
                    .await?
                    .is_granted(),
                None => false,
            };
            if !owned {
                return Ok(DecklistChange::UnknownDeck);
            }

            let Some(rendered) = render_deck(&mut *tx, deck_uuid).await? else {
                return Ok(DecklistChange::EmptyDeck);
            };
            let text = MaxStr::new(rendered)
                .unwrap_or_else(|_| unreachable!("render_deck already bounds its output"));
            (
                text,
                Some(deck_uuid),
                format!("linked deck {}", deck_uuid.into_inner()),
            )
        }
        DecklistSource::Text(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return Ok(DecklistChange::Invalid);
            }
            let text = MaxStr::new(trimmed.to_owned())
                .unwrap_or_else(|_| unreachable!("trimming only shrinks the string"));
            (text, None, "pasted text".to_owned())
        }
    };

    // UPDATE-then-INSERT, not catch: Postgres aborts the transaction on a unique violation.
    let affected = rorm::update(&mut *tx, TournamentDecklistModel)
        .set(TournamentDecklistModel.text, text.clone())
        .set(
            TournamentDecklistModel.deck,
            deck.map(|deck| ForeignModelByField(deck.into_inner())),
        )
        .condition(
            TournamentDecklistModel
                .participant
                .equals(participant.into_inner()),
        )
        .await?;
    if affected == 0 {
        rorm::insert(&mut *tx, TournamentDecklistModel)
            .single(&TournamentDecklistInsertPatch {
                uuid: Uuid::now_v7(),
                tournament: ForeignModelByField(tournament.into_inner()),
                participant: ForeignModelByField(participant.into_inner()),
                deck: deck.map(|deck| ForeignModelByField(deck.into_inner())),
                text,
            })
            .await?;
    }

    let row = rorm::query(&mut *tx, TournamentDecklistModel)
        .condition(
            TournamentDecklistModel
                .participant
                .equals(participant.into_inner()),
        )
        .optional()
        .await?
        .unwrap_or_else(|| unreachable!("just written above, in the same transaction"));

    Tournament::audit(
        &mut *tx,
        tournament,
        actor,
        AuditAction::DecklistChanged,
        Some(participant.into_inner()),
        Some(detail),
    )
    .await?;

    Ok(DecklistChange::Written(Decklist::from(row)))
}

/// Every participant of a tournament who has a decklist on file, without loading the text
#[instrument(name = "decklist::submitted", skip(tx))]
pub async fn submitted(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<HashSet<TournamentParticipantUuid>, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentDecklistModel.participant)
        .condition(
            TournamentDecklistModel
                .tournament
                .equals(tournament.into_inner()),
        )
        .all()
        .await?;
    Ok(rows
        .into_iter()
        .map(TournamentParticipantUuid::new_from_field)
        .collect())
}

/// Whether a participant has a decklist on file
#[instrument(name = "decklist::exists", skip(tx))]
pub async fn exists(
    tx: &mut Transaction,
    participant: TournamentParticipantUuid,
) -> Result<bool, rorm::Error> {
    Ok(rorm::query(&mut *tx, TournamentDecklistModel.uuid)
        .condition(
            TournamentDecklistModel
                .participant
                .equals(participant.into_inner()),
        )
        .optional()
        .await?
        .is_some())
}

/// Render a deck into decklist text, empty if nothing in it is playable
#[instrument(name = "decklist::render_deck", skip(tx))]
async fn render_deck(tx: &mut Transaction, deck: DeckUuid) -> Result<Option<String>, rorm::Error> {
    let playable: Vec<_> = DeckCard::get_all_in_deck(&mut *tx, deck)
        .await?
        .into_iter()
        .filter(|card| card.zone != DeckZone::Maybe)
        .collect();
    if playable.is_empty() {
        return Ok(None);
    }

    let printing_ids: HashSet<Uuid> = playable.iter().map(|card| card.printing).collect();
    let conditions = printing_ids
        .iter()
        .map(|id| PrintingModel.id.equals(*id).boxed())
        .collect();
    let printings = rorm::query(&mut *tx, (PrintingModel.id, PrintingModel.name))
        .condition(DynamicCollection::or_unchecked(conditions))
        .all()
        .await?;
    let names: HashMap<Uuid, String> = printings
        .into_iter()
        .map(|(id, name)| (id, name.into_inner()))
        .collect();

    let mut commander = Vec::new();
    let mut main = Vec::new();
    let mut companion = Vec::new();
    let mut side = Vec::new();
    for card in playable {
        let Some(name) = names.get(&card.printing) else {
            warn!(
                printing = %card.printing,
                deck = %deck.into_inner(),
                "decklist render: printing unknown to the catalog, skipping slot",
            );
            continue;
        };
        let line = DecklistLine {
            quantity: card.quantity as u32,
            name: name.clone(),
        };
        match card.zone {
            DeckZone::Commander => commander.push(line),
            DeckZone::Main => main.push(line),
            DeckZone::Companion => companion.push(line),
            DeckZone::Side => side.push(line),
            DeckZone::Maybe => unreachable!("the Maybeboard was filtered out above"),
        }
    }

    let sections = [
        DecklistSection {
            heading: SECTION_HEADINGS[0],
            lines: commander,
        },
        DecklistSection {
            heading: SECTION_HEADINGS[1],
            lines: main,
        },
        DecklistSection {
            heading: SECTION_HEADINGS[2],
            lines: companion,
        },
        DecklistSection {
            heading: SECTION_HEADINGS[3],
            lines: side,
        },
    ];

    let rendered = render(&sections);
    if rendered.is_empty() {
        return Ok(None);
    }
    if rendered.len() > MAX_DECKLIST_CHARS {
        warn!(
            deck = %deck.into_inner(),
            len = rendered.len(),
            "decklist render: exceeds the maximum decklist length, dropping",
        );
        return Ok(None);
    }

    Ok(Some(rendered))
}

impl From<TournamentDecklistModel> for Decklist {
    fn from(value: TournamentDecklistModel) -> Self {
        Self {
            participant: TournamentParticipantUuid::new_from_field(value.participant),
            deck: value.deck.map(DeckUuid::new_from_field),
            text: value.text,
            updated_at: value.updated_at,
        }
    }
}
