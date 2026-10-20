//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::deck::db::DeckModel;
use crate::models::tournament::AuditAction;
use crate::models::tournament::DecklistPolicy;
use crate::models::tournament::MatchStatus;
use crate::models::tournament::OrganizerRole;
use crate::models::tournament::PairingSystem;
use crate::models::tournament::ParticipantAudience;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::RoundKind;
use crate::models::tournament::RoundStatus;
use crate::models::tournament::TournamentStatus;
use crate::models::visibility::Visibility;

/// A tournament: an event with a roster, rounds and standings
#[derive(Model, Debug)]
#[rorm(rename = "tournament")]
pub struct TournamentModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account that created the event (indexed for "my tournaments")
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// Name of the tournament
    pub name: MaxStr<128>,

    /// Optional description: what is played, what it costs, what there is to win
    pub description: Option<MaxStr<1024>>,

    /// The format being played, a free-form Scryfall slug like `deck.format`
    pub format: MaxStr<32>,

    /// How many players sit at one table, 2..=5 (validated at the API)
    pub pod_size: i16,

    /// Best-of how many games a 1v1 match is; odd 1..=5, forced to one for pods
    pub games_per_match: i16,

    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,

    /// Where the event stands in its lifecycle
    pub status: TournamentStatus,

    /// Match points for a win
    pub points_win: i16,

    /// Match points for a draw
    pub points_draw: i16,

    /// Match points for a loss
    pub points_loss: i16,

    /// Match points for a bye
    pub points_bye: i16,

    /// Default round length in minutes, copied onto each round when it starts
    pub round_minutes: i16,

    /// Player cap, `None` for none; only self-service registration is held to it
    pub max_participants: Option<i16>,

    /// How many scoring rounds the event means to play; editable while running, as the MTR allows
    pub planned_rounds: Option<i16>,

    /// Whether players may still register after the event started
    #[rorm(default = true)]
    pub allow_late_entry: bool,

    /// Whether a late entry's missed rounds count as match losses
    #[rorm(default = true)]
    pub late_entry_as_losses: bool,

    /// How the tournament requires its players to hand in a decklist
    #[rorm(default = "Optional")]
    pub decklist_policy: DecklistPolicy,

    /// When decklists were locked tournament-wide, `None` while players may edit them
    pub decklists_locked_at: Option<OffsetDateTime>,

    /// Who may see this tournament's roster at all
    #[rorm(default = "Participants")]
    pub participant_audience: ParticipantAudience,

    /// Whether a guest's real name is shown to non-staff, non-participant readers (opt-in)
    #[rorm(default = false)]
    pub guest_names_public: bool,

    /// Who may see the event at all
    pub visibility: Visibility,

    /// Secret of the share link, `None` once the link is revoked
    #[rorm(unique)]
    pub share_token: Option<MaxStr<64>>,

    /// The short code players join by; nulled when the event ends to reclaim the code space
    #[rorm(unique)]
    pub join_code: Option<MaxStr<8>>,

    /// When the join code stops resolving
    pub join_code_expires_at: Option<OffsetDateTime>,

    /// Where the event takes place, in the organizer's words
    pub venue: Option<MaxStr<255>>,

    /// The venue's address, snapshotted at save time (no FK into [`TournamentVenueModel`])
    pub venue_address: Option<MaxStr<512>>,

    /// How to actually get in, snapshotted like [`Self::venue_address`]
    pub venue_instructions: Option<MaxStr<1024>>,

    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,

    /// When the event finished and its standings were frozen
    pub finished_at: Option<OffsetDateTime>,

    /// The point in time the tournament was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentModel`]
