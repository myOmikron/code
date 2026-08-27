//! Watch lists: the cards an account is after, and what they may cost

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::card_attributes::CardFinish;
use crate::models::watch_list::db::WatchListEntryInsertPatch;
use crate::models::watch_list::db::WatchListEntryModel;
use crate::models::watch_list::db::WatchListInsertPatch;
use crate::models::watch_list::db::WatchListModel;

pub mod alarms;
pub mod availability;
pub mod copies;
pub(in crate::models) mod db;
pub mod listing;

/// What one copy of what an entry watches costs, in euro cents
///
/// `w` is the entry, `mp` the printing being priced. The two switches on the
/// entry decide the reading, and both the stock count and the alarm go through
/// this one expression, so the price a row shows and the price its alarm fires
/// on can never be two different numbers.
///
/// With the finish pinned this is the same rule the collection values a stack
/// by (`unit_price!` in [`crate::models::collection::listing`]): Scryfall
/// quotes no separate etched price, so etched falls back to the foil one.
/// Otherwise the cheaper of the two counts, which is what "any print, just tell
/// me when it is cheap" means. Postgres' `LEAST` skips nulls, so a card that
/// exists in one finish only is priced by the finish it has.
///
/// The finish is only pinned while the version is, for the reason spelled out
/// on [`SAME_FINISH`]: the price a row alarms on has to be the price of the
/// thing the row says it is watching.
macro_rules! market_price {
    () => {
        "(CASE WHEN w.exact_printing AND w.match_finish \
              THEN CASE WHEN w.finish = 'Nonfoil' THEN mp.price_eur \
                        ELSE COALESCE(mp.price_eur_foil, mp.price_eur) END \
              ELSE LEAST(mp.price_eur, mp.price_eur_foil) END)"
    };
}

/// Whether a stack holds the same *card*, as widely as the catalog allows
///
/// `w` is the entry, `e` the stack, `p` the entry's printing and `ep` the
/// stack's. The same rule as `samePrinting` in the frontend's `deck-sourcing`
/// module: without a catalog entry on either side there is nothing to be wider
/// about, so the printing id is all either side has.
macro_rules! any_printing {
    () => {
        "(CASE WHEN p.oracle_id IS NULL OR ep.oracle_id IS NULL \
              THEN e.printing = w.printing \
              ELSE ep.oracle_id = p.oracle_id END)"
    };
}

/// Whether a stack counts towards an entry, under the entry's own switch
pub(in crate::models::watch_list) const SAME_CARD: &str = concat!(
    "(CASE WHEN w.exact_printing THEN e.printing = w.printing ELSE ",
    any_printing!(),
    " END)"
);

/// [`SAME_CARD`] with the printing switch forced open
pub(in crate::models::watch_list) const ANY_PRINTING: &str = any_printing!();

/// Whether a printing is in one of the languages the entry asks for
///
/// `w` is the entry; the alias of the printing being judged is passed in,
/// because it is the stack's under a stock count and the priced one under an
/// alarm.
///
/// Only in force while the printing is *not* pinned: a pinned printing already
/// is one language, and narrowing it again would either change nothing or leave
/// the row counting nothing. An empty list is "any", which is what an entry
/// starts as and what most of them stay.
macro_rules! same_language {
    ($printing:literal) => {
        concat!(
            "(w.exact_printing OR w.languages = '' OR ",
            $printing,
            ".lang = ANY(string_to_array(w.languages, ',')))"
        )
    };
}

/// [`same_language!`] for the printing a stack holds
pub(in crate::models::watch_list) const STACK_LANGUAGE: &str = same_language!("ep");

/// Whether a stack is in the finish the entry asks for
pub(in crate::models::watch_list) const SAME_FINISH: &str =
    "(NOT w.match_finish OR e.finish = w.finish)";

