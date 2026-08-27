//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::card_attributes::CardFinish;

/// A list of cards an account wants but does not own yet
///
/// The counterpart to a collection: a collection says what is on the shelf, a
/// watch list says what is still missing from it. Several of them for the same
/// reason there are several collections — "for the Atraxa deck" and "cards to
/// pick up at the next fair" are two different errands.
#[derive(Model, Debug)]
#[rorm(rename = "watch_list")]
pub struct WatchListModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Name of the watch list
    pub name: MaxStr<255>,

    /// Description shown above the entries
    pub description: MaxStr<1024>,

    /// The colour the watch list is drawn in
    #[rorm(default = "zinc")]
    pub color: MaxStr<16>,

    /// The pictogram drawn on the watch list
    #[rorm(default = "eye")]
    pub icon: MaxStr<32>,

    /// The owner of the watch list
    ///
    /// Indexed for the same reason as `collection.owner`: every read filters on
    /// it, and Postgres does not index a foreign key on its own.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The point in time the watch list was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`WatchListModel`]
#[derive(Patch)]
#[rorm(model = "WatchListModel")]
pub struct WatchListInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Name of the watch list
    pub name: MaxStr<255>,
    /// Description
    pub description: MaxStr<1024>,
    /// The colour the watch list is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on the watch list
    pub icon: MaxStr<32>,
    /// The owner of the watch list
    pub owner: ForeignModel<AccountModel>,
}

/// One card on a [`WatchListModel`]
///
/// The entry names a printing, but how strictly that name is read is the
/// account's to decide and therefore stored per entry: somebody after a
/// particular edition and somebody who takes any copy of the card are looking
/// at the same row through different switches. Both the stock count and the
/// price alarm follow those two switches, so what the row says it is watching
/// and what it alarms on can never drift apart.
///
/// No unique key over (list, printing): the same print as a foil and as a
/// nonfoil are two things to want.
#[derive(Model, Debug)]
#[rorm(rename = "watch_list_entry")]
pub struct WatchListEntryModel {
    /// Primary key
    ///
    /// The second half of the `watch_list_uuid` index, see [`Self::watch_list`].
    #[rorm(primary_key, index(name = "watch_list_uuid", priority = 2))]
    pub uuid: Uuid,

    /// The watch list this entry sits on
    ///
    /// Reading a list filters on this and orders by `uuid`; as a composite in
    /// that order one index answers both.
    #[rorm(
        index(name = "watch_list_uuid", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub watch_list: ForeignModel<WatchListModel>,

    /// Scryfall's id of the printing this entry names
    ///
    /// Not a foreign key, for the same reason `collection_entry.printing` is
    /// not one: a card can be watched before the catalog has caught up with the
    /// set it came from. Indexed so a printing merge can rewrite it.
    #[rorm(index)]
    pub printing: Uuid,

    /// The finish that is wanted
    pub finish: CardFinish,

    /// Whether only this very printing counts
    #[rorm(default = false)]
    pub exact_printing: bool,

    /// Whether only [`Self::finish`] counts
    #[rorm(default = true)]
    pub match_finish: bool,

    /// Which languages count, as Scryfall's codes, comma separated
    ///
    /// Empty for "any language", which is what an entry starts as. Only ever
    /// consulted while the printing is *not* pinned: a printing already is one
    /// language, so narrowing it further would either change nothing or leave
    /// the row counting nothing at all.
    ///
    /// Comma separated rather than a table of its own for the same reason
    /// `printing.finishes` is: it is a handful of codes read as a set, never
    /// joined against and never counted.
    #[rorm(default = "")]
    pub languages: MaxStr<64>,

    /// How many copies the account is after
    #[rorm(default = 1)]
    pub wanted: i32,

    /// What the entry is for, in the account's own words
    #[rorm(default = "")]
    pub note: MaxStr<1024>,

    /// Alarm below this price in euro cents, `None` for an entry without one
    pub alarm_price_cents: Option<i64>,

    /// When the price last fell through [`Self::alarm_price_cents`]
    ///
    /// The alarm's whole state: set once on the way down and cleared on the way
    /// back up, so a card that stays cheap raises one alarm rather than one per
    /// catalog sync.
    pub triggered_at: Option<OffsetDateTime>,

    /// What the card cost when the alarm went off, in euro cents
    pub triggered_price_cents: Option<i64>,

    /// Which printing was that cheap
    ///
    /// Worth keeping even for an entry that watches one printing: for a wide
    /// entry this is the whole answer, and reading it out of one column beats
    /// two shapes of the same response.
    pub triggered_printing: Option<Uuid>,

    /// Whether the reader has seen the alarm
    ///
    /// Cleared along with [`Self::triggered_at`], so an alarm that goes off a
    /// second time is unread again.
    #[rorm(default = false)]
    pub acknowledged: bool,

    /// The point in time the entry was added
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`WatchListEntryModel`]
#[derive(Patch)]
#[rorm(model = "WatchListEntryModel")]
pub struct WatchListEntryInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The watch list this entry sits on
    pub watch_list: ForeignModel<WatchListModel>,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// The finish that is wanted
    pub finish: CardFinish,
    /// Whether only this very printing counts
    pub exact_printing: bool,
    /// Whether only the entry's finish counts
    pub match_finish: bool,
    /// Which languages count, comma separated, empty for any
    pub languages: MaxStr<64>,
    /// How many copies the account is after
    pub wanted: i32,
    /// What the entry is for
    pub note: MaxStr<1024>,
    /// Alarm below this price in euro cents
    pub alarm_price_cents: Option<i64>,
}
