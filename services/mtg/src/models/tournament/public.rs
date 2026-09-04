//! The account-less reads a share link needs, and the one roster-visibility
//! decision every surface applies afterwards
//!
//! Nothing in this file takes an actor or an account — that is deliberate,
//! not an oversight. Every other accessor in this module tree
//! ([`Tournament::role_of`], [`Tournament::get_as_organizer`],
//! [`Tournament::get_for_viewer`]) takes one and answers through a guard;
//! keeping the guard-free reads here, in a file that structurally *cannot*
//! take an actor, is what stops a handler from reaching for
//! [`get_by_share_token`] or [`roster_view`] in a spot where a guard was
//! actually owed. [`get_by_share_token`] is reachable by anyone holding the
//! link, by design — that is what a share link is. [`roster_view`] and
//! [`apply_roster_view`] are not a guard at all: they run *after* one (an
//! organizer/participant check for the ordinary authed roster read,
//! [`Visibility`] plus [`get_by_share_token`] for the share surface) and
//! decide what the roster looks like from there — see [`roster_view`]'s own
//! docs for exactly how the two stages compose.

use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;

use crate::models::tournament::ParticipantAudience;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::participant::TournamentParticipant;
use crate::models::visibility::Visibility;

/// Fetch a tournament by the secret in its share link
///
/// Mirrors [`crate::models::deck::Deck::get_by_share_token`]: the visibility
/// is folded into the condition, so a token left over on a tournament that
/// has gone private again does not resolve. This is the only function in the
/// crate allowed to turn a bare token into a [`Tournament`] — nothing else
/// may resolve one.
#[instrument(name = "public::get_by_share_token", skip(tx, token))]
pub async fn get_by_share_token(
    tx: &mut Transaction,
    token: &MaxStr<64>,
) -> Result<Option<Tournament>, rorm::Error> {
    let model = rorm::query(&mut *tx, TournamentModel)
        .condition(rorm::and![
            TournamentModel.share_token.equals(Some(token)),
            TournamentModel.visibility.equals(Visibility::Unlisted),
        ])
        .optional()
        .await?;
    Ok(model.map(Tournament::from))
}

/// What of a tournament's roster a particular viewer may see
///
/// The answer [`roster_view`] computes and [`apply_roster_view`] turns into
/// an actual list. Its own type rather than a couple of booleans, so the two
/// can only be chained in the right order, and so a `match` over it stays
/// exhaustive if the roster grows more views later.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RosterView {
    /// Every row, unredacted
    Full,
    /// Every row, but a guest's real name is replaced by a pseudonym
    Pseudonymised,
    /// Just the caller's own row, if they have one — empty otherwise
    OwnOnly,
    /// No rows at all
    Hidden,
}

/// Decide what a viewer may see of a tournament's roster
///
/// A separate, *earlier* gate already ran by the time this is called:
/// [`Visibility`] decides whether a viewer reaches the tournament at all — a
/// private event refuses a stranger long before this function is asked
/// anything, and a share token gets a stranger past [`Visibility`] but never
/// past this. Staff (`is_staff`) always get [`RosterView::Full`]. A
/// participant who is not staff gets it too, unless the tournament's audience
/// is [`ParticipantAudience::Organizers`], in which case they still see their
/// own row ([`RosterView::OwnOnly`]) rather than nothing. Everyone else — no
/// role, no row of their own — sees the roster at all only under
/// [`ParticipantAudience::Anyone`], and even then in full only once
/// `guest_names_public` opts in; short of that it is
/// [`RosterView::Pseudonymised`].
///
/// This is the one decision the ordinary authed roster read and the share
/// surface both apply — see the module docs above.
pub fn roster_view(tournament: &Tournament, is_staff: bool, is_participant: bool) -> RosterView {
    if is_staff {
        return RosterView::Full;
    }
    if is_participant {
        return if tournament.participant_audience == ParticipantAudience::Organizers {
            RosterView::OwnOnly
        } else {
            RosterView::Full
        };
    }
    match tournament.participant_audience {
        ParticipantAudience::Anyone if tournament.guest_names_public => RosterView::Full,
        ParticipantAudience::Anyone => RosterView::Pseudonymised,
        ParticipantAudience::Organizers | ParticipantAudience::Participants => RosterView::Hidden,
    }
}