/// The cheapest printing an entry's switches accept, and what it costs
///
/// Joins as `m`, carrying `market_price_cents` and `market_printing`. Expects
/// `w` to be the entry and `p` its own printing. Spelled out through the same
/// macro as [`market_price!`] so the price the row is picked by and the price
/// it reports can never disagree.
///
/// The two cases are spelled as a pair of alternatives rather than as a `CASE`,
/// which reads worse and runs very differently: a `CASE` over the entry's switch
/// is opaque to the planner, so it fell back to reading the whole catalog —
/// half a million rows to find one — while each of these can be answered from an
/// index, by primary key on the one side and by `oracle_id` on the other. The
/// two cover the same rows: the second arm is the negation of the first's
/// condition.
///
/// An entry that watches one printing gets that printing's price; a wide entry
/// gets the cheapest of every printing of the card, which is what "alarm me
/// when any printing goes below" asks for. A wide entry whose own printing the
/// catalog has not caught up with falls back to that printing, for the same
/// reason the stock count does: there is nothing to be wider about yet.
pub(in crate::models::watch_list) const MARKET_LATERAL: &str = concat!(
    "LEFT JOIN LATERAL ( \
       SELECT mp.id AS market_printing, mp.cardmarket_id AS market_cardmarket_id, \
              mp.name AS market_name, mp.set_code AS market_set_code, \
              mp.collector_number AS market_collector_number, mp.lang AS market_lang, ",
    market_price!(),
    " AS market_price_cents \
       FROM printing mp \
       WHERE ((w.exact_printing OR p.oracle_id IS NULL) AND mp.id = w.printing \
              OR (NOT w.exact_printing AND p.oracle_id IS NOT NULL \
                  AND mp.oracle_id = p.oracle_id)) \
         AND ",
    same_language!("mp"),
    " AND ",
    market_price!(),
    " IS NOT NULL \
       ORDER BY ",
    market_price!(),
    " ASC, mp.id ASC \
       LIMIT 1 \
     ) m ON TRUE"
);

/// Outcome of an operation that only a watch list's owner may perform
///
/// One [`Self::Denied`] for "does not exist" and "not yours" alike, for the
/// same reason as [`crate::models::collection::CollectionAccess`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchListAccess<T = ()> {
    /// The account owns the watch list; carries whatever the operation produced
    Granted(T),
    /// The watch list is gone, or it is not this account's to touch
    Denied,
}

/// A list of cards an account is after
#[derive(Debug, Clone)]
pub struct WatchList {
    /// Primary key
    pub uuid: WatchListUuid,
    /// What the list is called
    pub name: MaxStr<255>,
    /// Description shown above the entries
    pub description: MaxStr<1024>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on it
    pub icon: MaxStr<32>,
    /// The account whose list this is
    pub owner: AccountUuid,
    /// The point in time the list was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`WatchList`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct WatchListUuid(Uuid);

impl WatchListUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `WatchListUuid` from a foreign key of [`WatchListModel`]
    pub(in crate::models) fn new_from_field(
        field: ForeignModelByField<<WatchListModel as rorm::Model>::Primary>,
    ) -> Self {
        Self(field.0)
    }

    /// Create a new `WatchListUuid` from a raw uuid read out of a statement
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// What it takes to create a [`WatchList`]
#[derive(Debug, Clone)]
pub struct WatchListInsert {
    /// What the list is called
    pub name: MaxStr<255>,
    /// Description shown above the entries
    pub description: MaxStr<1024>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on it
    pub icon: MaxStr<32>,
}

/// What an account may change about a [`WatchList`]
#[derive(Debug, Clone)]
pub struct WatchListUpdate {
    /// What the list is called
    pub name: MaxStr<255>,
    /// Description shown above the entries
    pub description: MaxStr<1024>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on it
    pub icon: MaxStr<32>,
}

impl WatchList {
    /// One watch list, if it is this account's
    #[instrument(name = "WatchList::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: WatchListUuid,
    ) -> Result<Option<WatchList>, rorm::Error> {
        let list = rorm::query(&mut *tx, WatchListModel)
            .condition(owned_by(uuid, owner))
            .optional()
            .await?;
        Ok(list.map(WatchList::from))
    }

