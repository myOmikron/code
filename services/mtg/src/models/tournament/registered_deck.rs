//! Registered decks: the deck a Participant with an Account plays (ADR 0002)
//!
//! Until it is pinned a Registered deck follows its deck: its name, format and
//! Deck entries are the deck's as they are now. Pinning copies them into the
//! Tournament and sets a Deck checkpoint named after it in the deck's Deck
//! history; the copy never changes with the deck afterwards and outlives it.
//! The first Round's start pins every Registered deck, see
//! [`Tournament::pin_registered_decks`]; after that, registering or swapping
//! one pins it at once, so a late Participant's deck is a copy from the start.
//!
//! The Participant registers, swaps and removes its own while the Tournament is
//! in Registration; Organizers do it for any Account's Participant at any time.
//! Every write takes [`Tournament::lock_roster`] first and reads the state
//! under that lock, so it cannot slip in beside the first Round's start.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::deck::DeckCard;
use crate::models::deck::DeckEntryKey;
use crate::models::deck::DeckUuid;
use crate::models::deck::db::DeckModel;
use crate::models::deck::history::CHECKPOINT_LENGTH;
use crate::models::deck::history::DeckHistory;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::db::TournamentRegisteredCardInsertPatch;
use crate::models::tournament::db::TournamentRegisteredCardModel;
use crate::models::tournament::db::TournamentRegisteredDeckInsertPatch;
use crate::models::tournament::db::TournamentRegisteredDeckModel;
use crate::models::tournament::participant::ParticipantUuid;

/// How many copied Deck entries one insert statement carries at most
const COPY_CHUNK: usize = 1000;

/// The deck a Participant plays in a Tournament
#[derive(Debug, Clone)]
pub struct RegisteredDeck {
    /// The Participant playing it
    pub participant: ParticipantUuid,
    /// The deck it was made from, `None` once that deck is deleted
    pub deck: Option<DeckUuid>,
    /// The point in time it became a copy, `None` while it follows the deck
    pub pinned_at: Option<OffsetDateTime>,
    /// The deck's settings: as they are now while it follows, as copied once pinned
    pub settings: RegisteredDeckSettings,
}

/// The deck settings a Registered deck carries
#[derive(Debug, Clone)]
pub struct RegisteredDeckSettings {
    /// The deck's name
    pub name: MaxStr<255>,
    /// The format the deck is built for
    pub format: MaxStr<32>,
    /// The Commander bracket it is built to, `None` when unset
    pub bracket: Option<i16>,
    /// The colours it may play, `None` for whatever the commander allows
    pub allowed_color_identity: Option<MaxStr<8>>,
    /// Whether the table agreed to more commanders than the format allows
    pub allow_extra_commanders: bool,
    /// Whether the table agreed to more copies of a card than the format allows
    pub allow_duplicates: bool,
    /// Whether the table agreed to cards the format bans
    pub allow_banned: bool,
    /// How many cards it is built to, `None` for the format's rule
    pub deck_size: Option<i16>,
}

impl From<&DeckModel> for RegisteredDeckSettings {
    fn from(deck: &DeckModel) -> Self {
        Self {
            name: deck.name.clone(),
            format: deck.format.clone(),
            bracket: deck.bracket,
            allowed_color_identity: deck.allowed_color_identity.clone(),
            allow_extra_commanders: deck.allow_extra_commanders,
            allow_duplicates: deck.allow_duplicates,
            allow_banned: deck.allow_banned,
            deck_size: deck.deck_size,
        }
    }
}

/// One Deck entry of a Registered deck
#[derive(Debug, Clone, Copy)]
pub struct RegisteredEntry {
    /// Which Deck entry it is
    pub key: DeckEntryKey,
    /// How many copies it holds
    pub quantity: i32,
}

/// Who changes a Registered deck
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeckRegistrar {
    /// The Participant itself, only while the Tournament is in Registration
    Participant,
    /// An Organizer of the Tournament, at any time
    Organizer,
}

