//! A tournament roster's cross-actor listing: every event one account or guest may see at once
//!
//! Raw SQL for the account branch only, and only there: "owned, co-organized
//! or played-in" spans three tables that a single rorm condition cannot
//! express as one set, the same reasoning as [`crate::models::deck::listing`]
//! reaches for a printing join. A guest's session holds a handful of
//! participant uuids at most, so that branch stays plain queries plus an
//! in-memory sort — hand-writing the equivalent SQL would cost more than it
//! saves.

use std::cmp::Reverse;
use std::collections::HashSet;

use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentRole;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentParticipantModel;

/// One row of a tournament listing: the event plus what this viewer is to it
#[derive(Debug, Clone)]
pub struct TournamentListEntry {
    /// The tournament itself
    pub tournament: Tournament,
    /// The viewer's staff role, `None` for a plain participant or a guest
    pub role: Option<TournamentRole>,
    /// The viewer's own participant row, if they have one
    pub participant: Option<TournamentParticipantUuid>,
    /// How many people are on the roster
    pub participant_count: i64,
}

/// Every tournament `actor` may see in a list
///
/// For an account: owned ∪ co-organized ∪ playing-in. For a guest: the
/// tournaments of the participant rows their session holds. No paging — a
/// person's events are few enough that handing over the whole list is
/// cheaper than a second round trip per page.
#[instrument(name = "TournamentListEntry::list_for_actor", skip(tx, actor))]
pub async fn list_for_actor(
    tx: &mut Transaction,
    actor: &TournamentActor,
) -> Result<Vec<TournamentListEntry>, rorm::Error> {
    match actor {
        TournamentActor::Account(account) => list_for_account(tx, account.uuid).await,
        TournamentActor::Guest(participants) => list_for_guest(tx, participants).await,
    }
}

/// [`list_for_actor`]'s branch for a logged-in account
///
/// One statement: a `UNION` of the three ways an account relates to a
/// tournament, joined back to `tournament` for the ordering columns and to a
/// grouped count of `tournament_participant` for the roster size — the same
/// "one raw read for the whole list" shape as
/// [`crate::models::deck::listing::DeckSummary::read_for_account`]. The
/// per-tournament role and own-participant lookups stay ordinary queries
/// afterwards: reusing [`Tournament::role_of`] here is one query more than
/// folding it into the statement above would cost, in exchange for never
/// having two implementations of "what role does this account hold" to keep
/// in sync.
#[instrument(name = "listing::list_for_account", skip(tx))]
async fn list_for_account(
    tx: &mut Transaction,
    account: AccountUuid,
) -> Result<Vec<TournamentListEntry>, rorm::Error> {
    let statement = "SELECT u.tournament AS tournament, COALESCE(pc.participant_count, 0) AS participant_count \
         FROM ( \
             SELECT uuid AS tournament FROM tournament WHERE owner = $1 \
             UNION \
             SELECT tournament FROM tournament_organizer WHERE account = $1 \
             UNION \
             SELECT tournament FROM tournament_participant WHERE account = $1 \
         ) u \
         JOIN tournament t ON t.uuid = u.tournament \
         LEFT JOIN ( \
             SELECT tournament, COUNT(*) AS participant_count \
             FROM tournament_participant \
             GROUP BY tournament \
         ) pc ON pc.tournament = u.tournament \
         ORDER BY t.starts_at DESC NULLS LAST, t.created_at DESC"
        .to_string();

    let rows = (&mut *tx)
        .execute::<All>(statement, vec![Value::Uuid(account.into_inner())])
        .await?;

    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
        let tournament = TournamentUuid::from_uuid(row.get("tournament").map_err(decode)?);
        let participant_count: i64 = row.get("participant_count").map_err(decode)?;

        // The listing statement above only proves an account touched this
        // tournament at some point; `Tournament::fetch` is still the one
        // place allowed to read the row itself, per the module's guard
        // discipline.
        let Some(model) = Tournament::fetch(&mut *tx, tournament).await? else {
            continue;
        };
        let role = Tournament::role_of(&mut *tx, tournament, account).await?;
        let participant = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
            .condition(rorm::and![
                TournamentParticipantModel
                    .tournament
                    .equals(tournament.into_inner()),
                TournamentParticipantModel
                    .account
                    .equals(Some(account.into_inner())),
            ])
            .optional()
            .await?
            .map(TournamentParticipantUuid::from_uuid);

        entries.push(TournamentListEntry {
            tournament: Tournament::from(model),
            role,
            participant,
            participant_count,
        });
    }

    Ok(entries)
}

/// [`list_for_actor`]'s branch for a guest
///
/// A guest's session holds at most a handful of participant uuids, so this
/// is a plain lookup per uuid rather than the `UNION` the account branch
/// needs — hand-writing the SQL equivalent would cost more than it saves at
/// this size. Sorted afterwards in Rust for the same reason.
#[instrument(name = "listing::list_for_guest", skip(tx, participants))]
async fn list_for_guest(
    tx: &mut Transaction,
    participants: &[TournamentParticipantUuid],
) -> Result<Vec<TournamentListEntry>, rorm::Error> {
    let mut seen = HashSet::new();
    let mut entries = Vec::new();

    for &participant in participants {
        let Some(row) = rorm::query(&mut *tx, TournamentParticipantModel)
            .condition(
                TournamentParticipantModel
                    .uuid
                    .equals(participant.into_inner()),
            )
            .optional()
            .await?
        else {
            continue;
        };
        let tournament = TournamentUuid::new_from_field(row.tournament);
        if !seen.insert(tournament.into_inner()) {
            // The same tournament through a second stale participant uuid —
            // one entry per event, not one per guest row.
            continue;
        }

        let Some(model) = Tournament::fetch(&mut *tx, tournament).await? else {
            continue;
        };
        let participant_count = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
            .condition(
                TournamentParticipantModel
                    .tournament
                    .equals(tournament.into_inner()),
            )
            .all()
            .await?
            .len() as i64;

        entries.push(TournamentListEntry {
            tournament: Tournament::from(model),
            role: None,
            participant: Some(participant),
            participant_count,
        });
    }

    entries.sort_by_key(|entry| Reverse(sort_key(&entry.tournament)));
    Ok(entries)
}

/// `(starts_at, created_at)` as unix timestamps, a missing `starts_at`
/// standing in as the earliest possible moment
///
/// Read through [`Reverse`] this sorts newest/latest first with a missing
/// `starts_at` trailing every real one — `NULLS LAST` under `DESC`, the same
/// order [`list_for_account`]'s statement asks Postgres for.
fn sort_key(tournament: &Tournament) -> (i64, i64) {
    let starts_at = tournament
        .starts_at
        .map(|at| at.unix_timestamp())
        .unwrap_or(i64::MIN);
    (starts_at, tournament.created_at.unix_timestamp())
}