    /// Whether `account` may administer the watch list
    ///
    /// Prefer the owner-scoped mutators, which fold this into their statement.
    /// This is for handlers that need the answer before doing unrelated work,
    /// such as reading a list's entries through hand-written sql.
    #[instrument(name = "WatchList::may_administer", skip(tx))]
    pub async fn may_administer(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: WatchListUuid,
    ) -> Result<WatchListAccess, rorm::Error> {
        let found = rorm::query(&mut *tx, WatchListModel.uuid)
            .condition(owned_by(uuid, owner))
            .optional()
            .await?;
        Ok(match found {
            Some(_) => WatchListAccess::Granted(()),
            None => WatchListAccess::Denied,
        })
    }

    /// Create a watch list
    #[instrument(name = "WatchList::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: WatchListInsert,
    ) -> Result<WatchList, rorm::Error> {
        let list = rorm::insert(&mut *tx, WatchListModel)
            .single(&WatchListInsertPatch {
                uuid: Uuid::now_v7(),
                name: insert.name,
                description: insert.description,
                color: insert.color,
                icon: insert.icon,
                owner: ForeignModelByField(owner.into_inner()),
            })
            .await?;
        Ok(WatchList::from(list))
    }

    /// Rename a watch list and update everything else its owner may edit
    #[instrument(name = "WatchList::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: WatchListUuid,
        update: WatchListUpdate,
    ) -> Result<WatchListAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, WatchListModel)
            .set(WatchListModel.name, update.name)
            .set(WatchListModel.description, update.description)
            .set(WatchListModel.color, update.color)
            .set(WatchListModel.icon, update.icon)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// Delete a watch list and, through the cascade, every entry on it
    #[instrument(name = "WatchList::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: WatchListUuid,
    ) -> Result<WatchListAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, WatchListModel)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }
}

impl From<WatchListModel> for WatchList {
    fn from(value: WatchListModel) -> Self {
        Self {
            uuid: WatchListUuid(value.uuid),
            name: value.name,
            description: value.description,
            color: value.color,
            icon: value.icon,
            owner: AccountUuid::new_from_field(value.owner),
            created_at: value.created_at,
        }
    }
}

