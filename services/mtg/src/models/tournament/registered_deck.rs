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
//! in Registration; a late Participant registers its own until it is pinned,
//! see [`participant_changes_deck`]. Organizers do it for any Account's
//! Participant at any time, with any of its decks but the private ones.
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
use crate::models::deck::listing::ListedSlot;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::db::TournamentRegisteredCardInsertPatch;
use crate::models::tournament::db::TournamentRegisteredCardModel;
use crate::models::tournament::db::TournamentRegisteredDeckInsertPatch;
use crate::models::tournament::db::TournamentRegisteredDeckModel;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::visibility::Visibility;

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
    /// Whether the Participant lets others see the list once the Tournament is Finished
    pub shared: bool,
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
    /// The deck does not exist, the Participant's Account does not own it, or
    /// it is private and an Organizer registers it
    NotTheirDeck,
}

/// Why a Participant may not change whether its list is shared
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListSharingRefusal {
    /// The Participant has no Registered deck, or is none of this Tournament
    NoRegisteredDeck,
    /// The Tournament is Finished or Cancelled, see [`list_sharing_open`]
    TournamentOver,
}

/// Who reads a Registered deck's list
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListReader {
    /// An Organizer of the Tournament, who checks the lists while it runs
    Organizer,
    /// Anybody else who sees the Tournament, Participants included
    Other,
}

/// Whether a list is shared when the Participant registers it without saying
///
/// A public deck is out in the open already; anything else stays to itself.
pub fn shared_by_default(visibility: Visibility) -> bool {
    visibility == Visibility::Public
}

/// Whether a Participant may still change whether its list is shared
///
/// Until the Tournament is Finished or Cancelled; from then on the lists
/// shown next to the standings stay as they are.
pub fn list_sharing_open(state: TournamentState) -> bool {
    !matches!(
        state,
        TournamentState::Finished | TournamentState::Cancelled
    )
}

/// Whether a Registered deck registered in `state` is shared
///
/// `previous` is the choice of the Registered deck it replaces, if any,
/// `asked` the choice sent with the registration. Once the Tournament is over
/// the choice is fixed, so a deck an Organizer swaps then keeps it; before,
/// it is the one asked for, else the default for a deck at `visibility`.
pub fn sharing_after_swap(
    state: TournamentState,
    previous: Option<bool>,
    asked: Option<bool>,
    visibility: Visibility,
) -> bool {
    match previous {
        Some(previous) if !list_sharing_open(state) => previous,
        _ => asked.unwrap_or_else(|| shared_by_default(visibility)),
    }
}

/// Whether `reader` sees a Registered deck's list
///
/// Organizers see every list at any time. Everybody else sees none before the
/// Tournament is Finished, so nobody gets scouted mid-event, and afterwards the
/// ones their Participants chose to share.
pub fn list_visible(state: TournamentState, shared: bool, reader: ListReader) -> bool {
    match reader {
        ListReader::Organizer => true,
        ListReader::Other => state == TournamentState::Finished && shared,
    }
}

/// Whether `registrar` may register one of the Participant's decks that has `visibility`
///
/// The Participant any of its own. An Organizer none that is private: what
/// the owner keeps to itself stays out of the Organizer's reach.
pub fn may_register(registrar: DeckRegistrar, visibility: Visibility) -> bool {
    match registrar {
        DeckRegistrar::Participant => true,
        DeckRegistrar::Organizer => visibility != Visibility::Private,
    }
}