/// Turn a [`RosterView`] decision into the actual rows a viewer may see
///
/// `own` is the caller's own participant row, if they have one — only
/// consulted for [`RosterView::OwnOnly`]. The pseudonym numbers
/// [`RosterView::Pseudonymised`] assigns come from [`pseudonym_ranks`],
/// computed once over every row in `participants` before anything here
/// filters or maps them — so a guest's number stays the same regardless of
/// what a caller does with the result afterwards (a search, a page, a second
/// filter downstream).
pub fn apply_roster_view(
    view: RosterView,
    own: Option<TournamentParticipantUuid>,
    participants: Vec<TournamentParticipant>,
) -> Vec<TournamentParticipant> {
    match view {
        RosterView::Full => participants,
        RosterView::OwnOnly => participants
            .into_iter()
            .filter(|participant| Some(participant.uuid) == own)
            .collect(),
        RosterView::Hidden => Vec::new(),
        RosterView::Pseudonymised => {
            let ranks = pseudonym_ranks(&participants);
            participants
                .into_iter()
                .map(|mut participant| {
                    if participant.is_guest {
                        let rank = ranks.get(&participant.uuid).copied().unwrap_or_else(|| {
                            unreachable!("ranks is built from this exact slice, one entry per row")
                        });
                        let pseudonym = MaxStr::new(format!("Gast {rank}")).unwrap_or_else(|_| {
                            unreachable!(
                                "\"Gast \" plus a rank number fits comfortably under 64 chars"
                            )
                        });
                        participant.display_name = pseudonym.clone();
                        participant.name_normalized = pseudonym;
                    }
                    participant
                })
                .collect()
        }
    }
}

