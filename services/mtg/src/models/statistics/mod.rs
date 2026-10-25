//! Statistics snapshots: service-wide counts taken by `snapshot-statistics`
//!
//! Taking one is the only read in the service that walks whole tables: one
//! sequential scan each of `account`, `collection`, `deck`, `tournament` and
//! `collection_stock`, plus the scanner session entries, once per interval in
//! its own container. Nothing on a request path counts; the admin dashboard
//! reads the stored rows through the `taken_at` index.

use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::row::decode;
use crate::models::statistics::db::StatisticsSnapshotInsertPatch;
use crate::models::statistics::db::StatisticsSnapshotModel;
use crate::models::tournament::TournamentState;
use crate::models::visibility::Visibility;

pub mod db;

/// How far back an Account counts as new
pub const NEW_ACCOUNT_WINDOW: Duration = Duration::days(7);

/// Service-wide counts at one point in time
#[derive(Debug, Clone)]
pub struct StatisticsSnapshot {
    /// Primary key
    pub uuid: Uuid,
    /// When the counts were taken
    pub taken_at: OffsetDateTime,
    /// Accounts, without the Tombstone
    pub accounts: i64,
    /// Accounts created in the [`NEW_ACCOUNT_WINDOW`] before `taken_at`
    pub new_accounts: i64,
    /// Collections on a shelf, without the ones standing for a deck
    pub collections: i64,
    /// Decks
    pub decks: i64,
    /// Public decks
    pub public_decks: i64,
    /// Cards, on the shelf and sleeved in decks
    pub cards: i64,
    /// Scanner sessions holding at least one card not yet filed
    pub open_scanner_sessions: i64,
    /// Tournaments in any state, the Tombstone's included
    pub tournaments: i64,
    /// Tournaments that are Finished
    pub finished_tournaments: i64,
}

/// One statement for all counts, so they agree with each other
const COUNTS: &str = "\
    SELECT a.accounts, a.new_accounts, \
      (SELECT count(*) FROM collection WHERE deck IS NULL) AS collections, \
      d.decks, d.public_decks, \
      (SELECT COALESCE(SUM(free + sleeved), 0)::bigint FROM collection_stock) AS cards, \
      (SELECT count(DISTINCT scanner_session) FROM scanner_session_entry) AS open_scanner_sessions, \
      t.tournaments, t.finished_tournaments \
    FROM \
      (SELECT count(*) AS accounts, count(*) FILTER (WHERE created_at > $1) AS new_accounts \
       FROM account WHERE NOT tombstone) a, \
      (SELECT count(*) AS decks, count(*) FILTER (WHERE visibility = $2) AS public_decks \
       FROM deck) d, \
      (SELECT count(*) AS tournaments, count(*) FILTER (WHERE state = $3) AS finished_tournaments \
       FROM tournament) t";

impl StatisticsSnapshot {
    /// Count everything and store the result as a new snapshot
    #[instrument(name = "StatisticsSnapshot::take", skip(tx))]
    pub async fn take(tx: &mut Transaction) -> Result<StatisticsSnapshot, rorm::Error> {
        let taken_at = OffsetDateTime::now_utc();
        let rows = (&mut *tx)
            .execute::<All>(
                COUNTS.to_string(),
                vec![
                    Value::TimeOffsetDateTime(taken_at - NEW_ACCOUNT_WINDOW),
                    Value::String(Visibility::Public.as_str()),
                    Value::String(TournamentState::Finished.as_str()),
                ],
            )
            .await?;
        let row = rows
            .first()
            .unwrap_or_else(|| unreachable!("an aggregate without GROUP BY returns one row"));
        let count = |column: &str| row.get::<i64>(column).map_err(decode);

        let patch = StatisticsSnapshotInsertPatch {
            uuid: Uuid::now_v7(),
            taken_at,
            accounts: count("accounts")?,
            new_accounts: count("new_accounts")?,
            collections: count("collections")?,
            decks: count("decks")?,
            public_decks: count("public_decks")?,
            cards: count("cards")?,
            open_scanner_sessions: count("open_scanner_sessions")?,
            tournaments: count("tournaments")?,
            finished_tournaments: count("finished_tournaments")?,
        };
        let snapshot = rorm::insert(&mut *tx, StatisticsSnapshotModel)
            .single(&patch)
            .await?;
        Ok(Self::from(snapshot))
    }

    /// The most recent snapshot, `None` before the first one
    #[instrument(name = "StatisticsSnapshot::newest", skip(tx))]
    pub async fn newest(tx: &mut Transaction) -> Result<Option<StatisticsSnapshot>, rorm::Error> {
        let snapshot = rorm::query(&mut *tx, StatisticsSnapshotModel)
            .order_desc(StatisticsSnapshotModel.taken_at)
            .optional()
            .await?;
        Ok(snapshot.map(Self::from))
    }

    /// Every snapshot taken at or after `from`, oldest first
    #[instrument(name = "StatisticsSnapshot::since", skip(tx))]
    pub async fn since(
        tx: &mut Transaction,
        from: OffsetDateTime,
    ) -> Result<Vec<StatisticsSnapshot>, rorm::Error> {
        let snapshots = rorm::query(&mut *tx, StatisticsSnapshotModel)
            .condition(StatisticsSnapshotModel.taken_at.greater_equals(from))
            .order_asc(StatisticsSnapshotModel.taken_at)
            .all()
            .await?;
        Ok(snapshots.into_iter().map(Self::from).collect())
    }
}

impl From<StatisticsSnapshotModel> for StatisticsSnapshot {
    fn from(model: StatisticsSnapshotModel) -> Self {
        Self {
            uuid: model.uuid,
            taken_at: model.taken_at,
            accounts: model.accounts,
            new_accounts: model.new_accounts,
            collections: model.collections,
            decks: model.decks,
            public_decks: model.public_decks,
            cards: model.cards,
            open_scanner_sessions: model.open_scanner_sessions,
            tournaments: model.tournaments,
            finished_tournaments: model.finished_tournaments,
        }
    }
}
