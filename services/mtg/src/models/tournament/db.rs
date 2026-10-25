//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::tournament::TournamentState;
use crate::models::visibility::Visibility;
use crate::tournament::ruleset::Ruleset;

/// A Tournament: its settings, its state and its Owner
#[derive(Model, Debug)]
#[rorm(rename = "tournament")]
pub struct TournamentModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Account the Tournament belongs to
    ///
    /// Indexed for "my Tournaments". Restricted rather than cascading: a
    /// Tournament outlives its Owner's Account by passing to a Co-organizer or
    /// to the Tombstone, which the Deletion has to do before the Account goes.
    #[rorm(index, on_update = "Cascade", on_delete = "Restrict")]
    pub owner: ForeignModel<AccountModel>,

    /// What the Tournament is called
    pub name: MaxStr<128>,

    /// What Participants should know beforehand, in the Owner's words
    pub description: Option<MaxStr<4096>>,

    /// Where it takes place, as free text
    pub location: Option<MaxStr<255>>,

    /// When it is announced to start: the date and the start time
    ///
    /// Second in the public overview's index, which lists by it.
    #[rorm(index(name = "tournament_overview", priority = 2))]
    pub starts_at: OffsetDateTime,

    /// How many Participants a full Match seats, 2 to 5
    pub table_size: i16,

    /// The Ruleset the Tournament follows, one fitting [`Self::table_size`]
    pub ruleset: Ruleset,

    /// The format played, a Scryfall slug like a deck's; `None` for any
    pub format: Option<MaxStr<32>>,

    /// Who may see the Tournament
    ///
    /// Leads the public overview's index: the overview reads public ones only.
    #[rorm(index(name = "tournament_overview", priority = 1))]
    pub visibility: Visibility,

    /// Secret of the share link, set exactly while the Tournament is Unlisted
    #[rorm(unique)]
    pub share_token: Option<MaxStr<64>>,

    /// Where the Tournament stands
    #[rorm(default = "Registration")]
    pub state: TournamentState,

    /// The point in time the Tournament was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentModel`]
#[derive(Patch)]
#[rorm(model = "TournamentModel")]
pub struct TournamentInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Account the Tournament belongs to
    pub owner: ForeignModel<AccountModel>,
    /// What the Tournament is called
    pub name: MaxStr<128>,
    /// What Participants should know beforehand
    pub description: Option<MaxStr<4096>>,
    /// Where it takes place
    pub location: Option<MaxStr<255>>,
    /// When it is announced to start
    pub starts_at: OffsetDateTime,
    /// How many Participants a full Match seats
    pub table_size: i16,
    /// The Ruleset the Tournament follows
    pub ruleset: Ruleset,
    /// The format played
    pub format: Option<MaxStr<32>>,
    /// Who may see the Tournament
    pub visibility: Visibility,
    /// Secret of the share link
    pub share_token: Option<MaxStr<64>>,
    /// Where the Tournament stands
    pub state: TournamentState,
}
