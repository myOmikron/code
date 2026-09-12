//! What happened at a table, out of everything anybody said about it
//!
//! Pure, like the rest of [`super`]. The desk and the players share one state
//! machine without either of them owning it: a stored [`MatchStatus`] is
//! written on every change and **never read back as truth**, because the truth
//! is the report rows plus whatever the desk wrote, and deriving it every time
//! is what keeps forty phones and one laptop from disagreeing.
//!
//! [`MatchStatus`]: crate::models::tournament::MatchStatus

use uuid::Uuid;

/// Whoever occupies one seat — a participant today, a team later
pub type EntrantId = Uuid;

/// How many seats have to say the same thing before a table is settled
///
/// Two, for a pod of five as much as for a duel. Demanding every seat is not
/// how a room works — somebody always walks off to get a drink — and the desk
/// can override whatever two people agreed on anyway.
pub const REQUIRED_AGREEMENTS: usize = 2;

/// What somebody says happened at a table
///
/// Compared whole, game score included: game wins feed the tiebreakers, so two
/// players who agree on the winner and disagree on whether it was 2–0 or 2–1
/// have not agreed on the result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Outcome {
    /// Who won, `None` for a draw
    pub winner: Option<EntrantId>,
    /// Whether the match was drawn
    pub draw: bool,
    /// Games the winner took
    pub winner_games: i16,
    /// Games the loser took
    pub loser_games: i16,
    /// Games inside the match that were themselves drawn
    pub games_drawn: i16,
}

/// One seat's claim about their own table
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Claim {
    /// Which seat filed it
    pub by: EntrantId,
    /// What they say happened
    pub outcome: Outcome,
}

/// Everything known about one table
#[derive(Debug, Clone, Copy)]
pub struct MatchInput<'a> {
    /// Whether the table is a bye rather than a table anybody sat at
    pub is_bye: bool,
    /// Who is seated there
    pub seats: &'a [EntrantId],
    /// What the desk wrote itself, if it wrote anything
    pub organizer: Option<Outcome>,
    /// What the seats have said
    pub claims: &'a [Claim],
}

/// Where a table's result stands
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchState {
    /// Nobody has said anything
    Unreported,
    /// Somebody has, and nobody has agreed with them yet
    Pending(Outcome),
    /// Agreed between the seats, or ruled on by the desk
    Confirmed(Outcome),
    /// Two seats say different things; the desk has to rule
    Disputed,
}