#[derive(Patch)]
#[rorm(model = "TournamentModel")]
pub struct TournamentInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account that created the event
    pub owner: ForeignModel<AccountModel>,
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The format being played
    pub format: MaxStr<32>,
    /// How many players sit at one table
    pub pod_size: i16,
    /// Best-of how many games a 1v1 match is
    pub games_per_match: i16,
    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,
    /// Where the event stands in its lifecycle
    pub status: TournamentStatus,
    /// Match points for a win
    pub points_win: i16,
    /// Match points for a draw
    pub points_draw: i16,
    /// Match points for a loss
    pub points_loss: i16,
    /// Match points for a bye
    pub points_bye: i16,
    /// Default round length in minutes
    pub round_minutes: i16,
    /// How many players fit, `None` for no limit
    pub max_participants: Option<i16>,
    /// How many scoring rounds the event means to play, `None` while undecided
    pub planned_rounds: Option<i16>,
    /// Whether players may still register after the start
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as losses
    pub late_entry_as_losses: bool,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// Who may see the roster
    pub participant_audience: ParticipantAudience,
    /// Whether a guest's real name is public
    pub guest_names_public: bool,
    /// Who may see the event
    pub visibility: Visibility,
    /// Secret of the share link
    pub share_token: Option<MaxStr<64>>,
    /// The short code players join by
    pub join_code: Option<MaxStr<8>>,
    /// When the join code stops resolving
    pub join_code_expires_at: Option<OffsetDateTime>,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// The venue's address
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in
    pub venue_instructions: Option<MaxStr<1024>>,
    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,
}

/// An account helping to run a tournament (never the owner); unique per account via raw SQL
#[derive(Model, Debug)]
#[rorm(rename = "tournament_organizer")]
pub struct TournamentOrganizerModel {
    /// Primary key
    #[rorm(
        primary_key,
        index(name = "tournament_organizer_tournament", priority = 2)
    )]
    pub uuid: Uuid,

    /// The tournament being helped with
    #[rorm(
        index(name = "tournament_organizer_tournament", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub tournament: ForeignModel<TournamentModel>,

    /// The helping account (indexed for "events I help run")
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<AccountModel>,

    /// What the helper may do
    pub role: OrganizerRole,

    /// The point in time the helper was added
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentOrganizerModel`]
#[derive(Patch)]
#[rorm(model = "TournamentOrganizerModel")]
pub struct TournamentOrganizerInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament being helped with
    pub tournament: ForeignModel<TournamentModel>,
    /// The helping account
    pub account: ForeignModel<AccountModel>,
    /// What the helper may do
    pub role: OrganizerRole,
}

/// Somebody playing in a tournament; the display name is denormalized to survive renames
#[derive(Model, Debug)]
#[rorm(rename = "tournament_participant")]
pub struct TournamentParticipantModel {
    /// Primary key
    #[rorm(
        primary_key,
        index(name = "tournament_participant_tournament", priority = 2)
    )]
    pub uuid: Uuid,

    /// The tournament being played in
    #[rorm(
        index(name = "tournament_participant_tournament", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub tournament: ForeignModel<TournamentModel>,

    /// The account behind the player, `None` for a guest; unique per tournament via raw SQL
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub account: Option<ForeignModel<AccountModel>>,

    /// The name the player appears under
    pub display_name: MaxStr<64>,

    /// [`Self::display_name`] lowercased, the league resolver's lookup key
    pub name_normalized: MaxStr<64>,

    /// Where the player stands in the event
    pub status: ParticipantStatus,

    /// The first round the player was part of, one for everyone on time
    #[rorm(default = 1)]
    pub entered_round: i16,

    /// The last round the player was paired into, `None` while active
    pub dropped_after_round: Option<i16>,

    /// Random seed for the last tiebreaker, seat shuffling and a guest's pseudonym
    pub seed: i32,

    /// The organizer's manual tiebreak value, zero unless touched
    #[rorm(default = 0)]
    pub manual_tiebreak: i32,

    /// Bearer secret a guest re-attaches or claims this row with; nulled once claimed
    #[rorm(unique)]
    pub claim_token: Option<MaxStr<64>>,

    /// When the player checked in, `None` until they did
    pub checked_in_at: Option<OffsetDateTime>,

    /// Organizer-only notes on the player
    pub notes: Option<MaxStr<512>>,

    /// The table this player must sit at; only affects table numbering, not pairing
    pub fixed_table: Option<i16>,

    /// The point in time the player registered
    #[rorm(auto_create_time)]
    pub registered_at: OffsetDateTime,
}

/// Insert patch for [`TournamentParticipantModel`]
#[derive(Patch)]
#[rorm(model = "TournamentParticipantModel")]
pub struct TournamentParticipantInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament being played in
    pub tournament: ForeignModel<TournamentModel>,
    /// The account behind the player, `None` for a guest
    pub account: Option<ForeignModel<AccountModel>>,
    /// The name the player appears under
    pub display_name: MaxStr<64>,
    /// The display name lowercased
    pub name_normalized: MaxStr<64>,
    /// Where the player stands in the event
    pub status: ParticipantStatus,
    /// The first round the player was part of
    pub entered_round: i16,
    /// Random tiebreak seed
    pub seed: i32,
    /// When the player checked in — set at once for a walk-in the desk added
    pub checked_in_at: Option<OffsetDateTime>,
    /// The secret a guest attaches or claims this row with
    pub claim_token: Option<MaxStr<64>>,
}

/// One organizer-visible line in a tournament's history; append-only
#[derive(Model, Debug)]
#[rorm(rename = "tournament_audit")]
pub struct TournamentAuditModel {
    /// Primary key
    #[rorm(primary_key, index(name = "tournament_audit_tournament", priority = 2))]
    pub uuid: Uuid,

    /// The tournament the entry belongs to
    #[rorm(
        index(name = "tournament_audit_tournament", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub tournament: ForeignModel<TournamentModel>,

    /// The account that acted, `None` once it is deleted or for the system
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub actor_account: Option<ForeignModel<AccountModel>>,

    /// What happened
    pub action: AuditAction,

    /// What it happened to; a bare uuid so no cascade can delete the audit trail
    pub subject: Option<Uuid>,

    /// A short rendered account of the change, for reading, not for replay
    pub detail: Option<MaxStr<1024>>,

    /// The point in time the entry was written
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentAuditModel`]
#[derive(Patch)]
#[rorm(model = "TournamentAuditModel")]
pub struct TournamentAuditInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament the entry belongs to
    pub tournament: ForeignModel<TournamentModel>,
    /// The account that acted
    pub actor_account: Option<ForeignModel<AccountModel>>,
    /// What happened
    pub action: AuditAction,
    /// What it happened to
    pub subject: Option<Uuid>,
    /// A short rendered account of the change
    pub detail: Option<MaxStr<1024>>,
}

