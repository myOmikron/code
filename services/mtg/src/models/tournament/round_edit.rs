//! Correcting Rounds: an Organizer's own layout of the preview, and taking back an ended Round
//!
//! Like [`super::round`], every operation here expects the Tournament fetched
//! with [`Tournament::lock_for_update`].

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;

use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::round_key;
use crate::models::tournament::round::Round;
use crate::models::tournament::round::RoundRefusal;
use crate::models::tournament::round::RoundStage;
use crate::models::tournament::round::RoundState;
use crate::models::tournament::round::insert_matches;
use crate::models::tournament::round::round_record;
use crate::tournament::layout::Layout;
use crate::tournament::layout::LayoutError;
use crate::tournament::layout::check_cut_layout;
use crate::tournament::layout::check_layout;
use crate::tournament::record::EntrantId;

/// Why a preview could not be laid out as asked
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArrangeRefusal {
    /// The Tournament is Finished or Cancelled
    TournamentOver,
    /// No Round of that number is previewed
    NotPreviewed,
    /// The Round is one of the Top cut, which the standings seed, and the
    /// Tournament is not entered afterwards
    TopCut,
    /// The layout does not fit the Tournament
    Invalid(Vec<LayoutError>),
}

impl Tournament {
    /// Replace the Matches of the previewed Round `number` with `layout`
    ///
    /// Table numbers follow the order of the Matches, Seats the order within
    /// each; starting the Round starts exactly this layout. The standings seed
    /// the Top cut, so its Rounds are laid out by hand only in a Tournament
    /// entered afterwards, in the shape the preview has (see [`check_cut_layout`]).
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
        if self.state == TournamentState::TopCut && !self.entered_afterwards {
            return Ok(Err(ArrangeRefusal::TopCut));
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
        let errors = if self.state == TournamentState::TopCut {
            let rounds = self.rounds(tx, true).await?;
            let mut cut = rounds
                .iter()
                .filter(|round| round.stage == RoundStage::TopCut);
            let first = cut.next();
            let preview = rounds
                .iter()
                .find(|round| round.number == number)
                .map(cut_layout)
                .unwrap_or_else(|| Layout {
                    matches: Vec::new(),
                    byes: Vec::new(),
                });
            let first: Option<Vec<EntrantId>> =
                first.filter(|first| first.number != number).map(|first| {
                    let layout = cut_layout(first);
                    layout
                        .matches
                        .into_iter()
                        .flatten()
                        .chain(layout.byes)
                        .collect()
                });
            check_cut_layout(&record, &preview, first.as_deref(), layout)
        } else {
            check_layout(&record, layout)
        };
        if !errors.is_empty() {
            return Ok(Err(ArrangeRefusal::Invalid(errors)));
        }

        rorm::delete(&mut *tx, TournamentMatchModel)
            .condition(TournamentMatchModel.round.equals(round))
            .await?;
        let tables: Vec<&[EntrantId]> = layout.matches.iter().map(Vec::as_slice).collect();
        insert_matches(tx, round, &tables, &layout.byes).await?;
        Ok(Ok(()))
    }

    /// Take back the ended Round `number`: it runs again, its Results stay
    ///
    /// Only the latest ended Round, and only while no later Round started; a
    /// previewed next Round goes, since it was paired on these Results. Its
    /// round timer goes too: it ran out or was cut short while the Round was
    /// over, so the Round runs on without a clock. The
    /// Tournament goes back to the part the Round belongs to: Swiss for a
    /// Swiss Round (also out of the Top cut or Finished), Top cut for a Top
    /// cut Round. Answers the state the Tournament is in afterwards.
    #[instrument(name = "Tournament::take_back_round", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn take_back_round(
        &self,
        tx: &mut Transaction,
        number: i16,
    ) -> Result<Result<TournamentState, RoundRefusal>, rorm::Error> {
        if self.state == TournamentState::Cancelled {
            return Ok(Err(RoundRefusal::TournamentOver));
        }
        let rounds = self.rounds(tx, true).await?;
        let states: Vec<(i16, RoundState)> = rounds
            .iter()
            .map(|round| (round.number, round.state))
            .collect();
        if let Some(refusal) = take_back_refusal(&states, number) {
            return Ok(Err(refusal));
        }
        let stage = rounds
            .iter()
            .find(|round| round.number == number)
            .map_or(RoundStage::Swiss, |round| round.stage);

        self.discard_preview(tx).await?;
        rorm::update(&mut *tx, TournamentRoundModel)
            .set(TournamentRoundModel.state, RoundState::Running)
            .set(TournamentRoundModel.ended_at, None)
            .set(TournamentRoundModel.timer_seconds, None)
            .set(TournamentRoundModel.timer_ends_at, None)
            .condition(
                TournamentRoundModel
                    .uuid
                    .equals(round_key(self.uuid.into_inner(), number)),
            )
            .await?;
        let state = state_after_take_back(stage);
        if state != self.state {
            rorm::update(&mut *tx, TournamentModel)
                .set(TournamentModel.state, state)
                .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
                .await?;
        }
        Ok(Ok(state))
    }
}

/// The Matches and Byes of `round` as a layout
fn cut_layout(round: &Round) -> Layout {
    let record = round_record(round);
    Layout {
        matches: record
            .matches
            .into_iter()
            .map(|played| played.seats)
            .collect(),
        byes: record.byes,
    }
}

/// The state a Tournament is in once a Round of `stage` runs again
fn state_after_take_back(stage: RoundStage) -> TournamentState {
    match stage {
        RoundStage::Swiss => TournamentState::Swiss,
        RoundStage::TopCut => TournamentState::TopCut,
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
    use super::state_after_take_back;
    use super::take_back_refusal;
    use crate::models::tournament::TournamentState;
    use crate::models::tournament::round::RoundRefusal;
    use crate::models::tournament::round::RoundStage;
    use crate::models::tournament::round::RoundState;

    #[test]
    fn a_taken_back_round_reopens_the_part_it_belongs_to() {
        assert_eq!(
            state_after_take_back(RoundStage::Swiss),
            TournamentState::Swiss
        );
        assert_eq!(
            state_after_take_back(RoundStage::TopCut),
            TournamentState::TopCut
        );
    }

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
