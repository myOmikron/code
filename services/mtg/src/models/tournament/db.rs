//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use super::life_history::MatchLifeHistory;
use crate::models::account::db::AccountModel;
use crate::models::deck::DeckZone;
use crate::models::deck::db::DeckModel;
use crate::models::tournament::TournamentState;
use crate::models::tournament::round::RoundStage;
use crate::models::tournament::round::RoundState;
use crate::models::visibility::Visibility;
use crate::tournament::reporting::ResultState;
use crate::tournament::ruleset::BestOf;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::top_cut::TopCut;

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

    /// How many Games a one-on-one Match is played to; `None` for a multiplayer Tournament
    pub best_of: Option<BestOf>,

    /// The entry fee in the currency's smallest unit, `None` for no fee
    ///
    /// Set exactly when [`Self::entry_fee_currency`] is.
    pub entry_fee_amount: Option<i32>,

    /// The ISO 4217 code of the entry fee's currency, `None` for no fee
    pub entry_fee_currency: Option<MaxStr<3>>,

    /// How many Swiss Rounds are played
    ///
    /// `None` until an Organizer sets it or the first Round starts, which
    /// stores the engine's suggestion; until then the suggestion applies.
    pub swiss_rounds: Option<i16>,

    /// How many minutes the round timer gives a Round, `None` for no timer
    pub round_minutes: Option<i16>,
    /// The Top cut after the Swiss Rounds, `None` for none
    pub top_cut: Option<TopCut>,

    /// How many Games a Top cut Match is played to; set exactly with a one-on-one [`Self::top_cut`]
    pub top_cut_best_of: Option<BestOf>,

    /// Whether the Tournament is entered afterwards instead of run live
    ///
    /// Its Organizers set every pairing and Result; nobody is asked to report.
    #[rorm(default = false)]
    pub entered_afterwards: bool,

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
    /// How many Games a one-on-one Match is played to
    pub best_of: Option<BestOf>,
    /// How many minutes the round timer gives a Round
    pub round_minutes: Option<i16>,
    /// The Top cut after the Swiss Rounds
    pub top_cut: Option<TopCut>,
    /// How many Games a Top cut Match is played to
    pub top_cut_best_of: Option<BestOf>,
    /// Whether the Tournament is entered afterwards instead of run live
    pub entered_afterwards: bool,
    /// The entry fee in the currency's smallest unit
    pub entry_fee_amount: Option<i32>,
    /// The ISO 4217 code of the entry fee's currency
    pub entry_fee_currency: Option<MaxStr<3>>,
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
    /// The Deletion turns a deleted Account's Participants into Guests named
    /// by its last username before the Account goes, so the cascade finds
    /// none; see `Tournament::part_with_account`.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub account: Option<ForeignModel<AccountModel>>,

    /// The name an Organizer gave a Guest, `None` for an Account
    pub guest_name: Option<MaxStr<64>>,

    /// The first Round a late Participant plays, `None` for one there before Round 1 started
    pub late_from_round: Option<i16>,

    /// The last Round started before the Participant Dropped, `None` while it plays on
    pub dropped_after_round: Option<i16>,

    /// Whether an Organizer marked the entry fee paid
    ///
    /// Only means something while the Tournament has an entry fee: without
    /// one nobody is unpaid, whatever this says.
    #[rorm(default = false)]
    pub paid: bool,

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
    /// The first Round a late Participant plays
    pub late_from_round: Option<i16>,
    /// Whether the entry fee is paid
    pub paid: bool,
}

/// The primary key of an Account's Participant row in a Tournament
///
/// Derived from both, so a second insert of the same Account collides.
pub fn participant_key(tournament: Uuid, account: Uuid) -> Uuid {
    Uuid::new_v3(&tournament, account.as_bytes())
}

/// An Account named to run a Tournament with its Owner
///
/// The primary key is derived from the Tournament and the Account, see
/// [`co_organizer_key`], so a Tournament holds each Account at most once.
/// Goes with the Tournament and with the Account.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_co_organizer")]
pub struct TournamentCoOrganizerModel {
    /// Primary key, [`co_organizer_key`] of the Tournament and the Account
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Tournament the Account runs
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// The Account running it
    ///
    /// Indexed for the Tournaments an Account runs.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<AccountModel>,

