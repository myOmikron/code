//! The Participants of a Tournament: Accounts and Guests
//!
//! Organizers add Accounts by username and Guests by name, and remove
//! Participants, while the Tournament is in Registration. Accounts sign up
//! themselves where the Owner allowed it, see [`Tournament::sign_up_refusal`].
//! An Organizer can be a Participant of its own Tournament like anybody else.
//!
//! Once the first Round started, sign-up is closed and nobody is removed:
//! Organizers add late Participants until the Swiss Rounds are over, see
//! [`Tournament::takes_participants`], and a Participant leaves by a Drop,
//! see [`Tournament::drop_participant`].
//!
//! Every write to the roster first takes [`Tournament::lock_roster`], so two
//! sign-ups racing for the last place under the limit are served one by one.
//! Every change to the roster discards a previewed Round, which no longer fits it.
//!
//! Where the Tournament takes an entry fee or check-in, Organizers mark
//! Participants paid and check them in; until then they are not paired.

use std::collections::HashMap;
use std::collections::HashSet;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::account::db::AccountModel;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::db::TournamentParticipantInsertPatch;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::participant_key;
use crate::models::tournament::result::ResultChange;
use crate::models::tournament::round::RoundState;
use crate::models::tournament::settings::CheckIn;
use crate::models::visibility::Visibility;
use crate::tournament::record::EntrantId;

/// One player in a Tournament
#[derive(Debug, Clone)]
pub struct Participant {
    /// Primary key
    pub uuid: ParticipantUuid,
    /// Who plays
    pub player: Player,
    /// The first Round it plays if it came late, `None` if it was there before Round 1
    pub late_from_round: Option<i16>,
    /// The last Round started before it Dropped, `None` while it plays on
    pub dropped_after_round: Option<i16>,
    /// Whether it still owes the entry fee, see [`Tournament::owes_entry_fee`]
    ///
    /// For Organizers' eyes only.
    pub unpaid: bool,
    /// Whether it still has to check in, see [`Tournament::awaits_check_in`]
    ///
    /// For the eyes of the Organizers and of the Participant itself.
    pub awaits_check_in: bool,
}

/// What a Drop did
#[derive(Debug)]
pub struct Dropped {
    /// The Result of the running Top cut Match the Participant lost by
    /// dropping: the other Seat wins it
    pub forfeit: Option<ResultChange>,
}

impl Participant {
    /// Whether the next Round pairs it, as far as the roster goes
    pub fn plays_on(&self) -> bool {
        self.dropped_after_round.is_none()
    }

    /// Whether the next Round pairs it: it plays on, owes no entry fee and
    /// does not wait to be checked in
    pub fn pairable(&self) -> bool {
        self.plays_on() && !self.unpaid && !self.awaits_check_in
    }
}

/// Who a Participant is
#[derive(Debug, Clone)]
pub enum Player {
    /// An Account, with its username as it is now
    Account {
        /// The Account
        account: AccountUuid,
        /// Its username, read live so a Rename shows at once
        username: Username,
    },
    /// A Guest, known by the name an Organizer gave it
    Guest {
        /// The name
        name: MaxStr<64>,
    },
}

/// Wrapper for the primary key of a [`Participant`]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct ParticipantUuid(Uuid);

