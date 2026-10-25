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

    /// How many Participants self sign-up admits at most, `None` for no limit
    pub participant_limit: Option<i32>,

    /// Whether Accounts may sign up themselves
    #[rorm(default = false)]
    pub self_sign_up: bool,

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
    /// How many Participants self sign-up admits at most
    pub participant_limit: Option<i32>,
    /// Whether Accounts may sign up themselves
    pub self_sign_up: bool,
    /// Where the Tournament stands
    pub state: TournamentState,
}

/// A Participant of a Tournament: an Account or a Guest
///
/// Exactly one of [`Self::account`] and [`Self::guest_name`] is set.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_participant")]
pub struct TournamentParticipantModel {
    /// Primary key; [`participant_key`] for an Account, so it is in a Tournament once
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Tournament played in
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// The Account playing, `None` for a Guest
    ///
    /// Cascading for now: turning a deleted Account's Participants into
    /// Guests named by its last username is the Deletion's job.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub account: Option<ForeignModel<AccountModel>>,

    /// The name an Organizer gave a Guest, `None` for an Account
    pub guest_name: Option<MaxStr<64>>,

    /// The point in time the Participant was added or signed up
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentParticipantModel`]
#[derive(Patch)]
#[rorm(model = "TournamentParticipantModel")]
pub struct TournamentParticipantInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Tournament played in
    pub tournament: ForeignModel<TournamentModel>,
    /// The Account playing
    pub account: Option<ForeignModel<AccountModel>>,
    /// The name of a Guest
    pub guest_name: Option<MaxStr<64>>,
}

/// The primary key of an Account's Participant row in a Tournament
///
/// Derived from both, so a second insert of the same Account collides.
pub fn participant_key(tournament: Uuid, account: Uuid) -> Uuid {
    Uuid::new_v3(&tournament, account.as_bytes())
}