/// One card on a watch list
#[derive(Debug, Clone)]
pub struct WatchListEntry {
    /// Primary key
    pub uuid: WatchListEntryUuid,
    /// The list this entry sits on
    pub watch_list: WatchListUuid,
    /// Scryfall's id of the printing the entry names
    pub printing: Uuid,
    /// The finish that is wanted
    pub finish: CardFinish,
    /// Whether only this very printing counts
    pub exact_printing: bool,
    /// Whether only [`Self::finish`] counts
    pub match_finish: bool,
    /// Which languages count, as Scryfall's codes, empty for any
    pub languages: Vec<String>,
    /// How many copies the account is after
    pub wanted: i32,
    /// What the entry is for, in the account's own words
    pub note: MaxStr<1024>,
    /// Alarm below this price in euro cents
    pub alarm_price_cents: Option<i64>,
    /// When the price last fell through the alarm
    pub triggered_at: Option<OffsetDateTime>,
    /// What the card cost when the alarm went off, in euro cents
    pub triggered_price_cents: Option<i64>,
    /// Which printing was that cheap
    pub triggered_printing: Option<Uuid>,
    /// Whether the reader has seen the alarm
    pub acknowledged: bool,
    /// The point in time the entry was added
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`WatchListEntry`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct WatchListEntryUuid(Uuid);

impl WatchListEntryUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `WatchListEntryUuid` from a raw uuid read out of a statement
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// What it takes to put a card on a watch list
#[derive(Debug, Clone)]
pub struct WatchListEntryInsert {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// The finish that is wanted
    pub finish: CardFinish,
    /// Whether only this very printing counts
    pub exact_printing: bool,
    /// Whether only the entry's finish counts
    pub match_finish: bool,
    /// Which languages count, as Scryfall's codes, empty for any
    pub languages: Vec<String>,
    /// How many copies the account is after
    pub wanted: i32,
    /// What the entry is for
    pub note: MaxStr<1024>,
    /// Alarm below this price in euro cents
    pub alarm_price_cents: Option<i64>,
}

/// What an account may change about an entry, field by field
///
/// A `None` leaves the field alone. The alarm price is doubly optional: the
/// outer `None` means "not mentioned", the inner one means "take the alarm off".
#[derive(Debug, Clone, Default)]
pub struct WatchListEntryPatch {
    /// A different printing
    pub printing: Option<Uuid>,
    /// A different finish
    pub finish: Option<CardFinish>,
    /// Whether only the named printing counts
    pub exact_printing: Option<bool>,
    /// Whether only the named finish counts
    pub match_finish: Option<bool>,
    /// Which languages count, empty for any
    pub languages: Option<Vec<String>>,
    /// How many copies the account is after
    pub wanted: Option<i32>,
    /// What the entry is for
    pub note: Option<MaxStr<1024>>,
    /// The alarm price, the inner `None` taking the alarm off
    pub alarm_price_cents: Option<Option<i64>>,
}

impl WatchListEntry {
    /// One entry, if it sits on this list
    #[instrument(name = "WatchListEntry::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        watch_list: WatchListUuid,
        uuid: WatchListEntryUuid,
    ) -> Result<Option<WatchListEntry>, rorm::Error> {
        let entry = rorm::query(&mut *tx, WatchListEntryModel)
            .condition(rorm::and![
                WatchListEntryModel.uuid.equals(uuid.0),
                WatchListEntryModel.watch_list.equals(watch_list.0),
            ])
            .optional()
            .await?;
        Ok(entry.map(WatchListEntry::from))
    }