/// Why a Registered deck could not be registered, swapped or removed
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegisterDeckRefusal {
    /// The first Round started, so only Organizers change it
    RegistrationOver,
    /// The Participant is none of this Tournament
    NoParticipant,
    /// The Participant is a Guest, which has no decks
    Guest,
    /// The deck does not exist or the Participant's Account does not own it
    NotTheirDeck,
}

/// The Deck checkpoint name a Tournament called `name` sets
///
/// Cut to [`CHECKPOINT_LENGTH`] bytes on a char boundary, without a trailing blank.
pub fn checkpoint_name(name: &str) -> MaxStr<CHECKPOINT_LENGTH> {
    let cut = name.floor_char_boundary(CHECKPOINT_LENGTH);
    MaxStr::new(name[..cut].trim_end().to_string())
        .unwrap_or_else(|_| unreachable!("cut to {CHECKPOINT_LENGTH} bytes"))
}

impl Tournament {
    /// The Registered deck of `participant`, `None` if it plays without one
    ///
    /// A deck that followed its deck and lost it to a Deletion before it was
    /// pinned counts as none.
    #[instrument(name = "Tournament::registered_deck", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn registered_deck(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<Option<RegisteredDeck>, rorm::Error> {
        let row = rorm::query(&mut *tx, TournamentRegisteredDeckModel)
            .condition(rorm::and![
                TournamentRegisteredDeckModel
                    .participant
                    .equals(participant.into_inner()),
                TournamentRegisteredDeckModel
                    .participant
                    .tournament
                    .equals(self.uuid.into_inner()),
            ])
            .optional()
            .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        resolve(tx, row).await
    }

    /// Every Registered deck of the Tournament, in the order the Participants joined
    #[instrument(name = "Tournament::registered_decks", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn registered_decks(
        &self,
        tx: &mut Transaction,
    ) -> Result<Vec<RegisteredDeck>, rorm::Error> {
        let rows = rorm::query(&mut *tx, TournamentRegisteredDeckModel)
            .condition(
                TournamentRegisteredDeckModel
                    .participant
                    .tournament
                    .equals(self.uuid.into_inner()),
            )
            .order_asc(TournamentRegisteredDeckModel.participant.created_at)
            .order_asc(TournamentRegisteredDeckModel.participant.uuid)
            .all()
            .await?;
        let mut decks = Vec::with_capacity(rows.len());
        for row in rows {
            if let Some(deck) = resolve(tx, row).await? {
                decks.push(deck);
            }
        }
        Ok(decks)
    }

    /// The Deck entries of `participant`'s Registered deck: the copy once
    /// pinned, the deck's own until then
    #[instrument(name = "Tournament::registered_entries", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn registered_entries(
        &self,
        tx: &mut Transaction,
        deck: &RegisteredDeck,
    ) -> Result<Vec<RegisteredEntry>, rorm::Error> {
        if deck.pinned_at.is_none() {
            let Some(followed) = deck.deck else {
                return Ok(Vec::new());
            };
            let cards = DeckCard::get_all_in_deck(tx, followed).await?;
            return Ok(cards
                .into_iter()
                .map(|card| RegisteredEntry {
                    key: DeckEntryKey {
                        printing: card.printing,
                        zone: card.zone,
                        foil: card.foil,
                        proxy: card.proxy,
                    },
                    quantity: card.quantity,
                })
                .collect());
        }
        let cards = rorm::query(&mut *tx, TournamentRegisteredCardModel)
            .condition(
                TournamentRegisteredCardModel
                    .registered_deck
                    .participant
                    .equals(deck.participant.into_inner()),
            )
            .order_asc(TournamentRegisteredCardModel.uuid)
            .all()
            .await?;
        Ok(cards
            .into_iter()
            .map(|card| RegisteredEntry {
                key: DeckEntryKey {
                    printing: card.printing,
                    zone: card.zone,
                    foil: card.foil,
                    proxy: card.proxy,
                },
                quantity: card.quantity,
            })
            .collect())
    }

    /// The decks `participant`'s Account owns, to register one of them
    ///
    /// Empty for a Guest and for a Participant of another Tournament.
    #[instrument(name = "Tournament::participant_decks", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn participant_decks(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<Vec<(DeckUuid, MaxStr<255>, MaxStr<32>)>, rorm::Error> {
        let Some(Some(account)) = self.participant_account(tx, participant).await? else {
            return Ok(Vec::new());
        };
        let decks = rorm::query(&mut *tx, (DeckModel.uuid, DeckModel.name, DeckModel.format))
            .condition(DeckModel.owner.equals(account.into_inner()))
            .order_asc(DeckModel.name)
            .order_asc(DeckModel.uuid)
            .all()
            .await?;
        Ok(decks
            .into_iter()
            .map(|(uuid, name, format)| (DeckUuid::from_uuid(uuid), name, format))
            .collect())
    }

    /// Register `deck` for `participant`, replacing the Registered deck it had
    ///
    /// The deck has to be one its Account owns. In Registration the Registered
    /// deck follows the deck; afterwards it is pinned at once.
    #[instrument(name = "Tournament::register_deck", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn register_deck(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        deck: DeckUuid,
        registrar: DeckRegistrar,
    ) -> Result<Result<(), RegisterDeckRefusal>, rorm::Error> {
        let state = match self.lock_for_deck_write(tx, registrar).await? {
            Ok(state) => state,
            Err(refusal) => return Ok(Err(refusal)),
        };
        let account = match self.participant_account(tx, participant).await? {
            None => return Ok(Err(RegisterDeckRefusal::NoParticipant)),
            Some(None) => return Ok(Err(RegisterDeckRefusal::Guest)),
            Some(Some(account)) => account,
        };
        let owned = rorm::query(&mut *tx, DeckModel.uuid)
            .condition(rorm::and![
                DeckModel.uuid.equals(deck.into_inner()),
                DeckModel.owner.equals(account.into_inner()),
            ])
            .optional()
            .await?;
        if owned.is_none() {
            return Ok(Err(RegisterDeckRefusal::NotTheirDeck));
        }

        delete_registered(tx, participant).await?;
        rorm::insert(&mut *tx, TournamentRegisteredDeckModel)
            .return_nothing()
            .single(&TournamentRegisteredDeckInsertPatch {
                uuid: Uuid::now_v7(),
                participant: ForeignModelByField(participant.into_inner()),
                deck: Some(ForeignModelByField(deck.into_inner())),
            })
            .await?;
        if state != TournamentState::Registration {
            self.pin_registered_deck(tx, participant).await?;
        }
        Ok(Ok(()))
    }

    /// Take `participant`'s Registered deck away, so it plays without one
    ///
    /// Answers `false` if it had none.
    #[instrument(name = "Tournament::remove_registered_deck", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn remove_registered_deck(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        registrar: DeckRegistrar,
    ) -> Result<Result<bool, RegisterDeckRefusal>, rorm::Error> {
        if let Err(refusal) = self.lock_for_deck_write(tx, registrar).await? {
            return Ok(Err(refusal));
        }
        if self.participant_account(tx, participant).await?.is_none() {
            return Ok(Err(RegisterDeckRefusal::NoParticipant));
        }
        Ok(Ok(delete_registered(tx, participant).await? > 0))
    }

    /// Pin every Registered deck that still follows its deck
    ///
    /// Called when the first Round starts. Decks are locked in id order, the
    /// order every service edit of several decks takes.
    #[instrument(name = "Tournament::pin_registered_decks", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn pin_registered_decks(&self, tx: &mut Transaction) -> Result<(), rorm::Error> {
        let mut rows = rorm::query(&mut *tx, TournamentRegisteredDeckModel)
            .condition(rorm::and![
                TournamentRegisteredDeckModel
                    .participant
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentRegisteredDeckModel.pinned_at.is_none(),
            ])
            .all()
            .await?;
        rows.sort_by_key(|row| row.deck.as_ref().map(|deck| deck.0));
        for row in rows {
            self.pin(tx, row).await?;
        }
        Ok(())
    }

    /// Pin `participant`'s Registered deck if it still follows its deck
    ///
    /// For a late Participant joining after the first Round started; a no-op
    /// when it has no Registered deck or it is pinned already.
    #[instrument(name = "Tournament::pin_registered_deck", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn pin_registered_deck(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<(), rorm::Error> {
        let row = rorm::query(&mut *tx, TournamentRegisteredDeckModel)
            .condition(rorm::and![
                TournamentRegisteredDeckModel
                    .participant
                    .equals(participant.into_inner()),
                TournamentRegisteredDeckModel.pinned_at.is_none(),
            ])
            .optional()
            .await?;
        if let Some(row) = row {
            self.pin(tx, row).await?;
        }
        Ok(())
    }

    /// Copy the deck `row` follows into it and set the Deck checkpoint
    ///
    /// A row whose deck is gone has nothing to copy and goes away. The Deck
    /// checkpoint names the deck's latest Deck change unless the owner named
    /// that one already, whose name stays.
    async fn pin(
        &self,
        tx: &mut Transaction,
        row: TournamentRegisteredDeckModel,
    ) -> Result<(), rorm::Error> {
        let edit = match &row.deck {
            Some(deck) => DeckHistory::lock_for_service(tx, DeckUuid::from_uuid(deck.0)).await?,
            None => None,
        };
        let deck = match &edit {
            Some(edit) => {
                rorm::query(&mut *tx, DeckModel)
                    .condition(DeckModel.uuid.equals(edit.deck().into_inner()))
                    .optional()
                    .await?
            }
            None => None,
        };
        let (Some(edit), Some(deck)) = (edit, deck) else {
            rorm::delete(&mut *tx, TournamentRegisteredDeckModel)
                .condition(TournamentRegisteredDeckModel.uuid.equals(row.uuid))
                .await?;
            return Ok(());
        };

        let settings = RegisteredDeckSettings::from(&deck);
        rorm::update(&mut *tx, TournamentRegisteredDeckModel)
            .set(
                TournamentRegisteredDeckModel.pinned_at,
                Some(OffsetDateTime::now_utc()),
            )
            .set(TournamentRegisteredDeckModel.name, Some(settings.name))
            .set(TournamentRegisteredDeckModel.format, Some(settings.format))
            .set(TournamentRegisteredDeckModel.bracket, settings.bracket)
            .set(
                TournamentRegisteredDeckModel.allowed_color_identity,
                settings.allowed_color_identity,
            )
            .set(
                TournamentRegisteredDeckModel.allow_extra_commanders,
                settings.allow_extra_commanders,
            )
            .set(
                TournamentRegisteredDeckModel.allow_duplicates,
                settings.allow_duplicates,
            )
            .set(
                TournamentRegisteredDeckModel.allow_banned,
                settings.allow_banned,
            )
            .set(TournamentRegisteredDeckModel.deck_size, settings.deck_size)
            .condition(TournamentRegisteredDeckModel.uuid.equals(row.uuid))
            .await?;

        let patches: Vec<_> = DeckCard::get_all_in_deck(tx, edit.deck())
            .await?
            .into_iter()
            .map(|card| TournamentRegisteredCardInsertPatch {
                uuid: Uuid::now_v7(),
                registered_deck: ForeignModelByField(row.uuid),
                printing: card.printing,
                quantity: card.quantity,
                zone: card.zone,
                foil: card.foil,
                proxy: card.proxy,
            })
            .collect();
        for chunk in patches.chunks(COPY_CHUNK) {
            rorm::insert(&mut *tx, TournamentRegisteredCardModel)
                .return_nothing()
                .bulk(chunk)
                .await?;
        }

        let latest = DeckHistory::page(tx, edit.deck(), None, 1).await?;
        if let Some(change) = latest.changes.first()
            && change.checkpoint.is_none()
        {
            edit.name_checkpoint(tx, change.uuid, Some(checkpoint_name(&self.name)))
                .await?;
        }
        Ok(())
    }

    /// Take the roster lock and answer the state under it, or why `registrar`
    /// may not write now
    async fn lock_for_deck_write(
        &self,
        tx: &mut Transaction,
        registrar: DeckRegistrar,
    ) -> Result<Result<TournamentState, RegisterDeckRefusal>, rorm::Error> {
        self.lock_roster(tx).await?;
        let state = rorm::query(&mut *tx, TournamentModel.state)
            .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
            .one()
            .await?;
        if registrar == DeckRegistrar::Participant && state != TournamentState::Registration {
            return Ok(Err(RegisterDeckRefusal::RegistrationOver));
        }
        Ok(Ok(state))
    }

    /// The Account `participant` is, `Some(None)` for a Guest, `None` if it is
    /// no Participant of this Tournament
    async fn participant_account(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<Option<Option<AccountUuid>>, rorm::Error> {
        let row = rorm::query(&mut *tx, TournamentParticipantModel.account)
            .condition(rorm::and![
                TournamentParticipantModel
                    .uuid
                    .equals(participant.into_inner()),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            ])
            .optional()
            .await?;
        Ok(row.map(|account| account.map(AccountUuid::new_from_field)))
    }
}

