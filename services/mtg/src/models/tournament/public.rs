//! Guard-free reads for share links, and the roster-visibility decision applied after a guard

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

/// Fetch a tournament by its share-link secret; only resolves while [`Visibility::Unlisted`]
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

/// Decide what a viewer may see of a tournament's roster; runs after the visibility gate
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

/// Turn a [`RosterView`] into the rows a viewer may see; pass the full roster, ranks span it
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

/// Each participant's 1-based rank by `(seed, uuid)`, over every row so pseudonyms stay stable
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
            fixed_table: None,
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
        assert!(
            out.iter()
                .any(|row| &*row.display_name == "Real Account Name")
        );
    }
}
