//! Who may report or dispute a Match's Result, and what that does to it
//!
//! A Participant's report counts at once. Another Participant of the Match
//! may dispute it while the Round runs; only an Organizer settles a disputed
//! Result, and what an Organizer sets stands against the Participants. The
//! caller checks that the Round runs; these rules only weigh the Result
//! against who acts.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

use crate::tournament::record::EntrantId;

/// Where a Match's Result stands
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ResultState {
    /// Reported by a Participant of the Match; it counts, and another Participant may dispute it
    Reported,
    /// Disputed by another Participant of the Match; it holds the Round open until an Organizer settles it
    Disputed,
    /// Set by an Organizer; Participants can no longer change or dispute it
    Confirmed,
}

impl ResultState {
    /// Whether a Result in this state keeps its Round from ending
    pub fn holds_round_open(self) -> bool {
        self == Self::Disputed
    }
}

/// The Result a Match has, as far as reporting cares
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct StoredResult {
    /// Where it stands
    pub state: ResultState,
    /// The Participant who reported it, `None` when an Organizer set it
    pub reported_by: Option<EntrantId>,
}

/// What a Participant's report does
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Report {
    /// Store the reported game score as the Result, reported by that Participant
    Store,
    /// The Match has this game score already; nothing changes
    Unchanged,
}

/// Why a Participant cannot report
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ReportRefusal {
    /// The Participant does not play in the Match
    NotInMatch,
    /// Another Participant reported a different game score: dispute it instead
    ReportedByOther,
    /// The Result is disputed; an Organizer settles it
    Disputed,
    /// An Organizer set the Result
    Confirmed,
}

/// What a Participant's dispute does
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Dispute {
    /// Mark the Result disputed by that Participant
    Store,
    /// It is disputed already; nothing changes
    Unchanged,
}

/// Why a Participant cannot dispute
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum DisputeRefusal {
    /// The Participant does not play in the Match
    NotInMatch,
    /// The Match has no Result to dispute
    NoResult,
    /// The Participant reported it: report again to correct it
    OwnReport,
    /// An Organizer set the Result
    Confirmed,
}

/// What `by` reporting a game score for a Match of `seats` does
///
/// `same_score` says whether the report equals the Result there is. The
/// reporter corrects its own report; a report agreeing with the Result
/// there is changes nothing, whoever made it.
pub fn report(
    seats: &[EntrantId],
    current: Option<StoredResult>,
    by: EntrantId,
    same_score: bool,
) -> Result<Report, ReportRefusal> {
    if !seats.contains(&by) {
        return Err(ReportRefusal::NotInMatch);
    }
    let Some(current) = current else {
        return Ok(Report::Store);
    };
    match current.state {
        ResultState::Disputed => Err(ReportRefusal::Disputed),
        _ if same_score => Ok(Report::Unchanged),
        ResultState::Confirmed => Err(ReportRefusal::Confirmed),
        ResultState::Reported if current.reported_by == Some(by) => Ok(Report::Store),
        ResultState::Reported => Err(ReportRefusal::ReportedByOther),
    }
}