    /// Put a card on a watch list
    #[instrument(name = "WatchListEntry::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        watch_list: WatchListUuid,
        insert: WatchListEntryInsert,
    ) -> Result<WatchListEntry, rorm::Error> {
        let entry = rorm::insert(&mut *tx, WatchListEntryModel)
            .single(&WatchListEntryInsertPatch {
                uuid: Uuid::now_v7(),
                watch_list: ForeignModelByField(watch_list.0),
                printing: insert.printing,
                finish: insert.finish,
                exact_printing: insert.exact_printing,
                match_finish: insert.match_finish,
                languages: pack_languages(&insert.languages),
                wanted: insert.wanted.max(1),
                note: insert.note,
                alarm_price_cents: insert.alarm_price_cents,
            })
            .await?;
        Ok(WatchListEntry::from(entry))
    }

    /// Change some of an entry's fields, leaving the rest alone
    ///
    /// The list is part of the condition, not just the entry: the caller has
    /// only proven it may administer *that* list.
    ///
    /// Changing anything the alarm reads disarms it. The stored alarm state
    /// describes a comparison between one price and one threshold, and once
    /// either side moves it no longer describes anything; leaving it standing
    /// would show a triggered alarm for a card the entry no longer watches.
    /// The next catalog sync sets it again if it still holds.
    #[instrument(name = "WatchListEntry::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        watch_list: WatchListUuid,
        uuid: WatchListEntryUuid,
        patch: WatchListEntryPatch,
    ) -> Result<WatchListAccess<WatchListEntry>, rorm::Error> {
        let disarms = patch.printing.is_some()
            || patch.finish.is_some()
            || patch.exact_printing.is_some()
            || patch.match_finish.is_some()
            || patch.languages.is_some()
            || patch.alarm_price_cents.is_some();

        let builder = rorm::update(&mut *tx, WatchListEntryModel)
            .begin_dyn_set()
            .set_if(WatchListEntryModel.printing, patch.printing)
            .set_if(WatchListEntryModel.finish, patch.finish)
            .set_if(WatchListEntryModel.exact_printing, patch.exact_printing)
            .set_if(WatchListEntryModel.match_finish, patch.match_finish)
            .set_if(
                WatchListEntryModel.languages,
                patch.languages.as_deref().map(pack_languages),
            )
            .set_if(WatchListEntryModel.wanted, patch.wanted.map(|n| n.max(1)))
            .set_if(WatchListEntryModel.note, patch.note)
            .set_if(
                WatchListEntryModel.alarm_price_cents,
                patch.alarm_price_cents,
            )
            .set_if(
                WatchListEntryModel.triggered_at,
                disarms.then_some(None::<OffsetDateTime>),
            )
            .set_if(
                WatchListEntryModel.triggered_price_cents,
                disarms.then_some(None::<i64>),
            )
            .set_if(
                WatchListEntryModel.triggered_printing,
                disarms.then_some(None::<Uuid>),
            )
            .set_if(WatchListEntryModel.acknowledged, disarms.then_some(false));

        // A patch that changes nothing still has to answer with the entry.
        let Ok(builder) = builder.finish_dyn_set() else {
            return Ok(match Self::get(&mut *tx, watch_list, uuid).await? {
                Some(entry) => WatchListAccess::Granted(entry),
                None => WatchListAccess::Denied,
            });
        };

        let affected = builder
            .condition(rorm::and![
                WatchListEntryModel.uuid.equals(uuid.0),
                WatchListEntryModel.watch_list.equals(watch_list.0),
            ])
            .await?;
        if affected == 0 {
            return Ok(WatchListAccess::Denied);
        }

        Ok(match Self::get(&mut *tx, watch_list, uuid).await? {
            Some(entry) => WatchListAccess::Granted(entry),
            None => WatchListAccess::Denied,
        })
    }

    /// Take a card off a watch list
    #[instrument(name = "WatchListEntry::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        watch_list: WatchListUuid,
        uuid: WatchListEntryUuid,
    ) -> Result<WatchListAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, WatchListEntryModel)
            .condition(rorm::and![
                WatchListEntryModel.uuid.equals(uuid.0),
                WatchListEntryModel.watch_list.equals(watch_list.0),
            ])
            .await?;
        Ok(access(affected, ()))
    }

    /// Mark an alarm as seen, taking it out of the unread count
    ///
    /// Only the reading is recorded; the alarm itself stays on the entry until
    /// the price rises back through the threshold.
    #[instrument(name = "WatchListEntry::acknowledge", skip(tx))]
    pub async fn acknowledge(
        tx: &mut Transaction,
        watch_list: WatchListUuid,
        uuid: WatchListEntryUuid,
    ) -> Result<WatchListAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, WatchListEntryModel)
            .set(WatchListEntryModel.acknowledged, true)
            .condition(rorm::and![
                WatchListEntryModel.uuid.equals(uuid.0),
                WatchListEntryModel.watch_list.equals(watch_list.0),
            ])
            .await?;
        Ok(access(affected, ()))
    }

    /// Point every entry naming `old_printing` at `new_printing`
    ///
    /// See [`crate::models::collection::CollectionEntry::apply_printing_merge`].
    #[instrument(name = "WatchListEntry::apply_printing_merge", skip(tx))]
    pub async fn apply_printing_merge(
        tx: &mut Transaction,
        old_printing: Uuid,
        new_printing: Uuid,
    ) -> Result<u64, rorm::Error> {
        rorm::update(&mut *tx, WatchListEntryModel)
            .set(WatchListEntryModel.printing, new_printing)
            .condition(WatchListEntryModel.printing.equals(old_printing))
            .await
    }
}

impl From<WatchListEntryModel> for WatchListEntry {
    fn from(value: WatchListEntryModel) -> Self {
        Self {
            uuid: WatchListEntryUuid(value.uuid),
            watch_list: WatchListUuid::new_from_field(value.watch_list),
            printing: value.printing,
            finish: value.finish,
            exact_printing: value.exact_printing,
            match_finish: value.match_finish,
            languages: read_languages(&value.languages),
            wanted: value.wanted,
            note: value.note,
            alarm_price_cents: value.alarm_price_cents,
            triggered_at: value.triggered_at,
            triggered_price_cents: value.triggered_price_cents,
            triggered_printing: value.triggered_printing,
            acknowledged: value.acknowledged,
            created_at: value.created_at,
        }
    }
}