impl ParticipantUuid {
    /// Wrap a Participant's primary key read from a row
    pub(in crate::models) fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    /// The Participant an answer of the engine names
    pub fn from_entrant(entrant: EntrantId) -> Self {
        Self(entrant)
    }

    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Why an Account may not sign up for a Tournament
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignUpRefusal {
    /// Self sign-up is off, the Tournament is private or past Registration
    Closed,
    /// The Account already is a Participant
    AlreadyParticipant,
    /// The participant limit is reached
    Full,
}

/// Why a Participant may not Drop
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DropRefusal {
    /// No Round started yet: before the first Round a Participant is removed instead
    NotStarted,
    /// The Tournament is Finished or Cancelled
    TournamentOver,
}

/// Why an Organizer may not mark a Participant paid or unpaid
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaidRefusal {
    /// The Tournament has no entry fee, so nobody is unpaid
    NoEntryFee,
    /// The Tournament is Finished or Cancelled
    TournamentOver,
}

/// Why an Organizer may not check a Participant in or out
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CheckInRefusal {
    /// The Tournament takes no check-in
    NoCheckIn,
    /// The Tournament is Finished or Cancelled
    TournamentOver,
    /// The first Round started: leaving now is a Drop, not a check-out
    RoundStarted,
    /// The Tournament takes check-in with a deck and the Account has no Registered deck
    NoRegisteredDeck,
}

/// The first Round a Participant added after `started_rounds` Rounds started plays
///
/// `None` while no Round started: Round 1 pairs everybody, nobody is late.
pub fn late_from_round(started_rounds: i16) -> Option<i16> {
    (started_rounds > 0).then(|| started_rounds.saturating_add(1))
}

impl Tournament {
    /// Whether Organizers may still add and remove Participants
    ///
    /// Only before the first Round starts, that is in Registration.
    pub fn roster_open(&self) -> bool {
        self.state == TournamentState::Registration
    }

    /// Whether Organizers may still add Participants
    ///
    /// In Registration and, as late Participants, until the Swiss Rounds are over.
    pub fn takes_participants(&self) -> bool {
        matches!(
            self.state,
            TournamentState::Registration | TournamentState::Swiss
        )
    }

    /// Why a Participant may not Drop, `None` if it may
    ///
    /// `started_rounds` counts the Rounds that started, see [`Self::started_rounds`].
    pub fn drop_refusal(&self, started_rounds: i16) -> Option<DropRefusal> {
        if self.over() {
            return Some(DropRefusal::TournamentOver);
        }
        (started_rounds == 0).then_some(DropRefusal::NotStarted)
    }

    /// Why an Account may not sign up, `None` if it may
    ///
    /// `participants` counts every Participant there is, Guests and those
    /// Organizers added included; `already` says whether the Account is one.
    pub fn sign_up_refusal(&self, participants: u64, already: bool) -> Option<SignUpRefusal> {
        let open =
            self.self_sign_up && self.visibility != Visibility::Private && self.roster_open();
        if !open {
            return Some(SignUpRefusal::Closed);
        }
        if already {
            return Some(SignUpRefusal::AlreadyParticipant);
        }
        let full = self
            .participant_limit
            .is_some_and(|limit| participants >= u64::try_from(limit).unwrap_or(0));
        full.then_some(SignUpRefusal::Full)
    }

    /// Whether a Participant `paid` or not owes the entry fee
    ///
    /// Without an entry fee nobody does; with one, everybody until an
    /// Organizer marks it paid.
    pub fn owes_entry_fee(&self, paid: bool) -> bool {
        self.entry_fee.is_some() && !paid
    }

    /// Whether a Participant `checked_in` or not still has to check in
    ///
    /// Without check-in nobody does; with it, everybody until an Organizer
    /// checks it in.
    pub fn awaits_check_in(&self, checked_in: bool) -> bool {
        self.check_in != CheckIn::Off && !checked_in
    }

    /// Why an Organizer may not set a Participant `checked_in`, `None` if it may
    ///
    /// `started_rounds` counts the Rounds that started, see [`Self::started_rounds`];
    /// `lacks_deck` says whether the Participant is an Account without a
    /// Registered deck. Checking in never needs a deck from a Guest, which
    /// cannot have one, and checking out never needs one at all.
    pub fn check_in_refusal(
        &self,
        checked_in: bool,
        started_rounds: i16,
        lacks_deck: bool,
    ) -> Option<CheckInRefusal> {
        if self.check_in == CheckIn::Off {
            Some(CheckInRefusal::NoCheckIn)
        } else if self.over() {
            Some(CheckInRefusal::TournamentOver)
        } else if !checked_in && started_rounds > 0 {
            Some(CheckInRefusal::RoundStarted)
        } else if checked_in && lacks_deck && self.check_in == CheckIn::RequiredWithDeck {
            Some(CheckInRefusal::NoRegisteredDeck)
        } else {
            None
        }
    }