/// A participant's decklist, split off the participant row to keep roster polls light
#[derive(Model, Debug)]
#[rorm(rename = "tournament_decklist")]
pub struct TournamentDecklistModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The tournament this list belongs to, denormalized to scope queries without a join
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// The player this list belongs to (unique: one list per player)
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub participant: ForeignModel<TournamentParticipantModel>,

    /// The deck the text was rendered from, if any; provenance only
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub deck: Option<ForeignModel<DeckModel>>,

    /// The list itself — the only thing anybody ever reads
    pub text: MaxStr<16384>,

    /// The point in time the list was first written
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time the list was last written (rorm needs `auto_create_time` here too)
    #[rorm(auto_create_time, auto_update_time)]
    pub updated_at: OffsetDateTime,
}

/// Insert patch for [`TournamentDecklistModel`]
#[derive(Patch)]
#[rorm(model = "TournamentDecklistModel")]
pub struct TournamentDecklistInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament this list belongs to
    pub tournament: ForeignModel<TournamentModel>,
    /// The player this list belongs to
    pub participant: ForeignModel<TournamentParticipantModel>,
    /// The Planarium deck the text was rendered from, if any
    pub deck: Option<ForeignModel<DeckModel>>,
    /// The list itself
    pub text: MaxStr<16384>,
}

/// A venue in an account's book, for the picker; tournaments snapshot it, never reference it
#[derive(Model, Debug)]
#[rorm(rename = "tournament_venue")]
pub struct TournamentVenueModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Name of the place
    pub name: MaxStr<255>,

    /// [`Self::name`] lowercased; unique with [`Self::owner`] via a raw-SQL index
    pub name_normalized: MaxStr<255>,

    /// Where it is, in the organizer's words
    pub address: Option<MaxStr<512>>,

    /// How to actually get in — "Hinterhof, bitte klingeln" and the like
    pub instructions: Option<MaxStr<1024>>,

    /// The account this venue belongs to
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The point in time the venue was first used
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// When the venue was last used; a plain column written only by `venue::remember`
    pub last_used_at: OffsetDateTime,
}