/// Whether a Participant may register, swap or remove its own Registered deck
///
/// Anybody while the Tournament is in Registration. Afterwards a `late`
/// Participant, who joined after the first Round started, registers its own
/// until it is `pinned`, which registering does at once; nobody does once the
/// Tournament is Finished or Cancelled.
pub fn participant_changes_deck(state: TournamentState, late: bool, pinned: bool) -> bool {
    match state {
        TournamentState::Registration => true,
        TournamentState::Swiss | TournamentState::TopCut => late && !pinned,
        TournamentState::Finished | TournamentState::Cancelled => false,
    }
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

    /// The decks `participant`'s Account owns that an Organizer may register for it
    ///
    /// Leaves the private ones out, see [`may_register`]. Empty for a Guest
    /// and for a Participant of another Tournament.
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
            .condition(rorm::and![
                DeckModel.owner.equals(account.into_inner()),
                rorm::or![
                    DeckModel.visibility.equals(Visibility::Public),
                    DeckModel.visibility.equals(Visibility::Unlisted),
                ],
            ])
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
    /// The deck has to be one its Account owns, and not a private one when an
    /// Organizer registers it, see [`may_register`]. In Registration the Registered
    /// deck follows the deck; afterwards it is pinned at once. `shared` is the
    /// list sharing choice, `None` for the default: shared for a public deck.
    #[instrument(name = "Tournament::register_deck", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn register_deck(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        deck: DeckUuid,
        shared: Option<bool>,
        registrar: DeckRegistrar,
    ) -> Result<Result<(), RegisterDeckRefusal>, rorm::Error> {
        let state = match self.lock_for_deck_write(tx, participant, registrar).await? {
            Ok(state) => state,
            Err(refusal) => return Ok(Err(refusal)),
        };
        let account = match self.participant_account(tx, participant).await? {
            None => return Ok(Err(RegisterDeckRefusal::NoParticipant)),
            Some(None) => return Ok(Err(RegisterDeckRefusal::Guest)),
            Some(Some(account)) => account,
        };
        let owned = rorm::query(&mut *tx, DeckModel.visibility)
            .condition(rorm::and![
                DeckModel.uuid.equals(deck.into_inner()),
                DeckModel.owner.equals(account.into_inner()),
            ])
            .optional()
            .await?;
        let Some(visibility) = owned.filter(|visibility| may_register(registrar, *visibility))
        else {
            return Ok(Err(RegisterDeckRefusal::NotTheirDeck));
        };

        let previous = rorm::query(&mut *tx, TournamentRegisteredDeckModel.list_shared)
            .condition(
                TournamentRegisteredDeckModel
                    .participant
                    .equals(participant.into_inner()),
            )
            .optional()
            .await?;
        delete_registered(tx, participant).await?;
        rorm::insert(&mut *tx, TournamentRegisteredDeckModel)
            .return_nothing()
            .single(&TournamentRegisteredDeckInsertPatch {
                uuid: Uuid::now_v7(),
                participant: ForeignModelByField(participant.into_inner()),
                deck: Some(ForeignModelByField(deck.into_inner())),
                list_shared: sharing_after_swap(state, previous, shared, visibility),
            })
            .await?;
        if state != TournamentState::Registration {
            self.pin_registered_deck(tx, participant).await?;
        }
        Ok(Ok(()))
    }

    /// Set whether `participant`'s list is shared once the Tournament is Finished
    ///
    /// The Participant's own choice, which it may change until the Tournament
    /// is over, see [`list_sharing_open`].
    #[instrument(name = "Tournament::set_list_sharing", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn set_list_sharing(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        shared: bool,
    ) -> Result<Result<(), ListSharingRefusal>, rorm::Error> {
        if self.participant_account(tx, participant).await?.is_none() {
            return Ok(Err(ListSharingRefusal::NoRegisteredDeck));
        }
        if !list_sharing_open(self.state) {
            return Ok(Err(ListSharingRefusal::TournamentOver));
        }
        let updated = rorm::update(&mut *tx, TournamentRegisteredDeckModel)
            .set(TournamentRegisteredDeckModel.list_shared, shared)
            .condition(
                TournamentRegisteredDeckModel
                    .participant
                    .equals(participant.into_inner()),
            )
            .await?;
        if updated == 0 {
            return Ok(Err(ListSharingRefusal::NoRegisteredDeck));
        }
        Ok(Ok(()))
    }

    /// The list of a Registered deck, its Deck entries joined against the card
    /// catalog: the copy once pinned, the deck's own until then
    ///
    /// The caller decides with [`list_visible`] whether the reader may see it.
    #[instrument(name = "Tournament::registered_list", skip(tx, self, deck), fields(tournament = ?self.uuid))]
    pub async fn registered_list(
        &self,
        tx: &mut Transaction,
        deck: &RegisteredDeck,
    ) -> Result<Vec<ListedSlot>, rorm::Error> {
        if deck.pinned_at.is_some() {
            return ListedSlot::read_registered(tx, deck.participant.into_inner()).await;
        }
        match deck.deck {
            Some(followed) => ListedSlot::read_deck(tx, followed).await,
            None => Ok(Vec::new()),
        }
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
        if let Err(refusal) = self.lock_for_deck_write(tx, participant, registrar).await? {
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

    /// Whether `participant` may change its own Registered deck in `state`,
    /// see [`participant_changes_deck`]
    #[instrument(name = "Tournament::changes_own_deck", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn changes_own_deck(
        &self,
        tx: &mut Transaction,
        state: TournamentState,
        participant: ParticipantUuid,
    ) -> Result<bool, rorm::Error> {
        if state == TournamentState::Registration {
            return Ok(true);
        }
        let late = rorm::query(&mut *tx, TournamentParticipantModel.late_from_round)
            .condition(rorm::and![
                TournamentParticipantModel
                    .uuid
                    .equals(participant.into_inner()),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            ])
            .optional()
            .await?
            .flatten()
            .is_some();
        let pinned = rorm::query(&mut *tx, TournamentRegisteredDeckModel.uuid)
            .condition(rorm::and![
                TournamentRegisteredDeckModel
                    .participant
                    .equals(participant.into_inner()),
                TournamentRegisteredDeckModel.pinned_at.is_some(),
            ])
            .optional()
            .await?
            .is_some();
        Ok(participant_changes_deck(state, late, pinned))
    }

    /// Take the roster lock and answer the state under it, or why `registrar`
    /// may not write `participant`'s Registered deck now
    async fn lock_for_deck_write(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        registrar: DeckRegistrar,
    ) -> Result<Result<TournamentState, RegisterDeckRefusal>, rorm::Error> {
        self.lock_roster(tx).await?;
        let state = rorm::query(&mut *tx, TournamentModel.state)
            .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
            .one()
            .await?;
        if registrar == DeckRegistrar::Participant
            && !self.changes_own_deck(tx, state, participant).await?
        {
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
            shared: row.list_shared,
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
        shared: row.list_shared,
    }))
}