    /// Why Organizers may not mark Participants paid or unpaid, `None` if they may
    pub fn paid_refusal(&self) -> Option<PaidRefusal> {
        if self.entry_fee.is_none() {
            Some(PaidRefusal::NoEntryFee)
        } else if self.over() {
            Some(PaidRefusal::TournamentOver)
        } else {
            None
        }
    }

    /// Lock the Tournament's row until the transaction ends, before a roster write
    #[instrument(name = "Tournament::lock_roster", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn lock_roster(&self, tx: &mut Transaction) -> Result<(), rorm::Error> {
        (&mut *tx)
            .execute::<All>(
                "SELECT uuid FROM tournament WHERE uuid = $1 FOR NO KEY UPDATE".to_string(),
                vec![Value::Uuid(self.uuid.into_inner())],
            )
            .await?;
        Ok(())
    }

    /// Every Participant, in the order they were added or signed up
    #[instrument(name = "Tournament::participants", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn participants(
        &self,
        tx: &mut Transaction,
    ) -> Result<Vec<Participant>, rorm::Error> {
        let rows = rorm::query(&mut *tx, TournamentParticipantModel)
            .condition(
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            )
            .order_asc(TournamentParticipantModel.created_at)
            .order_asc(TournamentParticipantModel.uuid)
            .all()
            .await?;

        let accounts: Vec<Uuid> = rows
            .iter()
            .filter_map(|row| row.account.as_ref().map(|account| account.0))
            .collect();
        let mut usernames = HashMap::new();
        if !accounts.is_empty() {
            let found = rorm::query(&mut *tx, (AccountModel.uuid, AccountModel.username))
                .condition(DynamicCollection::or_unchecked(
                    accounts
                        .iter()
                        .map(|account| AccountModel.uuid.equals(*account))
                        .collect(),
                ))
                .all()
                .await?;
            usernames.extend(found);
        }

        Ok(rows
            .into_iter()
            .map(|row| {
                let account = row.account.map(AccountUuid::new_from_field);
                let username = account.and_then(|account| usernames.remove(&account.into_inner()));
                let player = match (account, username, row.guest_name) {
                    (Some(account), Some(username), _) => Player::Account {
                        account,
                        username: Username::new_from_field(username),
                    },
                    (_, _, Some(name)) => Player::Guest { name },
                    _ => unreachable!("participant {} is neither an Account nor a Guest", row.uuid),
                };
                Participant {
                    uuid: ParticipantUuid(row.uuid),
                    player,
                    late_from_round: row.late_from_round,
                    dropped_after_round: row.dropped_after_round,
                    unpaid: self.owes_entry_fee(row.paid),
                    awaits_check_in: self.awaits_check_in(row.checked_in),
                }
            })
            .collect())
    }

    /// How many Participants there are, Guests included
    #[instrument(name = "Tournament::count_participants", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn count_participants(&self, tx: &mut Transaction) -> Result<u64, rorm::Error> {
        let count = rorm::query(&mut *tx, TournamentParticipantModel.uuid.count())
            .condition(
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            )
            .one()
            .await?;
        Ok(u64::try_from(count).unwrap_or(0))
    }

    /// The Participant `account` is in this Tournament, `None` if it is none
    #[instrument(name = "Tournament::participant_of", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn participant_of(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Option<ParticipantUuid>, rorm::Error> {
        let key = participant_key(self.uuid.into_inner(), account.into_inner());
        let found = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
            .condition(TournamentParticipantModel.uuid.equals(key))
            .optional()
            .await?;
        Ok(found.map(ParticipantUuid))
    }

    /// Make `account` a Participant, `None` if it already is one
    ///
    /// After the first Round started it is a late Participant, paired from
    /// the next Round on. The caller holds [`Self::lock_roster`].
    #[instrument(name = "Tournament::add_account", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn add_account(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Option<ParticipantUuid>, rorm::Error> {
        if self.participant_of(tx, account).await?.is_some() {
            return Ok(None);
        }
        let uuid = participant_key(self.uuid.into_inner(), account.into_inner());
        let late_from_round = late_from_round(self.started_rounds(tx).await?);
        rorm::insert(&mut *tx, TournamentParticipantModel)
            .return_nothing()
            .single(&TournamentParticipantInsertPatch {
                uuid,
                tournament: ForeignModelByField(self.uuid.into_inner()),
                account: Some(ForeignModelByField(account.into_inner())),
                guest_name: None,
                late_from_round,
                paid: false,
                checked_in: false,
            })
            .await?;
        self.discard_preview(tx).await?;
        Ok(Some(ParticipantUuid(uuid)))
    }

    /// Add a Guest by `name`
    ///
    /// Names need not be unique: two Guests may share one. After the first
    /// Round started it is a late Participant, as in [`Self::add_account`].
    #[instrument(name = "Tournament::add_guest", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn add_guest(
        &self,
        tx: &mut Transaction,
        name: MaxStr<64>,
    ) -> Result<ParticipantUuid, rorm::Error> {
        let uuid = Uuid::now_v7();
        let late_from_round = late_from_round(self.started_rounds(tx).await?);
        rorm::insert(&mut *tx, TournamentParticipantModel)
            .return_nothing()
            .single(&TournamentParticipantInsertPatch {
                uuid,
                tournament: ForeignModelByField(self.uuid.into_inner()),
                account: None,
                guest_name: Some(name),
                late_from_round,
                paid: false,
                checked_in: false,
            })
            .await?;
        self.discard_preview(tx).await?;
        Ok(ParticipantUuid(uuid))
    }

    /// Take a Participant out, `false` if it is none of this Tournament
    #[instrument(name = "Tournament::remove_participant", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn remove_participant(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<bool, rorm::Error> {
        let removed = rorm::delete(&mut *tx, TournamentParticipantModel)
            .condition(rorm::and![
                TournamentParticipantModel.uuid.equals(participant.0),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            ])
            .await?;
        if removed > 0 {
            self.discard_preview(tx).await?;
        }
        Ok(removed > 0)
    }

    /// How many Rounds started, the running one included and a previewed one not
    #[instrument(name = "Tournament::started_rounds", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn started_rounds(&self, tx: &mut Transaction) -> Result<i16, rorm::Error> {
        let count = rorm::query(&mut *tx, TournamentRoundModel.uuid.count())
            .condition(rorm::and![
                TournamentRoundModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentRoundModel.state.not_equals(RoundState::Previewed),
            ])
            .one()
            .await?;
        Ok(i16::try_from(count).unwrap_or(i16::MAX))
    }

    /// Drop `participant`: no later Round pairs it, its Results so far stay
    ///
    /// A Swiss Match it is seated in right now stays and still needs its
    /// Result; a running Top cut Match it loses. A previewed Round is
    /// discarded, since it seats the Participant: paired again before the Top
    /// cut started, the next in the standings takes its place. Dropping
    /// a Participant that Dropped already changes nothing. Answers `None` if
    /// it is none of this Tournament's. The caller holds [`Self::lock_roster`].
    #[instrument(name = "Tournament::drop_participant", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn drop_participant(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<Result<Option<Dropped>, DropRefusal>, rorm::Error> {
        let started = self.started_rounds(tx).await?;
        if let Some(refusal) = self.drop_refusal(started) {
            return Ok(Err(refusal));
        }
        let known = rorm::query(&mut *tx, TournamentParticipantModel.dropped_after_round)
            .condition(rorm::and![
                TournamentParticipantModel.uuid.equals(participant.0),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            ])
            .optional()
            .await?;
        match known {
            None => Ok(Ok(None)),
            Some(Some(_)) => Ok(Ok(Some(Dropped { forfeit: None }))),
            Some(None) => {
                rorm::update(&mut *tx, TournamentParticipantModel)
                    .set(
                        TournamentParticipantModel.dropped_after_round,
                        Some(started),
                    )
                    .condition(TournamentParticipantModel.uuid.equals(participant.0))
                    .await?;
                self.discard_preview(tx).await?;
                let forfeit = self.forfeit_top_cut_match(tx, participant).await?;
                Ok(Ok(Some(Dropped { forfeit })))
            }
        }
    }
}