/// Insert patch for [`TournamentVenueModel`]
#[derive(Patch)]
#[rorm(model = "TournamentVenueModel")]
pub struct TournamentVenueInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Name of the place
    pub name: MaxStr<255>,
    /// The name lowercased
    pub name_normalized: MaxStr<255>,
    /// Where it is
    pub address: Option<MaxStr<512>>,
    /// How to actually get in
    pub instructions: Option<MaxStr<1024>>,
    /// The account this venue belongs to
    pub owner: ForeignModel<AccountModel>,
    /// The point in time the venue was last used
    pub last_used_at: OffsetDateTime,
}

/// One round of a tournament; `sequence` counts every round, `number` only Swiss ones
#[derive(Model)]
#[rorm(rename = "tournament_round")]
pub struct TournamentRoundModel {
    /// Primary key
    #[rorm(primary_key)]
    #[rorm(index(name = "tournament_round_tournament", priority = 2))]
    pub uuid: Uuid,

    /// The tournament this round belongs to
    #[rorm(index(name = "tournament_round_tournament", priority = 1))]
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// What this round is for
    pub kind: RoundKind,

    /// Where the round sits among every round of this event, 1-based
    pub sequence: i16,

    /// The number on the pairings sheet, `None` for an unscored round
    pub number: Option<i16>,

    /// Where the round stands
    pub status: RoundStatus,

    /// How many players shared a table, `None` for a round with no tables
    pub pod_size: Option<i16>,

    /// The seed the pairing was rolled from; stored so a re-pair differs and a pairing replays
    pub pairing_seed: i64,

    /// How long the round's clock runs for, in seconds (`i32`: 600 minutes overflow `i16`)
    pub length_seconds: i32,

    /// When the clock runs out, `None` while it has never been started
    pub timer_ends_at: Option<OffsetDateTime>,

    /// When the clock was paused, `None` while it is running or idle
    pub timer_paused_at: Option<OffsetDateTime>,

    /// When the round was handed to the room
    pub started_at: Option<OffsetDateTime>,

    /// When the round was closed
    pub completed_at: Option<OffsetDateTime>,

    /// The point in time the round was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentRoundModel`]
#[derive(Patch)]
#[rorm(model = "TournamentRoundModel")]
pub struct TournamentRoundInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament this round belongs to
    pub tournament: ForeignModel<TournamentModel>,
    /// What this round is for
    pub kind: RoundKind,
    /// Where the round sits among every round of this event
    pub sequence: i16,
    /// The number on the pairings sheet, `None` for an unscored round
    pub number: Option<i16>,
    /// Where the round stands
    pub status: RoundStatus,
    /// How many players shared a table
    pub pod_size: Option<i16>,
    /// The seed the pairing was rolled from
    pub pairing_seed: i64,
    /// How long the round's clock runs for, in seconds
    pub length_seconds: i32,
}

/// One table in a round
#[derive(Model)]
#[rorm(rename = "tournament_match")]
pub struct TournamentMatchModel {
    /// Primary key
    #[rorm(primary_key)]
    #[rorm(index(name = "tournament_match_round", priority = 2))]
    pub uuid: Uuid,

    /// The round this table belongs to
    #[rorm(index(name = "tournament_match_round", priority = 1))]
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub round: ForeignModel<TournamentRoundModel>,

    /// The tournament, denormalized so table mutations scope by tournament in one statement
    #[rorm(index)]
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// The number on the table
    pub table_number: i16,

    /// How far the result has got
    pub status: MatchStatus,

    /// Whether this is a bye rather than a table
    #[rorm(default = false)]
    pub is_bye: bool,

    /// Who won, `None` for a draw or an unplayed table
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub winner_participant: Option<ForeignModel<TournamentParticipantModel>>,

    /// Whether the match was drawn, so outcomes read without consulting [`Self::status`]
    #[rorm(default = false)]
    pub is_draw: bool,

    /// How many games inside the match were drawn
    #[rorm(default = 0)]
    pub games_drawn: i16,

    /// Extra time a judge gave this table, in seconds
    #[rorm(default = 0)]
    pub extra_seconds: i32,

    /// Whether the desk wrote this result itself, beating every player report
    #[rorm(default = false)]
    pub organizer_override: bool,

    /// When the result was recorded
    pub result_recorded_at: Option<OffsetDateTime>,

    /// Which account recorded it, `None` when players agreed it between them
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub result_recorded_by: Option<ForeignModel<AccountModel>>,