/// What `by` disputing the Result of a Match of `seats` does
pub fn dispute(
    seats: &[EntrantId],
    current: Option<StoredResult>,
    by: EntrantId,
) -> Result<Dispute, DisputeRefusal> {
    if !seats.contains(&by) {
        return Err(DisputeRefusal::NotInMatch);
    }
    let Some(current) = current else {
        return Err(DisputeRefusal::NoResult);
    };
    match current.state {
        ResultState::Confirmed => Err(DisputeRefusal::Confirmed),
        ResultState::Disputed => Ok(Dispute::Unchanged),
        ResultState::Reported if current.reported_by == Some(by) => Err(DisputeRefusal::OwnReport),
        ResultState::Reported => Ok(Dispute::Store),
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    /// A Participant
    fn player(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    /// The two Seats of a one-on-one Match
    fn seats() -> [EntrantId; 2] {
        [player(1), player(2)]
    }

    /// A Result `by` reported
    fn reported(by: EntrantId) -> Option<StoredResult> {
        Some(StoredResult {
            state: ResultState::Reported,
            reported_by: Some(by),
        })
    }

    /// A Result reported by `by` and disputed by the other one
    fn disputed(by: EntrantId) -> Option<StoredResult> {
        Some(StoredResult {
            state: ResultState::Disputed,
            reported_by: Some(by),
        })
    }

    /// A Result an Organizer set
    fn confirmed() -> Option<StoredResult> {
        Some(StoredResult {
            state: ResultState::Confirmed,
            reported_by: None,
        })
    }

    #[test]
    fn the_first_report_counts_at_once() {
        assert_eq!(report(&seats(), None, player(1), false), Ok(Report::Store));
    }

    #[test]
    fn only_a_participant_of_the_match_reports() {
        assert_eq!(
            report(&seats(), None, player(3), false),
            Err(ReportRefusal::NotInMatch)
        );
    }

    #[test]
    fn the_reporter_corrects_its_own_report() {
        assert_eq!(
            report(&seats(), reported(player(1)), player(1), false),
            Ok(Report::Store)
        );
    }

    #[test]
    fn the_opponent_disputes_rather_than_reporting_over_a_report() {
        assert_eq!(
            report(&seats(), reported(player(1)), player(2), false),
            Err(ReportRefusal::ReportedByOther)
        );
    }

    #[test]
    fn the_opponent_reporting_the_same_score_changes_nothing() {
        assert_eq!(
            report(&seats(), reported(player(1)), player(2), true),
            Ok(Report::Unchanged)
        );
    }

    #[test]
    fn nobody_reports_over_a_dispute() {
        for by in seats() {
            for same in [false, true] {
                assert_eq!(
                    report(&seats(), disputed(player(1)), by, same),
                    Err(ReportRefusal::Disputed)
                );
            }
        }
    }

    #[test]
    fn an_organizers_result_stands_against_a_different_report() {
        assert_eq!(
            report(&seats(), confirmed(), player(1), false),
            Err(ReportRefusal::Confirmed)
        );
        assert_eq!(
            report(&seats(), confirmed(), player(1), true),
            Ok(Report::Unchanged)
        );
    }

    #[test]
    fn another_participant_disputes_a_report() {
        assert_eq!(
            dispute(&seats(), reported(player(1)), player(2)),
            Ok(Dispute::Store)
        );
    }

    #[test]
    fn the_reporter_cannot_dispute_its_own_report() {
        assert_eq!(
            dispute(&seats(), reported(player(1)), player(1)),
            Err(DisputeRefusal::OwnReport)
        );
    }

    #[test]
    fn only_a_participant_of_the_match_disputes() {
        assert_eq!(
            dispute(&seats(), reported(player(1)), player(3)),
            Err(DisputeRefusal::NotInMatch)
        );
    }

    #[test]
    fn there_is_nothing_to_dispute_without_a_result() {
        assert_eq!(
            dispute(&seats(), None, player(2)),
            Err(DisputeRefusal::NoResult)
        );
    }

    #[test]
    fn disputing_twice_changes_nothing() {
        assert_eq!(
            dispute(&seats(), disputed(player(1)), player(2)),
            Ok(Dispute::Unchanged)
        );
    }

    #[test]
    fn an_organizers_result_cannot_be_disputed() {
        assert_eq!(
            dispute(&seats(), confirmed(), player(2)),
            Err(DisputeRefusal::Confirmed)
        );
    }

    #[test]
    fn in_a_multiplayer_match_any_other_seat_disputes() {
        let pod = [player(1), player(2), player(3), player(4)];
        for by in &pod[1..] {
            assert_eq!(dispute(&pod, reported(player(1)), *by), Ok(Dispute::Store));
        }
    }

    #[test]
    fn only_a_dispute_holds_the_round_open() {
        assert!(!ResultState::Reported.holds_round_open());
        assert!(ResultState::Disputed.holds_round_open());
        assert!(!ResultState::Confirmed.holds_round_open());
    }
}