impl Tournament {
    /// Mark `participant` paid or unpaid, `false` if it is none of this Tournament
    ///
    /// Who pays changes who is pairable, so a previewed Round is discarded
    /// when the flag changes. The caller holds [`Self::lock_roster`].
    #[instrument(name = "Tournament::mark_paid", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn mark_paid(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        paid: bool,
    ) -> Result<Result<bool, PaidRefusal>, rorm::Error> {
        if let Some(refusal) = self.paid_refusal() {
            return Ok(Err(refusal));
        }
        let known = rorm::query(&mut *tx, TournamentParticipantModel.paid)
            .condition(rorm::and![
                TournamentParticipantModel.uuid.equals(participant.0),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            ])
            .optional()
            .await?;
        match known {
            None => Ok(Ok(false)),
            Some(was) if was == paid => Ok(Ok(true)),
            Some(_) => {
                rorm::update(&mut *tx, TournamentParticipantModel)
                    .set(TournamentParticipantModel.paid, paid)
                    .condition(TournamentParticipantModel.uuid.equals(participant.0))
                    .await?;
                self.discard_preview(tx).await?;
                Ok(Ok(true))
            }
        }
    }

    /// Check `participant` in or out, `false` if it is none of this Tournament
    ///
    /// Leaves its Registered deck as it is: it still follows the deck until
    /// the first Round starts (ADR 0002). Who is checked in changes who is
    /// pairable, so a previewed Round is discarded when the flag changes.
    /// The caller holds [`Self::lock_roster`].
    #[instrument(name = "Tournament::check_in", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn check_in(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        checked_in: bool,
    ) -> Result<Result<bool, CheckInRefusal>, rorm::Error> {
        let known = rorm::query(
            &mut *tx,
            (
                TournamentParticipantModel.checked_in,
                TournamentParticipantModel.account,
            ),
        )
        .condition(rorm::and![
            TournamentParticipantModel.uuid.equals(participant.0),
            TournamentParticipantModel
                .tournament
                .equals(self.uuid.into_inner()),
        ])
        .optional()
        .await?;
        let Some((was, account)) = known else {
            return Ok(Ok(false));
        };
        let lacks_deck = checked_in
            && account.is_some()
            && self.check_in == CheckIn::RequiredWithDeck
            && self.registered_deck(tx, participant).await?.is_none();
        let started = self.started_rounds(tx).await?;
        if let Some(refusal) = self.check_in_refusal(checked_in, started, lacks_deck) {
            return Ok(Err(refusal));
        }
        if was != checked_in {
            rorm::update(&mut *tx, TournamentParticipantModel)
                .set(TournamentParticipantModel.checked_in, checked_in)
                .condition(TournamentParticipantModel.uuid.equals(participant.0))
                .await?;
            self.discard_preview(tx).await?;
        }
        Ok(Ok(true))
    }

    /// Check in every Participant that plays on and may be checked in
    ///
    /// Answers those left out for want of a Registered deck. A previewed
    /// Round is discarded when anybody was checked in. The caller holds
    /// [`Self::lock_roster`].
    #[instrument(name = "Tournament::check_in_everyone", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn check_in_everyone(
        &self,
        tx: &mut Transaction,
    ) -> Result<Result<Vec<ParticipantUuid>, CheckInRefusal>, rorm::Error> {
        let started = self.started_rounds(tx).await?;
        if let Some(refusal) = self.check_in_refusal(true, started, false) {
            return Ok(Err(refusal));
        }
        let with_deck: HashSet<ParticipantUuid> = match self.check_in {
            CheckIn::RequiredWithDeck => self
                .registered_decks(tx)
                .await?
                .into_iter()
                .map(|deck| deck.participant)
                .collect(),
            CheckIn::Off | CheckIn::Required => HashSet::new(),
        };
        let mut checking = Vec::new();
        let mut lacking = Vec::new();
        for participant in self.participants(tx).await? {
            if !participant.plays_on() || !participant.awaits_check_in {
                continue;
            }
            let lacks_deck = matches!(participant.player, Player::Account { .. })
                && !with_deck.contains(&participant.uuid);
            match self.check_in_refusal(true, started, lacks_deck) {
                None => checking.push(participant.uuid),
                Some(_) => lacking.push(participant.uuid),
            }
        }
        if !checking.is_empty() {
            rorm::update(&mut *tx, TournamentParticipantModel)
                .set(TournamentParticipantModel.checked_in, true)
                .condition(DynamicCollection::or_unchecked(
                    checking
                        .iter()
                        .map(|participant| TournamentParticipantModel.uuid.equals(participant.0))
                        .collect(),
                ))
                .await?;
            self.discard_preview(tx).await?;
        }
        Ok(Ok(lacking))
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::time::OffsetDateTime;
    use galvyn::rorm::fields::types::MaxStr;
    use uuid::Uuid;

    use super::CheckInRefusal;
    use super::DropRefusal;
    use super::PaidRefusal;
    use super::Participant;
    use super::ParticipantUuid;
    use super::Player;
    use super::SignUpRefusal;
    use super::late_from_round;
    use crate::models::account::AccountUuid;
    use crate::models::tournament::Tournament;
    use crate::models::tournament::TournamentState;
    use crate::models::tournament::TournamentUuid;
    use crate::models::tournament::settings::CheckIn;
    use crate::models::tournament::settings::EntryFee;
    use crate::models::visibility::Visibility;
    use crate::tournament::ruleset::Ruleset;
    use crate::tournament::ruleset::TableSize;

    /// A public Tournament in Registration with self sign-up on and a limit of 8
    fn open_tournament() -> Tournament {
        Tournament {
            uuid: TournamentUuid(Uuid::nil()),
            owner: AccountUuid::new(Uuid::nil()),
            name: MaxStr::new("Friday Night Commander".to_string()).expect("short"),
            description: None,
            location: None,
            starts_at: OffsetDateTime::UNIX_EPOCH,
            table_size: TableSize::new(4).expect("a Table size"),
            ruleset: Ruleset::TopDeck,
            format: None,
            visibility: Visibility::Public,
            share_token: None,
            participant_limit: Some(8),
            self_sign_up: true,
            best_of: None,
            entry_fee: None,
            check_in: CheckIn::Off,
            round_minutes: None,
            swiss_rounds: None,
            top_cut: None,
            top_cut_best_of: None,
            entered_afterwards: false,
            state: TournamentState::Registration,
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    /// [`open_tournament`] with an entry fee of 5 euros
    fn paying_tournament() -> Tournament {
        Tournament {
            entry_fee: Some(EntryFee {
                amount: 500,
                currency: MaxStr::new("EUR".to_string()).expect("short"),
            }),
            ..open_tournament()
        }
    }

    /// A Guest who plays on, `unpaid` or not
    fn guest(unpaid: bool) -> Participant {
        Participant {
            uuid: ParticipantUuid(Uuid::nil()),
            player: Player::Guest {
                name: MaxStr::new("Guest".to_string()).expect("short"),
            },
            late_from_round: None,
            dropped_after_round: None,
            unpaid,
            awaits_check_in: false,
        }
    }

    /// [`open_tournament`] taking check-in by `rule`
    fn checking_tournament(rule: CheckIn) -> Tournament {
        Tournament {
            check_in: rule,
            ..open_tournament()
        }
    }

    #[test]
    fn without_an_entry_fee_nobody_is_unpaid() {
        assert!(!open_tournament().owes_entry_fee(false));
        assert!(!open_tournament().owes_entry_fee(true));
    }

    #[test]
    fn with_an_entry_fee_a_participant_is_unpaid_until_marked_paid() {
        assert!(paying_tournament().owes_entry_fee(false));
        assert!(!paying_tournament().owes_entry_fee(true));
    }

    #[test]
    fn the_next_round_pairs_neither_the_unpaid_nor_the_dropped() {
        assert!(guest(false).pairable());
        assert!(!guest(true).pairable());
        let dropped = Participant {
            dropped_after_round: Some(1),
            ..guest(false)
        };
        assert!(!dropped.pairable());
    }

    #[test]
    fn without_check_in_nobody_waits_to_be_checked_in() {
        assert!(!open_tournament().awaits_check_in(false));
        assert!(!open_tournament().awaits_check_in(true));
    }

    #[test]
    fn with_check_in_a_participant_waits_until_checked_in() {
        for rule in [CheckIn::Required, CheckIn::RequiredWithDeck] {
            assert!(checking_tournament(rule).awaits_check_in(false), "{rule:?}");
            assert!(!checking_tournament(rule).awaits_check_in(true), "{rule:?}");
        }
    }

    #[test]
    fn the_next_round_leaves_out_who_waits_to_be_checked_in() {
        let waiting = Participant {
            awaits_check_in: true,
            ..guest(false)
        };
        assert!(!waiting.pairable());
    }

    #[test]
    fn only_a_tournament_with_check_in_checks_participants_in() {
        assert_eq!(
            open_tournament().check_in_refusal(true, 0, false),
            Some(CheckInRefusal::NoCheckIn)
        );
        assert_eq!(
            checking_tournament(CheckIn::Required).check_in_refusal(true, 0, false),
            None
        );
    }

    #[test]
    fn an_account_checks_in_without_a_deck_unless_the_rule_asks_for_one() {
        assert_eq!(
            checking_tournament(CheckIn::Required).check_in_refusal(true, 0, true),
            None
        );
        assert_eq!(
            checking_tournament(CheckIn::RequiredWithDeck).check_in_refusal(true, 0, true),
            Some(CheckInRefusal::NoRegisteredDeck)
        );
        assert_eq!(
            checking_tournament(CheckIn::RequiredWithDeck).check_in_refusal(true, 0, false),
            None
        );
    }

    #[test]
    fn checking_out_needs_no_deck() {
        assert_eq!(
            checking_tournament(CheckIn::RequiredWithDeck).check_in_refusal(false, 0, true),
            None
        );
    }

    #[test]
    fn once_the_first_round_started_participants_are_checked_in_but_not_out() {
        let tournament = Tournament {
            state: TournamentState::Swiss,
            ..checking_tournament(CheckIn::Required)
        };
        assert_eq!(tournament.check_in_refusal(true, 1, false), None);
        assert_eq!(
            tournament.check_in_refusal(false, 1, false),
            Some(CheckInRefusal::RoundStarted)
        );
    }

    #[test]
    fn nobody_checks_in_once_the_tournament_is_over() {
        for state in [TournamentState::Finished, TournamentState::Cancelled] {
            let tournament = Tournament {
                state,
                ..checking_tournament(CheckIn::Required)
            };
            assert_eq!(
                tournament.check_in_refusal(true, 3, false),
                Some(CheckInRefusal::TournamentOver),
                "{state:?}"
            );
        }
    }

    #[test]
    fn only_a_tournament_with_an_entry_fee_takes_payments() {
        assert_eq!(
            open_tournament().paid_refusal(),
            Some(PaidRefusal::NoEntryFee)
        );
        assert_eq!(paying_tournament().paid_refusal(), None);
    }

    #[test]
    fn payments_are_taken_until_the_tournament_is_over() {
        for (state, refusal) in [
            (TournamentState::Registration, None),
            (TournamentState::Swiss, None),
            (TournamentState::TopCut, None),
            (TournamentState::Finished, Some(PaidRefusal::TournamentOver)),
            (
                TournamentState::Cancelled,
                Some(PaidRefusal::TournamentOver),
            ),
        ] {
            let tournament = Tournament {
                state,
                ..paying_tournament()
            };
            assert_eq!(tournament.paid_refusal(), refusal, "{state:?}");
        }
    }

    #[test]
    fn an_account_signs_up_while_places_are_left() {
        assert_eq!(open_tournament().sign_up_refusal(0, false), None);
        assert_eq!(open_tournament().sign_up_refusal(7, false), None);
    }

    #[test]
    fn sign_up_is_refused_once_the_limit_is_reached() {
        let tournament = open_tournament();
        assert_eq!(
            tournament.sign_up_refusal(8, false),
            Some(SignUpRefusal::Full)
        );
        assert_eq!(
            tournament.sign_up_refusal(9, false),
            Some(SignUpRefusal::Full)
        );
    }

    #[test]
    fn without_a_limit_sign_up_stays_open() {
        let tournament = Tournament {
            participant_limit: None,
            ..open_tournament()
        };
        assert_eq!(tournament.sign_up_refusal(500, false), None);
    }

    #[test]
    fn sign_up_is_closed_unless_the_owner_enabled_it() {
        let tournament = Tournament {
            self_sign_up: false,
            ..open_tournament()
        };
        assert_eq!(
            tournament.sign_up_refusal(0, false),
            Some(SignUpRefusal::Closed)
        );
    }

    #[test]
    fn an_unlisted_tournament_takes_sign_ups_and_a_private_one_does_not() {
        let unlisted = Tournament {
            visibility: Visibility::Unlisted,
            ..open_tournament()
        };
        assert_eq!(unlisted.sign_up_refusal(0, false), None);
        let private = Tournament {
            visibility: Visibility::Private,
            ..open_tournament()
        };
        assert_eq!(
            private.sign_up_refusal(0, false),
            Some(SignUpRefusal::Closed)
        );
    }

    #[test]
    fn sign_up_closes_when_the_first_round_starts() {
        for state in [
            TournamentState::Swiss,
            TournamentState::TopCut,
            TournamentState::Finished,
            TournamentState::Cancelled,
        ] {
            let tournament = Tournament {
                state,
                ..open_tournament()
            };
            assert_eq!(
                tournament.sign_up_refusal(0, false),
                Some(SignUpRefusal::Closed),
                "{state:?}"
            );
        }
    }

    #[test]
    fn a_participant_signs_up_once() {
        let tournament = open_tournament();
        assert_eq!(
            tournament.sign_up_refusal(8, true),
            Some(SignUpRefusal::AlreadyParticipant)
        );
    }

    #[test]
    fn a_participant_drops_once_the_first_round_started() {
        for state in [TournamentState::Swiss, TournamentState::TopCut] {
            let tournament = Tournament {
                state,
                ..open_tournament()
            };
            assert_eq!(tournament.drop_refusal(1), None, "{state:?}");
            assert_eq!(tournament.drop_refusal(4), None, "{state:?}");
        }
    }

    #[test]
    fn before_the_first_round_a_participant_withdraws_instead_of_dropping() {
        assert_eq!(
            open_tournament().drop_refusal(0),
            Some(DropRefusal::NotStarted)
        );
    }

    #[test]
    fn nobody_drops_from_a_tournament_that_is_over() {
        for state in [TournamentState::Finished, TournamentState::Cancelled] {
            let tournament = Tournament {
                state,
                ..open_tournament()
            };
            assert_eq!(
                tournament.drop_refusal(3),
                Some(DropRefusal::TournamentOver),
                "{state:?}"
            );
        }
    }

    #[test]
    fn organizers_add_participants_until_the_swiss_rounds_are_over() {
        for (state, takes) in [
            (TournamentState::Registration, true),
            (TournamentState::Swiss, true),
            (TournamentState::TopCut, false),
            (TournamentState::Finished, false),
            (TournamentState::Cancelled, false),
        ] {
            let tournament = Tournament {
                state,
                ..open_tournament()
            };
            assert_eq!(tournament.takes_participants(), takes, "{state:?}");
        }
    }

    #[test]
    fn a_participant_added_after_round_n_started_plays_from_round_n_plus_one() {
        assert_eq!(late_from_round(0), None, "Round 1 pairs everybody");
        assert_eq!(late_from_round(1), Some(2));
        assert_eq!(late_from_round(5), Some(6));
    }
}