    /// The point in time the table was paired
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentMatchModel`]
#[derive(Patch)]
#[rorm(model = "TournamentMatchModel")]
pub struct TournamentMatchInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The round this table belongs to
    pub round: ForeignModel<TournamentRoundModel>,
    /// The tournament, denormalized
    pub tournament: ForeignModel<TournamentModel>,
    /// The number on the table
    pub table_number: i16,
    /// How far the result has got
    pub status: MatchStatus,
    /// Whether this is a bye rather than a table
    pub is_bye: bool,
    /// Who won, set at once for a bye
    pub winner_participant: Option<ForeignModel<TournamentParticipantModel>>,
    /// When the result was recorded, set at once for a bye
    pub result_recorded_at: Option<OffsetDateTime>,
}

/// One player's place at one table
#[derive(Model)]
#[rorm(rename = "tournament_seat")]
pub struct TournamentSeatModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The table
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub tournament_match: ForeignModel<TournamentMatchModel>,

    /// The tournament, denormalized — same reasoning as on the table itself
    #[rorm(index)]
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// Who sits here; indexed for the per-poll "which table am I at" query
    #[rorm(index)]
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub participant: ForeignModel<TournamentParticipantModel>,

    /// Turn order at the table, 1-based — seat one goes first
    pub seat: i16,

    /// How many games this seat won
    #[rorm(default = 0)]
    pub games_won: i16,

    /// The point in time the seat was written
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentSeatModel`]
#[derive(Patch)]
#[rorm(model = "TournamentSeatModel")]
pub struct TournamentSeatInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The table
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// The tournament, denormalized
    pub tournament: ForeignModel<TournamentModel>,
    /// Who sits here
    pub participant: ForeignModel<TournamentParticipantModel>,
    /// Turn order at the table
    pub seat: i16,
}

/// What one player says happened at their table; one row per reporter, corrected in place
#[derive(Model)]
#[rorm(rename = "tournament_result_report")]
pub struct TournamentResultReportModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The table being reported on
    #[rorm(index)]
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub tournament_match: ForeignModel<TournamentMatchModel>,

    /// The tournament, denormalized
    #[rorm(index)]
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// Which seat filed this claim
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub reported_by: ForeignModel<TournamentParticipantModel>,

    /// The account behind that seat, `None` for a guest
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub reported_by_account: Option<ForeignModel<AccountModel>>,

    /// Who the reporter says won, `None` when they claim a draw
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub claimed_winner: Option<ForeignModel<TournamentParticipantModel>>,

    /// Whether the reporter claims a draw
    #[rorm(default = false)]
    pub claimed_draw: bool,

    /// Games the claimed winner took
    #[rorm(default = 0)]
    pub claimed_winner_games: i16,

    /// Games the claimed loser took
    #[rorm(default = 0)]
    pub claimed_loser_games: i16,

    /// Games inside the match the reporter says were drawn
    #[rorm(default = 0)]
    pub claimed_games_drawn: i16,

    /// The key the client minted for this tap; an unchanged key is a duplicate and writes nothing
    pub client_key: MaxStr<64>,

    /// The point in time the claim was first filed
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time the claim was last changed
    #[rorm(auto_create_time, auto_update_time)]
    pub updated_at: OffsetDateTime,
}

/// Insert patch for [`TournamentResultReportModel`]
#[derive(Patch)]
#[rorm(model = "TournamentResultReportModel")]
pub struct TournamentResultReportInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The table being reported on
    pub tournament_match: ForeignModel<TournamentMatchModel>,
    /// The tournament, denormalized
    pub tournament: ForeignModel<TournamentModel>,
    /// Which seat filed this claim
    pub reported_by: ForeignModel<TournamentParticipantModel>,
    /// The account behind that seat
    pub reported_by_account: Option<ForeignModel<AccountModel>>,
    /// Who the reporter says won
    pub claimed_winner: Option<ForeignModel<TournamentParticipantModel>>,
    /// Whether the reporter claims a draw
    pub claimed_draw: bool,
    /// Games the claimed winner took
    pub claimed_winner_games: i16,
    /// Games the claimed loser took
    pub claimed_loser_games: i16,
    /// Games inside the match the reporter says were drawn
    pub claimed_games_drawn: i16,
    /// The key the client minted for this tap
    pub client_key: MaxStr<64>,
}