/// Delete `participant`'s Registered deck, its copied Deck entries with it
async fn delete_registered(
    tx: &mut Transaction,
    participant: ParticipantUuid,
) -> Result<u64, rorm::Error> {
    rorm::delete(&mut *tx, TournamentRegisteredDeckModel)
        .condition(
            TournamentRegisteredDeckModel
                .participant
                .equals(participant.into_inner()),
        )
        .await
}

/// The Registered deck a row stands for, reading a followed deck live
async fn resolve(
    tx: &mut Transaction,
    row: TournamentRegisteredDeckModel,
) -> Result<Option<RegisteredDeck>, rorm::Error> {
    let participant = ParticipantUuid::new(row.participant.0);
    let deck = row.deck.as_ref().map(|deck| DeckUuid::from_uuid(deck.0));
    if row.pinned_at.is_some() {
        let (Some(name), Some(format)) = (row.name, row.format) else {
            unreachable!("pinned registered deck {} carries its settings", row.uuid);
        };
        return Ok(Some(RegisteredDeck {
            participant,
            deck,
            pinned_at: row.pinned_at,
            settings: RegisteredDeckSettings {
                name,
                format,
                bracket: row.bracket,
                allowed_color_identity: row.allowed_color_identity,
                allow_extra_commanders: row.allow_extra_commanders,
                allow_duplicates: row.allow_duplicates,
                allow_banned: row.allow_banned,
                deck_size: row.deck_size,
            },
        }));
    }
    let Some(followed) = deck else {
        return Ok(None);
    };
    let found = rorm::query(&mut *tx, DeckModel)
        .condition(DeckModel.uuid.equals(followed.into_inner()))
        .optional()
        .await?;
    Ok(found.map(|found| RegisteredDeck {
        participant,
        deck,
        pinned_at: None,
        settings: RegisteredDeckSettings::from(&found),
    }))
}

#[cfg(test)]
mod tests {
    use super::checkpoint_name;

    #[test]
    fn a_short_tournament_name_is_the_checkpoint_name() {
        assert_eq!(
            &*checkpoint_name("Friday Night Commander"),
            "Friday Night Commander"
        );
    }

    #[test]
    fn a_long_tournament_name_is_cut_to_64_bytes_without_a_trailing_blank() {
        let name = "Commander League Finals at the Dragon's Den, Season Three, Week Twelve";
        assert_eq!(
            &*checkpoint_name(name),
            "Commander League Finals at the Dragon's Den, Season Three, Week"
        );
    }

    #[test]
    fn the_cut_never_splits_a_character() {
        let name = format!("{}Ä", "a".repeat(63));
        assert_eq!(&*checkpoint_name(&name), "a".repeat(63));
    }
}
