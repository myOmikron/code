//! Guests that sign themselves up, and the Guest seats their sessions hold
//!
//! Where a Tournament allows Guest sign-up, a visitor without an Account
//! becomes a Guest at once (ADR 0007). Its session then holds a Guest seat
//! for that Tournament, which [`Tournament::get_granted`] reads like an
//! Account's participation. A [`RecoveryCode`], of which only the hash is
//! kept, restores the seat into a fresh session until the Tournament is over.

use std::collections::HashSet;

use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::rorm;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Deserialize;
use serde::Serialize;
use subtle::ConstantTimeEq;
use tracing::instrument;
use uuid::Uuid;

use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentParticipantInsertPatch;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::life_history::digest;
use crate::models::tournament::participant::Participant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::participant::Player;
use crate::models::tournament::participant::SignUpRefusal;
use crate::models::tournament::settings::CheckIn;

/// Session key holding the Guest seats, a list of Tournament and Participant pairs
///
/// Renaming it or changing the format of its value drops every seat held.
const SEATS: &str = "tournament_guest_seats";

/// How many Guest seats one session holds at most; the oldest goes first
pub const MAX_SEATS: usize = 16;

/// How many characters a Recovery code has: 62 letters and digits each, about 190 bits
const RECOVERY_CODE_LEN: usize = 32;

/// One Guest seat: the Guest a session acts as in one Tournament
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
struct Seat {
    /// The Tournament
    tournament: Uuid,
    /// The Guest's Participant
    participant: Uuid,
}

/// The Guest seats one session holds, at most one per Tournament, oldest first
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GuestSeats(Vec<Seat>);

impl GuestSeats {
    /// The seats `session` holds
    pub async fn of<E>(session: &Session) -> Result<Self, ApiError<E>> {
        let seats = session
            .get::<Vec<Seat>>(SEATS)
            .await
            .map_err(ApiError::map_server_error("Failed to read the session"))?;
        Ok(Self(seats.unwrap_or_default()))
    }

    /// The seats `session` holds as the store has them now, not as the request read them
    ///
    /// For a writer under the roster lock: a request of the same session
    /// that held the lock before stored its seat before it let go, see
    /// [`Self::hold`], while this request may have read the session earlier.
    pub async fn current<E>(session: &Session) -> Result<Self, ApiError<E>> {
        session
            .load()
            .await
            .map_err(ApiError::map_server_error("Failed to read the session"))?;
        Self::of(session).await
    }

    /// The Guest whose seat these hold in `tournament`, `None` for none
    ///
    /// Unchecked: the Guest may have withdrawn or been removed since, see
    /// [`Tournament::guest_of_seat`].
    pub fn seat_in(&self, tournament: TournamentUuid) -> Option<ParticipantUuid> {
        self.0
            .iter()
            .find(|seat| seat.tournament == tournament.into_inner())
            .map(|seat| ParticipantUuid::new(seat.participant))
    }

    /// These seats with `participant` held in `tournament`, without those of the Tournaments in `over`
    ///
    /// A seat held before in `tournament` is replaced. Past [`MAX_SEATS`] the
    /// oldest seats go.
    fn holding(
        mut self,
        tournament: TournamentUuid,
        participant: ParticipantUuid,
        over: &HashSet<Uuid>,
    ) -> Self {
        self.0.retain(|seat| {
            seat.tournament != tournament.into_inner() && !over.contains(&seat.tournament)
        });
        self.0.push(Seat {
            tournament: tournament.into_inner(),
            participant: participant.into_inner(),
        });
        let excess = self.0.len().saturating_sub(MAX_SEATS);
        self.0.drain(..excess);
        self
    }

    /// These seats without the one of `participant` in `tournament`
    fn releasing(mut self, tournament: TournamentUuid, participant: ParticipantUuid) -> Self {
        self.0.retain(|seat| {
            seat.tournament != tournament.into_inner()
                || seat.participant != participant.into_inner()
        });
        self
    }

