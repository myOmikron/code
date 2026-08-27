//! Arming and disarming the price alarms on watch list entries
//!
//! Prices only ever move when the catalog is synced, so this runs once at the
//! end of a sync rather than on a clock of its own. Everything it does is a
//! statement over the whole table: the number of entries an alarm has to be
//! decided for is the number of entries there are, and asking the database
//! about them one at a time would be one round trip per watched card.
//!
//! The alarm is a *crossing*, not a comparison. It is set on the way down and
//! cleared on the way back up, so a card that stays cheap for a month raises
//! one alarm rather than one per sync, and a card that gets expensive again
//! rearms itself for the next time.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::AffectedRows;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::watch_list::MARKET_LATERAL;
use crate::models::watch_list::WatchListEntry;
use crate::models::watch_list::WatchListEntryUuid;
use crate::models::watch_list::WatchListUuid;
use crate::models::watch_list::bounded;

/// What one pass over the alarms did
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AlarmSweep {
    /// Entries whose price fell through their threshold
    pub armed: u64,
    /// Entries whose price rose back above it
    pub disarmed: u64,
}

/// The joins both statements read the current price through
const PRICED_ENTRIES: &str = "FROM watch_list_entry w \
     LEFT JOIN printing p ON p.id = w.printing";

impl WatchListEntry {
    /// Decide every alarm against the prices the catalog now holds
    ///
    /// Disarms first and arms second. The two conditions are disjoint, so the
    /// order changes nothing about the outcome; it is written this way because
    /// it is the order the numbers read in.
    #[instrument(name = "WatchListEntry::evaluate_alarms", skip(tx))]
    pub async fn evaluate_alarms(tx: &mut Transaction) -> Result<AlarmSweep, rorm::Error> {
        // An entry whose alarm was taken off, or whose card the catalog no
        // longer prices, is disarmed as well: a standing alarm has to mean the
        // price is below the threshold right now, and neither of those can say
        // that any more.
        let disarm = format!(
            "UPDATE watch_list_entry AS t \
             SET triggered_at = NULL, triggered_price_cents = NULL, \
                 triggered_printing = NULL, acknowledged = FALSE \
             {PRICED_ENTRIES} \
             {MARKET_LATERAL} \
             WHERE t.uuid = w.uuid \
               AND w.triggered_at IS NOT NULL \
               AND (w.alarm_price_cents IS NULL \
                    OR m.market_price_cents IS NULL \
                    OR m.market_price_cents > w.alarm_price_cents)"
        );
        let disarmed = (&mut *tx)
            .execute::<AffectedRows>(disarm, Vec::new())
            .await?;

        let arm = format!(
            "UPDATE watch_list_entry AS t \
             SET triggered_at = now(), \
                 triggered_price_cents = m.market_price_cents, \
                 triggered_printing = m.market_printing \
             {PRICED_ENTRIES} \
             {MARKET_LATERAL} \
             WHERE t.uuid = w.uuid \
               AND w.triggered_at IS NULL \
               AND w.alarm_price_cents IS NOT NULL \
               AND m.market_price_cents IS NOT NULL \
               AND m.market_price_cents <= w.alarm_price_cents"
        );
        let armed = (&mut *tx).execute::<AffectedRows>(arm, Vec::new()).await?;

        Ok(AlarmSweep { armed, disarmed })
    }
}

/// One alarm that has gone off, with enough around it to be shown out of context
///
/// The navigation badge is drawn from these, so a reader who is nowhere near a
/// watch list still learns which list and which card the alarm is about.
#[derive(Debug, Clone)]
pub struct TriggeredAlarm {
    /// The list the entry sits on
    pub watch_list: WatchListUuid,
    /// What that list is called
    pub watch_list_name: MaxStr<255>,
    /// The entry whose alarm went off
    pub entry: WatchListEntryUuid,
    /// The printed name of the card, empty while the catalog misses it
    pub name: String,
    /// What the card cost when the alarm went off, in euro cents
    pub triggered_price_cents: Option<i64>,
    /// The threshold it fell through, in euro cents
    pub alarm_price_cents: Option<i64>,
    /// Whether the reader has seen it
    pub acknowledged: bool,
    /// When it went off
    pub triggered_at: OffsetDateTime,
}

impl TriggeredAlarm {
    /// Every alarm standing across an account's watch lists, newest first
    #[instrument(name = "TriggeredAlarm::read_for_account", skip(tx))]
    pub async fn read_for_account(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<TriggeredAlarm>, rorm::Error> {
        let statement = "SELECT w.uuid, w.watch_list, w.alarm_price_cents, \
                    w.triggered_price_cents, w.triggered_at, w.acknowledged, \
                    l.name AS watch_list_name, p.name \
             FROM watch_list_entry w \
             JOIN watch_list l ON l.uuid = w.watch_list \
             LEFT JOIN printing p ON p.id = COALESCE(w.triggered_printing, w.printing) \
             WHERE l.owner = $1 AND w.triggered_at IS NOT NULL \
             ORDER BY w.triggered_at DESC, w.uuid ASC";

        let rows = (&mut *tx)
            .execute::<All>(statement.to_owned(), vec![Value::Uuid(owner.into_inner())])
            .await?;

        let mut alarms = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let name: Option<String> = row.get("name").map_err(decode)?;
            alarms.push(TriggeredAlarm {
                watch_list: WatchListUuid::from_uuid(row.get("watch_list").map_err(decode)?),
                watch_list_name: bounded(row.get::<String>("watch_list_name").map_err(decode)?),
                entry: WatchListEntryUuid::from_uuid(row.get("uuid").map_err(decode)?),
                name: name.unwrap_or_default(),
                triggered_price_cents: row.get("triggered_price_cents").map_err(decode)?,
                alarm_price_cents: row.get("alarm_price_cents").map_err(decode)?,
                acknowledged: row.get("acknowledged").map_err(decode)?,
                triggered_at: row.get("triggered_at").map_err(decode)?,
            });
        }
        Ok(alarms)
    }
}
