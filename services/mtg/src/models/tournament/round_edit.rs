//! Correcting Rounds: an Organizer's own layout of the preview, and taking back an ended Round
//!
//! Like [`super::round`], every operation here expects the Tournament fetched
//! with [`Tournament::get_as_organizer_for_update`].

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use tracing::instrument;
use uuid::Uuid;

use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::db::TournamentMatchInsertPatch;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::TournamentSeatInsertPatch;
use crate::models::tournament::db::TournamentSeatModel;
use crate::models::tournament::db::round_key;
use crate::models::tournament::round::RoundRefusal;
use crate::models::tournament::round::RoundState;
use crate::tournament::layout::Layout;
use crate::tournament::layout::LayoutError;
use crate::tournament::layout::check_layout;

/// Why a preview could not be laid out as asked
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArrangeRefusal {
    /// The Tournament is Finished or Cancelled
    TournamentOver,
    /// No Round of that number is previewed
    NotPreviewed,
    /// The layout does not fit the Tournament
    Invalid(Vec<LayoutError>),
}

impl Tournament {
    /// Replace the Matches of the previewed Round `number` with `layout`
    ///
    /// Table numbers follow the order of the Matches, Seats the order within
    /// each; starting the Round starts exactly this layout.
    #[instrument(name = "Tournament::arrange_preview", skip(tx, self, layout), fields(tournament = ?self.uuid))]
    pub async fn arrange_preview(
        &self,
        tx: &mut Transaction,
        number: i16,
        layout: &Layout,
    ) -> Result<Result<(), ArrangeRefusal>, rorm::Error> {
        if self.over() {
            return Ok(Err(ArrangeRefusal::TournamentOver));
        }
        let round = round_key(self.uuid.into_inner(), number);
        let previewed = rorm::query(&mut *tx, TournamentRoundModel.uuid)
            .condition(rorm::and![
                TournamentRoundModel.uuid.equals(round),
                TournamentRoundModel.state.equals(RoundState::Previewed),
            ])
            .optional()
            .await?;
        if previewed.is_none() {
            return Ok(Err(ArrangeRefusal::NotPreviewed));
        }
        let record = self.record(tx).await?;
        let errors = check_layout(&record, layout);
        if !errors.is_empty() {
            return Ok(Err(ArrangeRefusal::Invalid(errors)));
        }

        rorm::delete(&mut *tx, TournamentMatchModel)
            .condition(TournamentMatchModel.round.equals(round))
            .await?;
        let tables = layout
            .matches
            .iter()
            .map(Vec::as_slice)
            .enumerate()
            .map(|(index, seats)| (Some(i16::try_from(index + 1).unwrap_or(i16::MAX)), seats));
        let byes = layout
            .byes
            .iter()
            .map(|bye| (None, std::slice::from_ref(bye)));
        let mut match_rows = Vec::new();
        let mut seat_rows = Vec::new();
        for (table_number, seats) in tables.chain(byes) {
            let uuid = Uuid::now_v7();
            match_rows.push(TournamentMatchInsertPatch {
                uuid,
                round: ForeignModelByField(round),
                table_number,
                games_drawn: None,
                result_state: None,
                reported_by: None,
                disputed_by: None,
            });
            for (index, participant) in seats.iter().enumerate() {
                seat_rows.push(TournamentSeatInsertPatch {
                    uuid: Uuid::now_v7(),
                    tournament_match: ForeignModelByField(uuid),
                    participant: ForeignModelByField(*participant),
                    seat: i16::try_from(index + 1).unwrap_or(i16::MAX),
                    games_won: None,
                });
            }
        }
        if !match_rows.is_empty() {
            rorm::insert(&mut *tx, TournamentMatchModel)
                .return_nothing()
                .bulk(&match_rows)
                .await?;
        }
        if !seat_rows.is_empty() {
            rorm::insert(&mut *tx, TournamentSeatModel)
                .return_nothing()
                .bulk(&seat_rows)
                .await?;
        }
        Ok(Ok(()))
    }