    /// Hold the seat of `participant` in `tournament` in `session`
    ///
    /// Drops the seats of Tournaments that are over or gone on the way, read
    /// in `tx`.
    pub async fn hold<E>(
        session: &Session,
        tx: &mut Transaction,
        tournament: TournamentUuid,
        participant: ParticipantUuid,
    ) -> Result<(), ApiError<E>> {
        let seats = Self::of(session).await?;
        let over = seats.ended(tx).await?;
        seats
            .holding(tournament, participant, &over)
            .write(session)
            .await
    }

    /// Let go of the seat of `participant` in `tournament` in `session`, if it is held
    pub async fn release<E>(
        session: &Session,
        tournament: TournamentUuid,
        participant: ParticipantUuid,
    ) -> Result<(), ApiError<E>> {
        let seats = Self::of(session).await?;
        let released = seats.clone().releasing(tournament, participant);
        if released == seats {
            return Ok(());
        }
        released.write(session).await
    }

    /// The Tournaments of these seats that are over or gone
    async fn ended(&self, tx: &mut Transaction) -> Result<HashSet<Uuid>, rorm::Error> {
        if self.0.is_empty() {
            return Ok(HashSet::new());
        }
        let found = rorm::query(&mut *tx, (TournamentModel.uuid, TournamentModel.state))
            .condition(DynamicCollection::or_unchecked(
                self.0
                    .iter()
                    .map(|seat| TournamentModel.uuid.equals(seat.tournament))
                    .collect(),
            ))
            .all()
            .await?;
        let running: HashSet<Uuid> = found
            .into_iter()
            .filter(|(_, state)| {
                !matches!(
                    state,
                    TournamentState::Finished | TournamentState::Cancelled
                )
            })
            .map(|(uuid, _)| uuid)
            .collect();
        Ok(self
            .0
            .iter()
            .map(|seat| seat.tournament)
            .filter(|tournament| !running.contains(tournament))
            .collect())
    }

    /// Store these seats in `session`
    ///
    /// Saved to the store at once, through its own connection, not when the
    /// response goes out: the caller still holds the roster lock, and the
    /// next request of the session waiting for it must find the seat.
    async fn write<E>(self, session: &Session) -> Result<(), ApiError<E>> {
        session
            .insert(SEATS, self.0)
            .await
            .map_err(ApiError::map_server_error("Failed to write the session"))?;
        session
            .save()
            .await
            .map_err(ApiError::map_server_error("Failed to save the session"))
    }
}

/// The secret a Guest seat is restored with in a fresh session
///
/// Handed to the device once; only its [`Self::hash`] is kept.
#[derive(Debug, Clone)]
pub struct RecoveryCode(String);

impl RecoveryCode {
    /// A new random Recovery code
    pub fn generate() -> Self {
        Self(Alphanumeric.sample_string(&mut rand::rng(), RECOVERY_CODE_LEN))
    }

    /// The code as the device keeps it
    pub fn into_inner(self) -> String {
        self.0
    }

    /// The hash kept instead of the code
    pub fn hash(&self) -> MaxStr<64> {
        digest(self.0.as_bytes())
    }
}

/// Whether `code` is the Recovery code whose hash is `stored`, in constant time
pub fn recovery_code_matches(code: &str, stored: &str) -> bool {
    digest(code.as_bytes())
        .as_bytes()
        .ct_eq(stored.as_bytes())
        .into()
}

/// Why a Guest seat could not be restored
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryRefusal {
    /// The Tournament is Finished or Cancelled, so its Recovery codes are gone
    TournamentOver,
    /// No Guest of the Tournament has this Recovery code
    UnknownCode,
}

impl Tournament {
    /// Whether visitors may sign up as Guests right now, as far as the settings go
    ///
    /// Needs Guest sign-up and Check-in on top of what Self sign-up needs, see
    /// [`Self::guest_sign_up_refusal`].
    fn guest_sign_up_open(&self) -> bool {
        self.guest_sign_up && self.check_in != CheckIn::Off
    }

    /// Why a visitor may not sign up as a Guest, `None` if it may
    ///
    /// `participants` counts every Participant there is, like for
    /// [`Self::sign_up_refusal`]: the participant limit holds for Guests too.
    pub fn guest_sign_up_refusal(&self, participants: u64) -> Option<SignUpRefusal> {
        if !self.guest_sign_up_open() {
            return Some(SignUpRefusal::Closed);
        }
        self.sign_up_refusal(participants, false)
    }