/// Work out where a table stands
///
/// Resolution order, with **disagreement beating agreement**: a bye is settled
/// the moment it is dealt; the desk's own result beats everything and does not
/// consult the reports at all; claims from anybody not seated there are
/// dropped; nothing said leaves it unreported; any two claims differing at all
/// disputes it, even if two others agree; otherwise enough agreement confirms
/// it and anything less is pending.
///
/// @param input everything known about the table
///
/// @returns where it stands
pub fn resolve(input: &MatchInput<'_>) -> MatchState {
    if input.is_bye {
        // Nobody played it, so there is nothing for anybody to report and no
        // reason to leave it open.
        return MatchState::Confirmed(Outcome {
            winner: input.seats.first().copied(),
            draw: false,
            winner_games: 0,
            loser_games: 0,
            games_drawn: 0,
        });
    }
    if let Some(outcome) = input.organizer {
        return MatchState::Confirmed(outcome);
    }

    // A claim from somebody who is not at this table, or naming a winner who is
    // not, says nothing about it. Dropped rather than disputed: a stale phone
    // should not be able to hold up a table it is not sitting at.
    let claims: Vec<&Claim> = input
        .claims
        .iter()
        .filter(|claim| input.seats.contains(&claim.by))
        .filter(|claim| {
            claim
                .outcome
                .winner
                .is_none_or(|winner| input.seats.contains(&winner))
        })
        .collect();

    let Some(first) = claims.first() else {
        return MatchState::Unreported;
    };
    if claims.iter().any(|claim| claim.outcome != first.outcome) {
        return MatchState::Disputed;
    }
    if claims.len() >= REQUIRED_AGREEMENTS {
        return MatchState::Confirmed(first.outcome);
    }
    MatchState::Pending(first.outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One of the players at the table
    ///
    /// @param n which one
    ///
    /// @returns their id
    fn seat(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    /// A two-nil win for `winner`
    ///
    /// @param winner who took it
    ///
    /// @returns the outcome
    fn win(winner: EntrantId) -> Outcome {
        Outcome {
            winner: Some(winner),
            draw: false,
            winner_games: 2,
            loser_games: 0,
            games_drawn: 0,
        }
    }

    /// A drawn match
    ///
    /// @returns the outcome
    fn drawn() -> Outcome {
        Outcome {
            winner: None,
            draw: true,
            winner_games: 1,
            loser_games: 1,
            games_drawn: 1,
        }
    }

    /// A table of two, with whatever has been said about it
    ///
    /// @param seats who is there
    /// @param claims what they said
    ///
    /// @returns the input
    fn table<'a>(seats: &'a [EntrantId], claims: &'a [Claim]) -> MatchInput<'a> {
        MatchInput {
            is_bye: false,
            seats,
            organizer: None,
            claims,
        }
    }

    #[test]
    fn a_bye_is_settled_the_moment_it_is_dealt() {
        let seats = [seat(1)];
        let state = resolve(&MatchInput {
            is_bye: true,
            seats: &seats,
            organizer: None,
            claims: &[],
        });
        assert!(matches!(
            state,
            MatchState::Confirmed(Outcome { winner: Some(w), .. }) if w == seat(1)
        ));
    }

    #[test]
    fn nobody_reporting_leaves_the_table_unreported() {
        let seats = [seat(1), seat(2)];
        assert_eq!(resolve(&table(&seats, &[])), MatchState::Unreported);
    }

    #[test]
    fn one_report_leaves_the_table_pending() {
        let seats = [seat(1), seat(2)];
        let claims = [Claim {
            by: seat(1),
            outcome: win(seat(1)),
        }];
        assert_eq!(
            resolve(&table(&seats, &claims)),
            MatchState::Pending(win(seat(1)))
        );
    }

    #[test]
    fn two_seats_agreeing_confirms_the_table() {
        let seats = [seat(1), seat(2)];
        let claims = [
            Claim {
                by: seat(1),
                outcome: win(seat(1)),
            },
            Claim {
                by: seat(2),
                outcome: win(seat(1)),
            },
        ];
        assert_eq!(
            resolve(&table(&seats, &claims)),
            MatchState::Confirmed(win(seat(1)))
        );
    }

    #[test]
    fn two_seats_disagreeing_disputes_it() {
        let seats = [seat(1), seat(2)];
        let claims = [
            Claim {
                by: seat(1),
                outcome: win(seat(1)),
            },
            Claim {
                by: seat(2),
                outcome: win(seat(2)),
            },
        ];
        assert_eq!(resolve(&table(&seats, &claims)), MatchState::Disputed);
    }

    #[test]
    fn a_third_seat_disagreeing_disputes_what_two_already_agreed() {
        let seats = [seat(1), seat(2), seat(3), seat(4)];
        let claims = [
            Claim {
                by: seat(1),
                outcome: win(seat(1)),
            },
            Claim {
                by: seat(2),
                outcome: win(seat(1)),
            },
            Claim {
                by: seat(3),
                outcome: win(seat(3)),
            },
        ];
        assert_eq!(resolve(&table(&seats, &claims)), MatchState::Disputed);
    }

    #[test]
    fn two_of_four_agreeing_is_enough_for_a_pod() {
        let seats = [seat(1), seat(2), seat(3), seat(4)];
        let claims = [
            Claim {
                by: seat(2),
                outcome: win(seat(4)),
            },
            Claim {
                by: seat(3),
                outcome: win(seat(4)),
            },
        ];
        assert_eq!(
            resolve(&table(&seats, &claims)),
            MatchState::Confirmed(win(seat(4)))
        );
    }

    #[test]
    fn a_disagreement_about_the_game_score_is_still_a_disagreement() {
        let seats = [seat(1), seat(2)];
        let closer = Outcome {
            loser_games: 1,
            ..win(seat(1))
        };
        let claims = [
            Claim {
                by: seat(1),
                outcome: win(seat(1)),
            },
            Claim {
                by: seat(2),
                outcome: closer,
            },
        ];
        assert_eq!(resolve(&table(&seats, &claims)), MatchState::Disputed);
    }

    #[test]
    fn the_desk_beats_every_report_without_consulting_them() {
        let seats = [seat(1), seat(2)];
        let claims = [
            Claim {
                by: seat(1),
                outcome: win(seat(1)),
            },
            Claim {
                by: seat(2),
                outcome: win(seat(2)),
            },
        ];
        let state = resolve(&MatchInput {
            organizer: Some(drawn()),
            ..table(&seats, &claims)
        });
        assert_eq!(state, MatchState::Confirmed(drawn()));
    }

    #[test]
    fn ignores_a_report_from_somebody_not_at_the_table() {
        let seats = [seat(1), seat(2)];
        let claims = [
            Claim {
                by: seat(1),
                outcome: win(seat(1)),
            },
            Claim {
                by: seat(9),
                outcome: win(seat(2)),
            },
        ];
        assert_eq!(
            resolve(&table(&seats, &claims)),
            MatchState::Pending(win(seat(1))),
            "a stale phone must not hold up a table it is not sitting at"
        );
    }

    #[test]
    fn ignores_a_report_naming_a_winner_who_is_not_there() {
        let seats = [seat(1), seat(2)];
        let claims = [Claim {
            by: seat(1),
            outcome: win(seat(7)),
        }];
        assert_eq!(resolve(&table(&seats, &claims)), MatchState::Unreported);
    }

    #[test]
    fn reads_an_agreed_draw_as_confirmed() {
        let seats = [seat(1), seat(2)];
        let claims = [
            Claim {
                by: seat(1),
                outcome: drawn(),
            },
            Claim {
                by: seat(2),
                outcome: drawn(),
            },
        ];
        assert_eq!(
            resolve(&table(&seats, &claims)),
            MatchState::Confirmed(drawn())
        );
    }
}