    /// Take back the ended Round `number`: it runs again, its Results stay
    ///
    /// Only the latest ended Round, and only while no later Round started; a
    /// previewed next Round goes, since it was paired on these Results. A
    /// Tournament its last Swiss Round finished is back in Swiss. Answers
    /// the state the Tournament is in afterwards.
    #[instrument(name = "Tournament::take_back_round", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn take_back_round(
        &self,
        tx: &mut Transaction,
        number: i16,
    ) -> Result<Result<TournamentState, RoundRefusal>, rorm::Error> {
        if self.state == TournamentState::Cancelled {
            return Ok(Err(RoundRefusal::TournamentOver));
        }
        let rounds: Vec<(i16, RoundState)> = self
            .rounds(tx, true)
            .await?
            .iter()
            .map(|round| (round.number, round.state))
            .collect();
        if let Some(refusal) = take_back_refusal(&rounds, number) {
            return Ok(Err(refusal));
        }

        self.discard_preview(tx).await?;
        rorm::update(&mut *tx, TournamentRoundModel)
            .set(TournamentRoundModel.state, RoundState::Running)
            .set(TournamentRoundModel.ended_at, None)
            .condition(
                TournamentRoundModel
                    .uuid
                    .equals(round_key(self.uuid.into_inner(), number)),
            )
            .await?;
        if self.state == TournamentState::Finished {
            rorm::update(&mut *tx, TournamentModel)
                .set(TournamentModel.state, TournamentState::Swiss)
                .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
                .await?;
            return Ok(Ok(TournamentState::Swiss));
        }
        Ok(Ok(self.state))
    }
}

/// Why the Round `number` of `rounds` (number and state each) cannot be taken back, `None` if it can
fn take_back_refusal(rounds: &[(i16, RoundState)], number: i16) -> Option<RoundRefusal> {
    let ended = rounds
        .iter()
        .any(|(round, state)| *round == number && *state == RoundState::Ended);
    if !ended {
        return Some(RoundRefusal::NotEnded);
    }
    let later_started = rounds
        .iter()
        .any(|(round, state)| *round > number && *state != RoundState::Previewed);
    later_started.then_some(RoundRefusal::LaterRoundStarted)
}

#[cfg(test)]
mod tests {
    use super::take_back_refusal;
    use crate::models::tournament::round::RoundRefusal;
    use crate::models::tournament::round::RoundState;

    #[test]
    fn the_latest_ended_round_can_be_taken_back() {
        let rounds = [(1, RoundState::Ended), (2, RoundState::Ended)];
        assert_eq!(take_back_refusal(&rounds, 2), None);
    }

    #[test]
    fn a_previewed_next_round_does_not_hold_the_take_back() {
        let rounds = [(1, RoundState::Ended), (2, RoundState::Previewed)];
        assert_eq!(take_back_refusal(&rounds, 1), None);
    }

    #[test]
    fn a_running_next_round_holds_the_take_back() {
        let rounds = [(1, RoundState::Ended), (2, RoundState::Running)];
        assert_eq!(
            take_back_refusal(&rounds, 1),
            Some(RoundRefusal::LaterRoundStarted)
        );
    }

    #[test]
    fn an_earlier_ended_round_cannot_be_taken_back() {
        let rounds = [(1, RoundState::Ended), (2, RoundState::Ended)];
        assert_eq!(
            take_back_refusal(&rounds, 1),
            Some(RoundRefusal::LaterRoundStarted)
        );
    }

    #[test]
    fn only_an_ended_round_is_taken_back() {
        let rounds = [(1, RoundState::Ended), (2, RoundState::Running)];
        assert_eq!(take_back_refusal(&rounds, 2), Some(RoundRefusal::NotEnded));
        assert_eq!(take_back_refusal(&rounds, 3), Some(RoundRefusal::NotEnded));
        let previewed = [(1, RoundState::Previewed)];
        assert_eq!(
            take_back_refusal(&previewed, 1),
            Some(RoundRefusal::NotEnded)
        );
    }
}