    /// The Guest of this Tournament the seat of `participant` holds, `None` if it is gone
    ///
    /// Only a Guest: a seat never stands for an Account's Participant.
    #[instrument(name = "Tournament::guest_of_seat", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn guest_of_seat(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<Option<ParticipantUuid>, rorm::Error> {
        let found = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
            .condition(rorm::and![
                TournamentParticipantModel
                    .uuid
                    .equals(participant.into_inner()),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentParticipantModel.account.is_none(),
            ])
            .optional()
            .await?;
        Ok(found.map(ParticipantUuid::new))
    }

    /// The Guest `participant` of this Tournament, `None` if it is none
    #[instrument(name = "Tournament::guest", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn guest(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<Option<Participant>, rorm::Error> {
        let row = rorm::query(&mut *tx, TournamentParticipantModel)
            .condition(rorm::and![
                TournamentParticipantModel
                    .uuid
                    .equals(participant.into_inner()),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentParticipantModel.account.is_none(),
            ])
            .optional()
            .await?;
        Ok(row.and_then(|row| {
            Some(Participant {
                uuid: participant,
                player: Player::Guest {
                    name: row.guest_name?,
                },
                late_from_round: row.late_from_round,
                dropped_after_round: row.dropped_after_round,
                unpaid: self.owes_entry_fee(row.paid),
                awaits_check_in: self.awaits_check_in(row.checked_in),
            })
        }))
    }

    /// Add a Guest that signed itself up as `name`, keeping the hash of its Recovery code
    ///
    /// Only in Registration, see [`Self::guest_sign_up_refusal`]. The caller
    /// holds [`Self::lock_roster`].
    #[instrument(name = "Tournament::add_signed_up_guest", skip(tx, self, code), fields(tournament = ?self.uuid))]
    pub async fn add_signed_up_guest(
        &self,
        tx: &mut Transaction,
        name: MaxStr<64>,
        code: &RecoveryCode,
    ) -> Result<ParticipantUuid, rorm::Error> {
        let uuid = Uuid::now_v7();
        rorm::insert(&mut *tx, TournamentParticipantModel)
            .return_nothing()
            .single(&TournamentParticipantInsertPatch {
                uuid,
                tournament: ForeignModelByField(self.uuid.into_inner()),
                account: None,
                guest_name: Some(name),
                recovery_code_hash: Some(code.hash()),
                late_from_round: None,
                paid: false,
                checked_in: false,
            })
            .await?;
        self.discard_preview(tx).await?;
        Ok(ParticipantUuid::new(uuid))
    }

    /// Replace the Recovery code of the Guest `participant` by `code`
    ///
    /// Once the Tournament is over no code is kept, so none is replaced either.
    #[instrument(name = "Tournament::renew_recovery_code", skip(tx, self, code), fields(tournament = ?self.uuid))]
    pub async fn renew_recovery_code(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        code: &RecoveryCode,
    ) -> Result<(), rorm::Error> {
        if self.over() {
            return Ok(());
        }
        rorm::update(&mut *tx, TournamentParticipantModel)
            .set(
                TournamentParticipantModel.recovery_code_hash,
                Some(code.hash()),
            )
            .condition(rorm::and![
                TournamentParticipantModel
                    .uuid
                    .equals(participant.into_inner()),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentParticipantModel.account.is_none(),
            ])
            .await?;
        Ok(())
    }

    /// The Guest `participant`, if `code` is its Recovery code
    #[instrument(name = "Tournament::recover_guest", skip(tx, self, code), fields(tournament = ?self.uuid))]
    pub async fn recover_guest(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
        code: &str,
    ) -> Result<Result<ParticipantUuid, RecoveryRefusal>, rorm::Error> {
        if self.over() {
            return Ok(Err(RecoveryRefusal::TournamentOver));
        }
        let stored = rorm::query(&mut *tx, TournamentParticipantModel.recovery_code_hash)
            .condition(rorm::and![
                TournamentParticipantModel
                    .uuid
                    .equals(participant.into_inner()),
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentParticipantModel.account.is_none(),
            ])
            .optional()
            .await?
            .flatten();
        match stored {
            Some(stored) if recovery_code_matches(code, &stored) => Ok(Ok(participant)),
            _ => Ok(Err(RecoveryRefusal::UnknownCode)),
        }
    }

    /// Forget every Recovery code of this Tournament, once it is Finished or Cancelled
    #[instrument(name = "Tournament::forget_recovery_codes", skip(tx, self), fields(tournament = ?self.uuid))]
    pub(in crate::models::tournament) async fn forget_recovery_codes(
        &self,
        tx: &mut Transaction,
    ) -> Result<(), rorm::Error> {
        rorm::update(&mut *tx, TournamentParticipantModel)
            .set(TournamentParticipantModel.recovery_code_hash, None)
            .condition(rorm::and![
                TournamentParticipantModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentParticipantModel.recovery_code_hash.is_some(),
            ])
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use uuid::Uuid;

    use super::GuestSeats;
    use super::MAX_SEATS;
    use super::RecoveryCode;
    use super::recovery_code_matches;
    use crate::models::tournament::TournamentUuid;
    use crate::models::tournament::participant::ParticipantUuid;

    fn tournament(n: u128) -> TournamentUuid {
        TournamentUuid(Uuid::from_u128(n))
    }

    fn participant(n: u128) -> ParticipantUuid {
        ParticipantUuid::new(Uuid::from_u128(n))
    }

    #[test]
    fn a_session_holds_one_seat_per_tournament() {
        let seats = GuestSeats::default()
            .holding(tournament(1), participant(10), &HashSet::new())
            .holding(tournament(1), participant(11), &HashSet::new());
        assert_eq!(seats.seat_in(tournament(1)), Some(participant(11)));
        assert_eq!(seats.0.len(), 1);
    }

    #[test]
    fn a_seat_counts_only_in_its_own_tournament() {
        let seats = GuestSeats::default().holding(tournament(1), participant(10), &HashSet::new());
        assert_eq!(seats.seat_in(tournament(2)), None);
    }

    #[test]
    fn taking_a_seat_drops_the_seats_of_tournaments_that_are_over() {
        let over = HashSet::from([tournament(1).into_inner()]);
        let seats = GuestSeats::default()
            .holding(tournament(1), participant(10), &HashSet::new())
            .holding(tournament(2), participant(20), &over);
        assert_eq!(seats.seat_in(tournament(1)), None);
        assert_eq!(seats.seat_in(tournament(2)), Some(participant(20)));
    }

    #[test]
    fn past_the_most_seats_the_oldest_goes() {
        let mut seats = GuestSeats::default();
        for n in 0..=MAX_SEATS as u128 {
            seats = seats.holding(tournament(n), participant(n), &HashSet::new());
        }
        assert_eq!(seats.0.len(), MAX_SEATS);
        assert_eq!(seats.seat_in(tournament(0)), None);
        assert_eq!(
            seats.seat_in(tournament(MAX_SEATS as u128)),
            Some(participant(MAX_SEATS as u128))
        );
    }

    #[test]
    fn releasing_lets_go_only_of_the_seat_of_that_guest() {
        let seats = GuestSeats::default().holding(tournament(1), participant(10), &HashSet::new());
        assert_eq!(
            seats
                .clone()
                .releasing(tournament(1), participant(11))
                .seat_in(tournament(1)),
            Some(participant(10))
        );
        assert_eq!(
            seats
                .releasing(tournament(1), participant(10))
                .seat_in(tournament(1)),
            None
        );
    }

    #[test]
    fn a_recovery_code_matches_its_hash_and_nothing_else() {
        let code = RecoveryCode::generate();
        let hash = code.hash();
        assert!(recovery_code_matches(&code.clone().into_inner(), &hash));
        assert!(!recovery_code_matches(
            &RecoveryCode::generate().into_inner(),
            &hash
        ));
        assert!(!recovery_code_matches("", &hash));
    }

    #[test]
    fn a_recovery_code_has_more_than_128_bits() {
        let code = RecoveryCode::generate().into_inner();
        let bits = code.len() as f64 * 62_f64.log2();
        assert!(bits > 128.0, "{bits}");
        assert!(code.bytes().all(|byte| byte.is_ascii_alphanumeric()));
    }
}