/// Wraps a string read out of a hand-written statement back into its bounded type
///
/// The column it came from is already `N` wide, so the truncation can only ever
/// be reached by a row that predates the bound. Truncating beats refusing to
/// show the list at all.
pub(in crate::models::watch_list) fn bounded<const N: usize>(string: String) -> MaxStr<N> {
    MaxStr::new(string).unwrap_or_else(|error| {
        let mut string = error.string;
        string.truncate(N);
        MaxStr::new(string).unwrap_or_else(|_| unreachable!("truncated to the maximum length"))
    })
}

/// Folds a set of language codes into the one column that stores them
///
/// Sorted and de-duplicated, so the same set always reads back the same way and
/// two rows that mean the same thing compare equal. Anything that is not a
/// short alphabetic code is dropped rather than stored: the column is compared
/// against `printing.lang`, and nothing else can ever match.
pub(in crate::models) fn pack_languages(languages: &[String]) -> MaxStr<64> {
    let mut codes: Vec<String> = languages
        .iter()
        .map(|code| code.trim().to_ascii_lowercase())
        .filter(|code| {
            !code.is_empty() && code.len() <= 4 && code.chars().all(|c| c.is_ascii_alphabetic())
        })
        .collect();
    codes.sort();
    codes.dedup();

    // Silently trimmed rather than refused: the column holds a dozen codes and
    // a request naming more of them than that is not a request worth failing.
    let mut packed = String::new();
    for code in codes {
        let candidate = if packed.is_empty() {
            code
        } else {
            format!("{packed},{code}")
        };
        if candidate.len() > 64 {
            break;
        }
        packed = candidate;
    }
    MaxStr::new(packed).unwrap_or_else(|_| unreachable!("kept under the maximum length"))
}

/// Reads the stored language codes back out
fn read_languages(packed: &str) -> Vec<String> {
    packed
        .split(',')
        .filter(|code| !code.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Turn a statement's affected-row count into a [`WatchListAccess`]
fn access<T>(affected: u64, value: T) -> WatchListAccess<T> {
    if affected > 0 {
        WatchListAccess::Granted(value)
    } else {
        WatchListAccess::Denied
    }
}

/// Condition matching a watch list only when `account` owns it
fn owned_by(uuid: WatchListUuid, account: AccountUuid) -> impl Condition<'static> {
    rorm::and![
        WatchListModel.uuid.equals(uuid.0),
        WatchListModel.owner.equals(account.into_inner()),
    ]
}

#[cfg(test)]
mod tests {
    use super::pack_languages;
    use super::read_languages;

    /// Turns a list of literals into what the api hands over
    fn given(codes: &[&str]) -> Vec<String> {
        codes.iter().map(|code| (*code).to_owned()).collect()
    }

    #[test]
    fn stores_a_set_in_one_order() {
        assert_eq!(&*pack_languages(&given(&["de", "en"])), "de,en");
        assert_eq!(&*pack_languages(&given(&["en", "de"])), "de,en");
    }

    #[test]
    fn folds_repeats_and_casing_together() {
        assert_eq!(&*pack_languages(&given(&["EN", " en ", "en"])), "en");
    }

    #[test]
    fn drops_what_could_never_match_a_printing() {
        assert_eq!(
            &*pack_languages(&given(&["en", "", "de-DE", "toolong"])),
            "en"
        );
    }

    #[test]
    fn reads_back_what_it_stored() {
        let packed = pack_languages(&given(&["ja", "en", "de"]));
        assert_eq!(read_languages(&packed), given(&["de", "en", "ja"]));
    }

    #[test]
    fn reads_an_empty_column_as_any_language() {
        assert!(read_languages("").is_empty());
    }
}