    /// The point in time the Account was named
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentCoOrganizerModel`]
#[derive(Patch)]
#[rorm(model = "TournamentCoOrganizerModel")]
pub struct TournamentCoOrganizerInsertPatch {
    /// Primary key, [`co_organizer_key`] of the Tournament and the Account
    pub uuid: Uuid,
    /// The Tournament the Account runs
    pub tournament: ForeignModel<TournamentModel>,
    /// The Account running it
    pub account: ForeignModel<AccountModel>,
}

/// The primary key of the Co-organizer row naming `account` on `tournament`
///
/// A name-based uuid in the Tournament's namespace: the same pair always gives
/// the same key, so naming an Account twice collides on the primary key.
pub fn co_organizer_key(tournament: Uuid, account: Uuid) -> Uuid {
    Uuid::new_v3(&tournament, account.as_bytes())
}

/// The Owner's offer to hand a Tournament on, until it is accepted, declined or withdrawn
///
/// At most one per Tournament: a new offer replaces the pending one.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_handover")]
pub struct TournamentHandoverModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Tournament offered
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// The Account it is offered to
    ///
    /// Indexed for the offers an Account has to answer.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub offered_to: ForeignModel<AccountModel>,

    /// The point in time the Owner made the offer
    #[rorm(auto_create_time)]
    pub offered_at: OffsetDateTime,
}

/// Insert patch for [`TournamentHandoverModel`]
#[derive(Patch)]
#[rorm(model = "TournamentHandoverModel")]
pub struct TournamentHandoverInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Tournament offered
    pub tournament: ForeignModel<TournamentModel>,
    /// The Account it is offered to
    pub offered_to: ForeignModel<AccountModel>,
}

/// A Round of a Tournament: its number and how far it got
#[derive(Model, Debug)]
#[rorm(rename = "tournament_round")]
pub struct TournamentRoundModel {
    /// Primary key, [`round_key`] of its Tournament and number
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Tournament it belongs to
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// Its number, 1 for the first Round; the Top cut goes on counting after the Swiss Rounds
    pub number: i16,

    /// Whether it is a Swiss Round or one of the Top cut
    #[rorm(default = "Swiss")]
    pub stage: RoundStage,

    /// How far it got
    pub state: RoundState,

    /// The seed its pairing was rolled from, kept to replay it
    pub pairing_seed: i64,

    /// The point in time it was paired
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time it started, `None` while previewed
    pub started_at: Option<OffsetDateTime>,

    /// The point in time it ended, `None` until then
    pub ended_at: Option<OffsetDateTime>,

    /// How many seconds its round timer ran for, `None` for a Round without one
    ///
    /// Taken from the Tournament's round timer length when the Round started.
    pub timer_seconds: Option<i32>,

    /// When time is up, set exactly with [`Self::timer_seconds`]
    pub timer_ends_at: Option<OffsetDateTime>,
}

/// Insert patch for [`TournamentRoundModel`]
#[derive(Patch)]
#[rorm(model = "TournamentRoundModel")]
pub struct TournamentRoundInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Tournament it belongs to
    pub tournament: ForeignModel<TournamentModel>,
    /// Its number
    pub number: i16,
    /// Whether it is a Swiss Round or one of the Top cut
    pub stage: RoundStage,
    /// How far it got
    pub state: RoundState,
    /// The seed its pairing was rolled from
    pub pairing_seed: i64,
}

/// The primary key of a Tournament's Round by its number
///
/// Derived from both, so a Tournament has one Round of each number.
pub fn round_key(tournament: Uuid, number: i16) -> Uuid {
    Uuid::new_v3(&tournament, &number.to_be_bytes())
}

/// A Match of a Round, or a Bye
///
/// The Result lives in [`Self::games_drawn`] and the Seats' games won: it is
/// in once [`Self::games_drawn`] is set, with [`Self::result_state`] beside it. A Bye has no table and no Result.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_match")]
pub struct TournamentMatchModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Round it is played in
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub round: ForeignModel<TournamentRoundModel>,

    /// The number of its table, 1 for the top table; `None` for a Bye
    pub table_number: Option<i16>,

    /// Games nobody won, `None` while it has no Result
    pub games_drawn: Option<i16>,

    /// Where its Result stands, `None` while it has none
    pub result_state: Option<ResultState>,

    /// The Participant who reported the Result, `None` when an Organizer set it or there is none
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub reported_by: Option<ForeignModel<TournamentParticipantModel>>,

    /// The Participant who disputed the Result, `None` unless it is disputed
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub disputed_by: Option<ForeignModel<TournamentParticipantModel>>,
}

/// Insert patch for [`TournamentMatchModel`]
#[derive(Patch)]
#[rorm(model = "TournamentMatchModel")]
pub struct TournamentMatchInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Round it is played in
    pub round: ForeignModel<TournamentRoundModel>,
    /// The number of its table, `None` for a Bye
    pub table_number: Option<i16>,
    /// Games nobody won
    pub games_drawn: Option<i16>,
    /// Where its Result stands
    pub result_state: Option<ResultState>,
    /// Who reported the Result
    pub reported_by: Option<ForeignModel<TournamentParticipantModel>>,
    /// Who disputed the Result
    pub disputed_by: Option<ForeignModel<TournamentParticipantModel>>,
}

/// A Participant's Seat in a Match
#[derive(Model, Debug)]
#[rorm(rename = "tournament_seat")]
pub struct TournamentSeatModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Match
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament_match: ForeignModel<TournamentMatchModel>,

    /// Who sits there
    ///
    /// Cascading: a Participant is only removed before the first Round
    /// starts, and changing the Participants discards the previewed Round anyway.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub participant: ForeignModel<TournamentParticipantModel>,

    /// The Seat number, 1 for the first turn
    pub seat: i16,

    /// Games this Seat won, `None` while the Match has no Result
    pub games_won: Option<i16>,
}

/// Insert patch for [`TournamentSeatModel`]
#[derive(Patch)]
#[rorm(model = "TournamentSeatModel")]
pub struct TournamentSeatInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Match
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// Who sits there
    pub participant: ForeignModel<TournamentParticipantModel>,
    /// The Seat number
    pub seat: i16,
    /// Games this Seat won
    pub games_won: Option<i16>,
}

/// The deck a Participant with an Account registered for a Tournament
///
/// Follows [`Self::deck`] until it is pinned; pinning copies the deck's
/// settings into the columns below and its Deck entries into
/// [`TournamentRegisteredCardModel`] rows, which never change with the deck.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_registered_deck")]
pub struct TournamentRegisteredDeckModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Participant playing it; one Registered deck per Participant
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub participant: ForeignModel<TournamentParticipantModel>,

    /// The deck it was made from, `None` once that deck is deleted
    ///
    /// Indexed for the deck's foreign key action.
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub deck: Option<ForeignModel<DeckModel>>,

    /// The point in time it became a copy, `None` while it follows the deck
    pub pinned_at: Option<OffsetDateTime>,

    /// The deck's name when pinned
    pub name: Option<MaxStr<255>>,

    /// The deck's format when pinned
    pub format: Option<MaxStr<32>>,

    /// The deck's Commander bracket when pinned
    pub bracket: Option<i16>,

    /// The colours the deck could play when pinned
    pub allowed_color_identity: Option<MaxStr<8>>,

    /// Whether the table had agreed to extra commanders when pinned
    #[rorm(default = false)]
    pub allow_extra_commanders: bool,

    /// Whether the table had agreed to extra copies of a card when pinned
    #[rorm(default = false)]
    pub allow_duplicates: bool,

    /// Whether the table had agreed to banned cards when pinned
    #[rorm(default = false)]
    pub allow_banned: bool,

    /// How many cards the deck was built to when pinned
    pub deck_size: Option<i16>,

    /// The point in time it was registered
    #[rorm(auto_create_time)]
    pub registered_at: OffsetDateTime,

    /// Whether the Participant lets others see the list once the Tournament is Finished
    #[rorm(default = false)]
    pub list_shared: bool,
}

/// Insert patch for [`TournamentRegisteredDeckModel`], following its deck
#[derive(Patch)]
#[rorm(model = "TournamentRegisteredDeckModel")]
pub struct TournamentRegisteredDeckInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Participant playing it
    pub participant: ForeignModel<TournamentParticipantModel>,
    /// The deck it is made from
    pub deck: Option<ForeignModel<DeckModel>>,
    /// Whether the list is shared once the Tournament is Finished
    pub list_shared: bool,
}

/// One Deck entry of a pinned Registered deck, copied from its deck
#[derive(Model, Debug)]
#[rorm(rename = "tournament_registered_card")]
pub struct TournamentRegisteredCardModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Registered deck it belongs to
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub registered_deck: ForeignModel<TournamentRegisteredDeckModel>,

    /// Scryfall's id of the printing; no foreign key, like a Deck entry's
    pub printing: Uuid,

    /// How many copies the zone held
    pub quantity: i32,

    /// Which zone the card sat in
    pub zone: DeckZone,

    /// Whether the copies were the foil ones
    pub foil: bool,

    /// Whether the copies were stand-ins rather than the real cards
    pub proxy: bool,
}

/// Insert patch for [`TournamentRegisteredCardModel`]
#[derive(Patch)]
#[rorm(model = "TournamentRegisteredCardModel")]
pub struct TournamentRegisteredCardInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Registered deck it belongs to
    pub registered_deck: ForeignModel<TournamentRegisteredDeckModel>,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies the zone held
    pub quantity: i32,
    /// Which zone the card sat in
    pub zone: DeckZone,
    /// Whether the copies were the foil ones
    pub foil: bool,
    /// Whether the copies were stand-ins
    pub proxy: bool,
}

/// One Match's durable Life history and private recording ownership.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_match_life_history")]
pub struct MatchLifeHistoryModel {
    /// Match identity and lifetime.
    #[rorm(primary_key, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// Complete append-preserving history.
    pub history: Option<Json<MatchLifeHistory>>,
    /// Recording ownership epoch.
    pub generation: i64,
    /// Accepted upload sequence number.
    pub revision: i64,
    /// Public device identity.
    pub writer: Option<Uuid>,
    /// Account holding the private recording capability.
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub writer_account: Option<ForeignModel<AccountModel>>,
    /// Digest of the private random capability.
    pub writer_token_hash: Option<MaxStr<64>>,
    /// Latest server receipt time.
    pub updated_at: OffsetDateTime,
}

/// Insert patch for a deliberately claimed Match.
#[derive(Patch)]
#[rorm(model = "MatchLifeHistoryModel")]
pub struct MatchLifeHistoryInsertPatch {
    /// Match identity.
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// Initially absent uploaded history.
    pub history: Option<Json<MatchLifeHistory>>,
    /// Initial ownership epoch.
    pub generation: i64,
    /// Initial saved revision.
    pub revision: i64,
    /// Public device identity.
    pub writer: Option<Uuid>,
    /// Claiming Account.
    pub writer_account: Option<ForeignModel<AccountModel>>,
    /// Private capability digest.
    pub writer_token_hash: Option<MaxStr<64>>,
    /// Claim receipt time.
    pub updated_at: OffsetDateTime,
}

/// Stable acknowledgement of a history request, retained for safe late retries.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_match_life_receipt")]
pub struct MatchLifeReceiptModel {
    /// Deterministic Match/request identity.
    #[rorm(primary_key)]
    pub uuid: Uuid,
    /// The Match whose history was affected.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// Digest of operation and exact typed request.
    pub request_hash: MaxStr<64>,
    /// Account that made the accepted request.
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<AccountModel>,
    /// Revision accepted at that time, independent of later uploads.
    pub accepted_revision: i64,
}

/// Insert patch for a committed history request.
#[derive(Patch)]
#[rorm(model = "MatchLifeReceiptModel")]
pub struct MatchLifeReceiptInsertPatch {
    /// Deterministic Match/request identity.
    pub uuid: Uuid,
    /// Match lifetime.
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// Typed request digest.
    pub request_hash: MaxStr<64>,
    /// Requesting Account.
    pub account: ForeignModel<AccountModel>,
    /// Revision originally accepted.
    pub accepted_revision: i64,
}

/// A recovered private branch, independent of the current Match timeline.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_match_life_conflict")]
pub struct MatchLifeConflictModel {
    /// Deterministic Match and capture-request identity.
    #[rorm(primary_key)]
    pub uuid: Uuid,
    /// Match lifetime and authorized audience.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// Complete recovered branch, never applied to the active history.
    pub history: Json<MatchLifeHistory>,
    /// Device that recorded the branch.
    pub device: Uuid,
    /// Former recording epoch.
    pub generation: i64,
    /// Last server revision known to that recording device.
    pub base_revision: i64,
    /// Submitting Account, with artifacts retained after deletion.
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub account: Option<ForeignModel<AccountModel>>,
    /// Server capture time.
    pub captured_at: OffsetDateTime,
}

/// Insert patch for a recovered branch.
#[derive(Patch)]
#[rorm(model = "MatchLifeConflictModel")]
pub struct MatchLifeConflictInsertPatch {
    /// Deterministic identity.
    pub uuid: Uuid,
    /// Match lifetime.
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// Recovered branch.
    pub history: Json<MatchLifeHistory>,
    /// Recording device.
    pub device: Uuid,
    /// Source epoch.
    pub generation: i64,
    /// Source revision.
    pub base_revision: i64,
    /// Submitting Account.
    pub account: Option<ForeignModel<AccountModel>>,
    /// Capture time.
    pub captured_at: OffsetDateTime,
}