#[cfg(test)]
mod tests {
    use super::DeckRegistrar;
    use super::ListReader;
    use super::checkpoint_name;
    use super::list_sharing_open;
    use super::list_visible;
    use super::may_register;
    use super::participant_changes_deck;
    use super::shared_by_default;
    use super::sharing_after_swap;
    use crate::models::tournament::TournamentState;
    use crate::models::visibility::Visibility;

    #[test]
    fn a_public_deck_is_shared_by_default_and_the_others_are_not() {
        assert!(shared_by_default(Visibility::Public));
        assert!(!shared_by_default(Visibility::Unlisted));
        assert!(!shared_by_default(Visibility::Private));
    }

    #[test]
    fn a_deck_swapped_after_the_tournament_is_over_keeps_the_sharing_choice() {
        for state in [TournamentState::Finished, TournamentState::Cancelled] {
            assert!(!sharing_after_swap(
                state,
                Some(false),
                Some(true),
                Visibility::Public
            ));
            assert!(sharing_after_swap(
                state,
                Some(true),
                None,
                Visibility::Private
            ));
            assert!(sharing_after_swap(state, None, None, Visibility::Public));
        }
    }

    #[test]
    fn a_deck_swapped_before_the_tournament_is_over_takes_the_choice_given_or_the_default() {
        assert!(sharing_after_swap(
            TournamentState::Swiss,
            Some(false),
            Some(true),
            Visibility::Private
        ));
        assert!(sharing_after_swap(
            TournamentState::Registration,
            Some(false),
            None,
            Visibility::Public
        ));
        assert!(!sharing_after_swap(
            TournamentState::TopCut,
            Some(true),
            None,
            Visibility::Unlisted
        ));
    }

    #[test]
    fn the_list_sharing_changes_until_the_tournament_is_over() {
        for (state, open) in [
            (TournamentState::Registration, true),
            (TournamentState::Swiss, true),
            (TournamentState::TopCut, true),
            (TournamentState::Finished, false),
            (TournamentState::Cancelled, false),
        ] {
            assert_eq!(list_sharing_open(state), open, "{state:?}");
        }
    }

    #[test]
    fn nobody_but_organizers_sees_a_list_before_the_tournament_is_finished() {
        for state in [
            TournamentState::Registration,
            TournamentState::Swiss,
            TournamentState::TopCut,
            TournamentState::Cancelled,
        ] {
            assert!(!list_visible(state, true, ListReader::Other), "{state:?}");
            assert!(
                list_visible(state, false, ListReader::Organizer),
                "{state:?}"
            );
        }
    }

    #[test]
    fn a_finished_tournament_shows_the_shared_lists_only() {
        assert!(list_visible(
            TournamentState::Finished,
            true,
            ListReader::Other
        ));
        assert!(!list_visible(
            TournamentState::Finished,
            false,
            ListReader::Other
        ));
        assert!(list_visible(
            TournamentState::Finished,
            false,
            ListReader::Organizer
        ));
    }

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

    #[test]
    fn organizers_register_no_private_deck_and_participants_any_of_theirs() {
        assert!(may_register(
            DeckRegistrar::Participant,
            Visibility::Private
        ));
        assert!(may_register(DeckRegistrar::Organizer, Visibility::Public));
        assert!(may_register(DeckRegistrar::Organizer, Visibility::Unlisted));
        assert!(!may_register(DeckRegistrar::Organizer, Visibility::Private));
    }

    #[test]
    fn a_participant_changes_its_deck_in_registration() {
        assert!(participant_changes_deck(
            TournamentState::Registration,
            false,
            false
        ));
    }

    #[test]
    fn a_late_participant_registers_its_deck_until_it_is_pinned() {
        for state in [TournamentState::Swiss, TournamentState::TopCut] {
            assert!(participant_changes_deck(state, true, false), "{state:?}");
            assert!(!participant_changes_deck(state, true, true), "{state:?}");
            assert!(!participant_changes_deck(state, false, false), "{state:?}");
        }
        for state in [TournamentState::Finished, TournamentState::Cancelled] {
            assert!(!participant_changes_deck(state, true, false), "{state:?}");
        }
    }
}