/// Each participant's 1-based rank by `(seed, uuid)` ascending
///
/// The source of [`apply_roster_view`]'s pseudonym numbers, split out so the
/// ranking itself — the part that must stay stable, order-independent and
/// collision-free — has something to unit-test directly, decoupled from the
/// "Gast {n}" string it feeds. Ranked over *every* row passed in, guest and
/// account rows alike: only a guest row's rank is ever shown, but ranking the
/// whole list rather than just the guests is what keeps a number from
/// shifting depending on which slice of the same tournament a caller happens
/// to ask for. `uuid` breaks the tie between two rows that were, however
/// unlikely, minted the same seed — plain `i32` equality would collide two
/// guests onto the same number, which is exactly the "unique inside one
/// tournament" half of the guarantee this module's docs promise.
fn pseudonym_ranks(
    participants: &[TournamentParticipant],
) -> HashMap<TournamentParticipantUuid, usize> {
    let mut ordered: Vec<&TournamentParticipant> = participants.iter().collect();
    ordered.sort_unstable_by_key(|participant| (participant.seed, participant.uuid.into_inner()));

    ordered
        .into_iter()
        .enumerate()
        .map(|(index, participant)| (participant.uuid, index + 1))
        .collect()
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::models::tournament::ParticipantStatus;
    use crate::models::tournament::TournamentUuid;

    /// A minimal [`TournamentParticipant`] for the pure tests below.
    ///
    /// `uuid_seed` and `seed` are independent knobs so a test can pin exactly
    /// which one the ranking should break its tie on.
    fn participant(
        uuid_seed: u128,
        seed: i32,
        is_guest: bool,
        name: &str,
    ) -> TournamentParticipant {
        TournamentParticipant {
            uuid: TournamentParticipantUuid::from_uuid(Uuid::from_u128(uuid_seed)),
            tournament: TournamentUuid::from_uuid(Uuid::from_u128(1)),
            account: None,
            is_guest,
            display_name: MaxStr::new(name.to_owned()).unwrap(),
            name_normalized: MaxStr::new(name.to_lowercase()).unwrap(),
            status: ParticipantStatus::Registered,
            entered_round: 1,
            dropped_after_round: None,
            seed,
            manual_tiebreak: 0,
            checked_in_at: None,
            notes: None,
            registered_at: galvyn::core::re_exports::time::OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn full_view_keeps_every_row_unchanged() {
        let rows = vec![
            participant(1, 10, true, "Willi"),
            participant(2, 20, false, "Alice"),
        ];
        let out = apply_roster_view(RosterView::Full, None, rows);
        assert_eq!(out.len(), 2);
        assert_eq!(&*out[0].display_name, "Willi");
        assert_eq!(&*out[1].display_name, "Alice");
    }

    #[test]
    fn own_only_view_keeps_just_the_callers_row() {
        let mine = participant(1, 10, true, "Willi");
        let other = participant(2, 20, false, "Alice");
        let own = Some(mine.uuid);
        let out = apply_roster_view(RosterView::OwnOnly, own, vec![mine, other]);
        assert_eq!(out.len(), 1);
        assert_eq!(&*out[0].display_name, "Willi");
    }

    #[test]
    fn own_only_view_is_empty_without_an_own_row() {
        let rows = vec![participant(1, 10, true, "Willi")];
        let out = apply_roster_view(RosterView::OwnOnly, None, rows);
        assert!(out.is_empty());
    }

    #[test]
    fn hidden_view_is_always_empty() {
        let rows = vec![
            participant(1, 10, true, "Willi"),
            participant(2, 20, false, "Alice"),
        ];
        let out = apply_roster_view(RosterView::Hidden, None, rows);
        assert!(out.is_empty());
    }

    #[test]
    fn pseudonymised_view_keeps_every_row() {
        let rows = vec![
            participant(1, 10, true, "Willi"),
            participant(2, 20, false, "Alice"),
        ];
        let out = apply_roster_view(RosterView::Pseudonymised, None, rows);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn pseudonymised_view_leaves_account_rows_alone() {
        let rows = vec![participant(1, 10, false, "Alice")];
        let out = apply_roster_view(RosterView::Pseudonymised, None, rows);
        assert_eq!(&*out[0].display_name, "Alice");
        assert_eq!(&*out[0].name_normalized, "alice");
    }

    #[test]
    fn pseudonymised_view_leaks_no_real_guest_name() {
        let rows = vec![
            participant(1, 10, true, "Walk-in Willi"),
            participant(2, 20, true, "Walk-in Wanda"),
        ];
        let out = apply_roster_view(RosterView::Pseudonymised, None, rows);
        for row in &out {
            assert!(row.display_name.starts_with("Gast "));
            assert!(row.name_normalized.starts_with("Gast "));
            assert!(!row.display_name.contains("Willi"));
            assert!(!row.display_name.contains("Wanda"));
        }
    }

    #[test]
    fn pseudonymised_ranking_is_stable_and_independent_of_input_order() {
        // Three distinct seeds, so there is exactly one correct order:
        // b (seed 10) < c (seed 20) < a (seed 30).
        let a = participant(1, 30, true, "A");
        let b = participant(2, 10, true, "B");
        let c = participant(3, 20, true, "C");

        let forward = apply_roster_view(
            RosterView::Pseudonymised,
            None,
            vec![a.clone(), b.clone(), c.clone()],
        );
        let shuffled = apply_roster_view(RosterView::Pseudonymised, None, vec![c, a, b]);

        for rows in [&forward, &shuffled] {
            let by_uuid_seed = |seed: u128| {
                rows.iter()
                    .find(|row| {
                        row.uuid == TournamentParticipantUuid::from_uuid(Uuid::from_u128(seed))
                    })
                    .unwrap()
            };
            assert_eq!(&*by_uuid_seed(2).display_name, "Gast 1"); // b: lowest seed
            assert_eq!(&*by_uuid_seed(3).display_name, "Gast 2"); // c: middle seed
            assert_eq!(&*by_uuid_seed(1).display_name, "Gast 3"); // a: highest seed
        }
    }

    #[test]
    fn pseudonymised_ranking_breaks_ties_on_uuid_when_seeds_collide() {
        let low_uuid = participant(1, 42, true, "Low");
        let high_uuid = participant(2, 42, true, "High");
        let out = apply_roster_view(
            RosterView::Pseudonymised,
            None,
            vec![high_uuid.clone(), low_uuid.clone()],
        );

        let low = out.iter().find(|row| row.uuid == low_uuid.uuid).unwrap();
        let high = out.iter().find(|row| row.uuid == high_uuid.uuid).unwrap();
        assert_ne!(&*low.display_name, &*high.display_name);
        assert_eq!(&*low.display_name, "Gast 1");
        assert_eq!(&*high.display_name, "Gast 2");
    }

    #[test]
    fn pseudonymised_ranking_counts_account_rows_too() {
        // Rank is computed over the whole list, not just the guests: an
        // account row sorting first still consumes rank 1, so the guest
        // behind it is "Gast 2", not "Gast 1".
        let organizer = participant(1, 1, false, "Organizer");
        let guest = participant(2, 2, true, "Willi");
        let out = apply_roster_view(RosterView::Pseudonymised, None, vec![organizer, guest]);
        let guest_row = out.iter().find(|row| row.is_guest).unwrap();
        assert_eq!(&*guest_row.display_name, "Gast 2");
    }

    #[test]
    fn pseudonym_numbers_do_not_shift_when_a_row_is_dropped_afterwards() {
        let a = participant(1, 10, true, "A");
        let b = participant(2, 20, true, "B");
        let c = participant(3, 30, true, "C");
        let full = apply_roster_view(
            RosterView::Pseudonymised,
            None,
            vec![a.clone(), b.clone(), c.clone()],
        );

        // A caller that keeps only a subset afterwards (e.g. a search filter
        // layered on top of this function) must not see the ranks
        // recomputed over the smaller set.
        let subset: Vec<_> = full.into_iter().filter(|row| row.uuid != b.uuid).collect();
        let names: Vec<&str> = subset.iter().map(|row| &*row.display_name).collect();
        assert_eq!(names, vec!["Gast 1", "Gast 3"]);
    }

    #[test]
    fn no_real_name_survives_pseudonymisation_even_when_mixed_with_accounts() {
        let rows = vec![
            participant(1, 1, false, "Real Account Name"),
            participant(2, 2, true, "Walk-in Willi"),
            participant(3, 3, true, "Walk-in Wanda"),
        ];
        let out = apply_roster_view(RosterView::Pseudonymised, None, rows);
        let guest_names: Vec<&str> = out
            .iter()
            .filter(|row| row.is_guest)
            .map(|row| &*row.display_name)
            .collect();
        assert_eq!(guest_names, vec!["Gast 2", "Gast 3"]);
        // The account row is untouched.
        assert!(
            out.iter()
                .any(|row| &*row.display_name == "Real Account Name")
        );
    }
}
