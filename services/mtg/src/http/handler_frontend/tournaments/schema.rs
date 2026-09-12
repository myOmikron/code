//! Schemas for the tournament roster surface
//!
//! [`TournamentResponse::from_parts`] is the one place [`Tournament::share_token`]
//! and [`Tournament::join_code`] are redacted to `None` for a viewer holding no
//! role — every handler that hands out a tournament goes through it rather than
//! building the response by hand, so the redaction cannot be forgotten on a new
//! route.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::deck::DeckUuid;
use crate::models::tournament::AuditAction;
use crate::models::tournament::DecklistPolicy;
use crate::models::tournament::MatchStatus;
use crate::models::tournament::OrganizerRole;
use crate::models::tournament::PairingSystem;
use crate::models::tournament::ParticipantAudience;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::RoundKind;
use crate::models::tournament::RoundStatus;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAuditEntry;
use crate::models::tournament::TournamentMatchUuid;
use crate::models::tournament::TournamentOrganizer;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentRole;
use crate::models::tournament::TournamentRoundUuid;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::TournamentVenueUuid;
use crate::models::tournament::TournamentWithViewer;
use crate::models::tournament::decklist::Decklist;
use crate::models::tournament::listing::TournamentListEntry;
use crate::models::tournament::pairing::MatchSeat;
use crate::models::tournament::pairing::MatchTable;
use crate::models::tournament::participant::TournamentParticipant;
use crate::models::tournament::round::Round;
use crate::models::tournament::venue::Venue;
use crate::models::visibility::Visibility;
use crate::tournament::standings::Tiebreaker;
use crate::tournament::timer;
use crate::tournament::timer::TimerState;

/// A tournament, as an actor may see it
///
/// [`Self::share_token`] and [`Self::join_code`] are organizer-only secrets:
/// see [`Self::from_parts`].
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentResponse {
    /// Primary key
    pub uuid: TournamentUuid,
    /// The account that created the event
    pub owner: AccountUuid,
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
    /// Whether players may still register after the event started
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    pub late_entry_as_losses: bool,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// When decklists were locked tournament-wide, `None` while players may
    /// still write their own
    pub decklists_locked_at: Option<SchemaDateTime>,
    /// Who may see this tournament's roster at all
    pub participant_audience: ParticipantAudience,
    /// Whether a guest's real name is shown to a reader who is neither staff
    /// nor a participant
    pub guest_names_public: bool,
    /// Who may see the event at all
    pub visibility: Visibility,
    /// Secret of the share link, organizer-only — `None` for every other viewer
    pub share_token: Option<MaxStr<64>>,
    /// The raw join code, organizer-only — `None` for every other viewer
    ///
    /// Raw, not the `XXX-XXX` display form: the frontend renders that split.
    pub join_code: Option<MaxStr<8>>,
    /// When the join code stops resolving
    pub join_code_expires_at: Option<SchemaDateTime>,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// The venue's address, meaningful only alongside [`Self::venue`]
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in, meaningful only alongside [`Self::venue`]
    pub venue_instructions: Option<MaxStr<1024>>,
    /// When the event is announced to start
    pub starts_at: Option<SchemaDateTime>,
    /// When the event finished and its standings were frozen
    pub finished_at: Option<SchemaDateTime>,
    /// The point in time the tournament was created
    pub created_at: SchemaDateTime,
}

impl TournamentResponse {
    /// Build the response, redacting [`Self::share_token`]/[`Self::join_code`]
    /// unless `viewer_role` proves the viewer holds a role on this tournament
    pub fn from_parts(tournament: Tournament, viewer_role: Option<TournamentRole>) -> Self {
        let role_holder = viewer_role.is_some();
        Self {
            uuid: tournament.uuid,
            owner: tournament.owner,
            name: tournament.name,
            description: tournament.description,
            format: tournament.format,
            pod_size: tournament.pod_size,
            games_per_match: tournament.games_per_match,
            pairing_system: tournament.pairing_system,
            status: tournament.status,
            points_win: tournament.points_win,
            points_draw: tournament.points_draw,
            points_loss: tournament.points_loss,
            points_bye: tournament.points_bye,
            round_minutes: tournament.round_minutes,
            max_participants: tournament.max_participants,
            planned_rounds: tournament.planned_rounds,
            allow_late_entry: tournament.allow_late_entry,
            late_entry_as_losses: tournament.late_entry_as_losses,
            decklist_policy: tournament.decklist_policy,
            decklists_locked_at: tournament.decklists_locked_at.map(SchemaDateTime),
            participant_audience: tournament.participant_audience,
            guest_names_public: tournament.guest_names_public,
            visibility: tournament.visibility,
            share_token: role_holder.then_some(tournament.share_token).flatten(),
            join_code: role_holder.then_some(tournament.join_code).flatten(),
            join_code_expires_at: tournament.join_code_expires_at.map(SchemaDateTime),
            venue: tournament.venue,
            venue_address: tournament.venue_address,
            venue_instructions: tournament.venue_instructions,
            starts_at: tournament.starts_at.map(SchemaDateTime),
            finished_at: tournament.finished_at.map(SchemaDateTime),
            created_at: SchemaDateTime(tournament.created_at),
        }
    }
}

/// What the viewer of a tournament may do with it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentViewerResponse {
    /// Whether the viewer holds any staff role (owner counts as one)
    pub is_organizer: bool,
    /// Whether the viewer's role is trusted with settings/status/visibility/staff
    pub may_manage: bool,
    /// The viewer's own participant row, if they have one
    pub participant: Option<TournamentParticipantUuid>,
}

impl TournamentViewerResponse {
    fn from_parts(
        role: Option<TournamentRole>,
        participant: Option<TournamentParticipantUuid>,
    ) -> Self {
        Self {
            is_organizer: role.is_some(),
            may_manage: role.is_some_and(TournamentRole::may_manage),
            participant,
        }
    }
}

/// One tournament plus what the viewer who asked for it may do with it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetTournamentResponse {
    /// The tournament itself
    pub tournament: TournamentResponse,
    /// What the viewer may do with it
    pub viewer: TournamentViewerResponse,
    /// How many people are on the roster — the true count, never redacted by
    /// [`crate::models::tournament::public::roster_view`]: an event may
    /// advertise "12 angemeldet" while keeping the names to itself
    pub participant_count: i64,
}

impl GetTournamentResponse {
    pub fn from_with_viewer(with_viewer: TournamentWithViewer, participant_count: i64) -> Self {
        let TournamentWithViewer {
            tournament,
            role,
            participant,
        } = with_viewer;
        Self {
            tournament: TournamentResponse::from_parts(tournament, role),
            viewer: TournamentViewerResponse::from_parts(role, participant),
            participant_count,
        }
    }
}

/// One row of the tournament list: an event plus what this viewer is to it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentListEntryResponse {
    /// The tournament itself
    pub tournament: TournamentResponse,
    /// What the viewer may do with it
    pub viewer: TournamentViewerResponse,
    /// How many people are on the roster
    pub participant_count: i64,
}

impl From<TournamentListEntry> for TournamentListEntryResponse {
    fn from(entry: TournamentListEntry) -> Self {
        Self {
            tournament: TournamentResponse::from_parts(entry.tournament, entry.role),
            viewer: TournamentViewerResponse::from_parts(entry.role, entry.participant),
            participant_count: entry.participant_count,
        }
    }
}

/// Every tournament the actor may see
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTournamentsResponse {
    /// The tournaments, newest-starting first
    pub tournaments: Vec<TournamentListEntryResponse>,
}

/// The editable shape of a tournament, shared by [`CreateTournamentRequest`] and
/// [`super::handler::update_tournament`]
///
/// One type for both requests: an update sends exactly the same fields a
/// create does, minus [`Visibility`] (which has its own endpoint and its own
/// audit action). Validated in the handler against
/// [`TournamentSettingsErrors`].
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentSettingsRequest {
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The format being played: a slug [`crate::models::format::rules_for`]
    /// knows, or one of [`crate::models::format::LIMITED_FORMATS`]
    pub format: MaxStr<32>,
    /// How many players sit at one table, 2..=5
    ///
    /// The client derives it from the format — pods of four for the
    /// commander formats, two for everything else — rather than asking for
    /// it; the bound stays here because the request still carries it.
    pub pod_size: i16,
    /// Best-of how many games a 1v1 match is, odd and 1..=5 — forced to 1 above pod_size 2
    pub games_per_match: i16,
    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,
    /// Match points for a win
    pub points_win: i16,
    /// Match points for a draw
    pub points_draw: i16,
    /// Match points for a loss
    pub points_loss: i16,
    /// Match points for a bye
    pub points_bye: i16,
    /// Default round length in minutes, 10..=600
    pub round_minutes: i16,
    /// How many players fit, `None` for an event that turns nobody away.
    /// Held against self-service registration only.
    #[serde(default)]
    pub max_participants: Option<i16>,
    /// How many scoring rounds the event means to play, `None` while undecided.
    /// Always editable, the event's own schedule rather than a locked rule.
    #[serde(default)]
    pub planned_rounds: Option<i16>,
    /// Whether players may still register *themselves* after the event
    /// started — an organizer can always add a late entry at the desk. The
    /// client no longer offers this and sends `false`.
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    ///
    /// Sent as `false` by the client: that is the organizer's call when they
    /// add the player, not a rule fixed up front.
    pub late_entry_as_losses: bool,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// Who may see this tournament's roster at all
    pub participant_audience: ParticipantAudience,
    /// Whether a guest's real name is shown to a reader who is neither staff
    /// nor a participant
    pub guest_names_public: bool,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// The venue's address — meaningful only alongside [`Self::venue`]; the
    /// handler blanks it when `venue` is empty
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in ("Hinterhof, bitte klingeln") — meaningful
    /// only alongside [`Self::venue`], shown to everyone who can see the
    /// tournament
    pub venue_instructions: Option<MaxStr<1024>>,
    /// When the event is announced to start
    pub starts_at: Option<SchemaDateTime>,
}

/// Request to create a tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateTournamentRequest {
    /// The tournament's settings
    pub settings: TournamentSettingsRequest,
    /// Who may see the event at first
    pub visibility: Visibility,
}

/// Why a [`TournamentSettingsRequest`] was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct TournamentSettingsErrors {
    /// `pod_size` is outside 2..=5
    pub invalid_pod_size: bool,
    /// `games_per_match` is even, outside 1..=5, or not 1 while `pod_size` is above 2
    pub invalid_games_per_match: bool,
    /// One of the point values is negative
    pub invalid_points: bool,
    /// `round_minutes` is outside 10..=600
    pub invalid_round_length: bool,
    /// `planned_rounds` was given as zero or negative
    pub invalid_planned_rounds: bool,
    /// `max_participants` was given as zero or negative
    pub invalid_max_participants: bool,
    /// The format slug is not one
    /// [`crate::models::format::is_tournament_format`] accepts
    pub invalid_format: bool,
    /// The event no longer allows structural changes — see
    /// [`crate::models::tournament::Tournament::update_settings`]
    pub settings_locked: bool,
}

/// Request to move a tournament to a new lifecycle status
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetTournamentStatusRequest {
    /// The status to move to
    pub status: TournamentStatus,
}

/// A round's clock, with the server's own reading of the time beside it
///
/// One struct rather than two sibling fields, so that serialising a deadline
/// without the reference point it is measured against is not expressible. A
/// phone with a wrong clock is the normal case, not the exception.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TimerResponse {
    /// Where the clock stands
    pub state: TimerStateResponse,
    /// How long the round runs for, in seconds
    pub length_seconds: i32,
    /// When it runs out
    pub ends_at: Option<SchemaDateTime>,
    /// When it was paused
    pub paused_at: Option<SchemaDateTime>,
    /// Seconds left, computed by the server and never below zero
    pub remaining_seconds: i32,
}

/// Where a clock stands
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema)]
pub enum TimerStateResponse {
    /// Never started
    Idle,
    /// Counting down
    Running,
    /// Stopped, with time left
    Paused,
    /// Started and run out
    Expired,
}

impl From<TimerState> for TimerStateResponse {
    fn from(value: TimerState) -> Self {
        match value {
            TimerState::Idle => Self::Idle,
            TimerState::Running => Self::Running,
            TimerState::Paused => Self::Paused,
            TimerState::Expired => Self::Expired,
        }
    }
}

/// One round, as every surface reads it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RoundResponse {
    /// Primary key
    pub uuid: TournamentRoundUuid,
    /// What the round is for
    pub kind: RoundKind,
    /// Where it sits among every round of this event
    pub sequence: i16,
    /// The number on the pairings sheet, `null` for a draft or deckbuilding
    /// stage — which is exactly what keeps those out of the round count
    pub number: Option<i16>,
    /// Where the round stands
    pub status: RoundStatus,
    /// How many players share a table
    pub pod_size: Option<i16>,
    /// The round's clock
    pub timer: TimerResponse,
    /// When the round was handed to the room
    pub started_at: Option<SchemaDateTime>,
    /// When it was closed
    pub completed_at: Option<SchemaDateTime>,
}

impl RoundResponse {
    /// Build a response from a round and the moment it was read
    ///
    /// @param round the round
    /// @param now the server's own reading of the time
    ///
    /// @returns the response
    pub fn from_round(round: Round, now: OffsetDateTime) -> Self {
        let timer = round.timer();
        Self {
            uuid: round.uuid,
            kind: round.kind,
            sequence: round.sequence,
            number: round.number,
            status: round.status,
            pod_size: round.pod_size,
            timer: TimerResponse {
                state: timer::state(&timer, now).into(),
                length_seconds: timer.length_seconds,
                ends_at: timer.ends_at.map(SchemaDateTime),
                paused_at: timer.paused_at.map(SchemaDateTime),
                remaining_seconds: timer::remaining_seconds(&timer, now),
            },
            started_at: round.started_at.map(SchemaDateTime),
            completed_at: round.completed_at.map(SchemaDateTime),
        }
    }
}

/// Every round of a tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListRoundsResponse {
    /// The rounds, oldest first
    pub rounds: Vec<RoundResponse>,
    /// The server's own reading of the time, for clock skew
    pub server_time: SchemaDateTime,
}

/// What a client polls to know whether anything moved
///
/// Deliberately cheap: a handful of indexed reads and no standings, because
/// every phone in the room hits it on a timer.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentStateResponse {
    /// The server's own reading of the time, for clock skew
    pub server_time: SchemaDateTime,
    /// Changes exactly when something a client renders changed
    ///
    /// A hex string, not an integer: a 64-bit counter crosses JavaScript's
    /// safe-integer range and would compare equal for unequal states on the
    /// one platform that consumes it.
    pub revision: MaxStr<32>,
    /// Where the event stands
    pub status: TournamentStatus,
    /// The round the room is on
    pub round: Option<RoundResponse>,
    /// How many scoring rounds the event means to play
    pub planned_rounds: Option<i16>,
    /// How many of the current round's tables have no confirmed result
    pub outstanding_tables: i64,
}

/// Request to add a round
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateRoundRequest {
    /// What the round is for
    pub kind: RoundKind,
    /// How long the clock runs for, in minutes; `null` takes the event's own
    #[serde(default)]
    pub minutes: Option<i16>,
}

/// Why a round could not be added
#[derive(Default, Serialize, JsonSchema)]
pub struct CreateRoundErrors {
    /// The event is not running
    pub tournament_not_running: bool,
    /// The round before this one is still open
    pub previous_round_open: bool,
    /// The requested length is outside 1..=600 minutes
    pub invalid_length: bool,
}

/// Why a round's lifecycle call was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct RoundLifecycleErrors {
    /// The round is not in a state that allows this
    pub not_editable: bool,
}

/// Why closing a round was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct CompleteRoundErrors {
    /// The round is not in a state that allows this
    pub not_editable: bool,
    /// Tables are still without a result — `force` would go through
    pub outstanding_tables: bool,
}

/// Request to close a round
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CompleteRoundRequest {
    /// Close it even though tables are missing results
    #[serde(default)]
    pub force: bool,
}

/// Request to work a round's clock
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetTimerRequest {
    /// What the desk did
    pub action: TimerActionRequest,
    /// Seconds to add, for `Adjust`; the new length, for `Reset`
    #[serde(default)]
    pub seconds: Option<i32>,
}

/// What the desk did to a clock
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema)]
pub enum TimerActionRequest {
    /// Start it from its full length
    Start,
    /// Stop it where it stands
    Pause,
    /// Let it run again
    Resume,
    /// Add to or take from the time left
    Adjust,
    /// Take a new length and go back to not started
    Reset,
}

/// One seat at one table
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MatchSeatResponse {
    /// Who sits here
    pub participant: TournamentParticipantUuid,
    /// The name they appear under
    pub display_name: MaxStr<64>,
    /// Turn order at the table, 1-based — seat one goes first
    pub seat: i16,
    /// How many games this seat has won
    pub games_won: i16,
    /// Whether they have since left the event, so the row can say so rather
    /// than leaving an organizer to wonder why nobody is sitting there
    pub dropped: bool,
    /// The table they cannot leave, if there is one — what the pin on the row
    /// is drawn from, and the reason this table carries the number it does
    pub fixed_table: Option<i16>,
}

/// One table of a paired round
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MatchTableResponse {
    /// Primary key
    pub uuid: TournamentMatchUuid,
    /// The number printed on it, `0` for a bye, which is not a table
    pub table_number: i16,
    /// How far its result has got
    pub status: MatchStatus,
    /// Whether it is a bye rather than a table anybody sits at
    pub is_bye: bool,
    /// Who won, `null` for a draw or a table nobody has reported
    pub winner: Option<TournamentParticipantUuid>,
    /// Whether the table was drawn
    pub is_draw: bool,
    /// Who sits there, in seat order
    pub seats: Vec<MatchSeatResponse>,
}

impl From<MatchTable> for MatchTableResponse {
    fn from(value: MatchTable) -> Self {
        Self {
            uuid: value.uuid,
            table_number: value.table_number,
            status: value.status,
            is_bye: value.is_bye,
            winner: value.winner,
            is_draw: value.is_draw,
            seats: value
                .seats
                .into_iter()
                .map(MatchSeatResponse::from)
                .collect(),
        }
    }
}

impl From<MatchSeat> for MatchSeatResponse {
    fn from(value: MatchSeat) -> Self {
        Self {
            participant: value.participant,
            display_name: value.display_name,
            seat: value.seat,
            games_won: value.games_won,
            dropped: value.dropped,
            fixed_table: value.fixed_table,
        }
    }
}

/// Every table of one round
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTablesResponse {
    /// The tables, byes last
    pub tables: Vec<MatchTableResponse>,
}

/// A pin the layout could not honour
///
/// Two players who cannot leave their table asked for the same number. The
/// lower-numbered table kept it and the other pin was dropped; nothing about
/// who plays whom changed, so the round is still perfectly valid — an
/// organizer simply has to move somebody by hand.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FixedTableConflict {
    /// The number both asked for
    pub table_number: i16,
    /// Who did not get it
    pub participant: TournamentParticipantUuid,
}

/// What pairing a round produced
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PairRoundResponse {
    /// The tables, byes last
    pub tables: Vec<MatchTableResponse>,
    /// Pins that could not be honoured
    pub fixed_table_conflicts: Vec<FixedTableConflict>,
}

/// Why a round could not be paired
#[derive(Default, Serialize, JsonSchema)]
pub struct PairRoundErrors {
    /// The round is closed, or is a deckbuilding stage, which has no tables
    pub not_pairable: bool,
    /// Somebody has already reported a table; re-pairing would throw it away
    pub results_reported: bool,
    /// Nobody is checked in, so there is nobody to seat
    pub no_entrants: bool,
    /// The field divides into neither full pods nor pods one smaller — five
    /// players at a pod size of four, say. The remedy is a different pod size.
    pub impossible_pods: bool,
}

/// What one seat says happened at their table
///
/// The game counts are the winner's and the loser's, not one per seat: a pod is
/// always best of one, so the only place a game score carries anything is a
/// duel, where there are exactly two of them.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReportResultRequest {
    /// Who they say won, `null` for a draw
    #[serde(default)]
    pub winner: Option<TournamentParticipantUuid>,
    /// Whether they say it was drawn
    #[serde(default)]
    pub draw: bool,
    /// Games the winner took
    #[serde(default)]
    pub winner_games: i16,
    /// Games the loser took
    #[serde(default)]
    pub loser_games: i16,
    /// Games inside the match that were themselves drawn
    #[serde(default)]
    pub games_drawn: i16,
    /// The key this tap was minted with
    ///
    /// The same key arriving twice is one tap retried and writes nothing; a
    /// different one is somebody changing their mind and overwrites. Which is
    /// what makes a double-tapped phone on a bad connection harmless.
    pub client_key: MaxStr<64>,
}

/// Why a player's report was not filed
#[derive(Default, Serialize, JsonSchema)]
pub struct ReportResultErrors {
    /// The reporter is not sitting at this table
    pub not_seated: bool,
    /// The round is closed; nothing more goes into it
    pub round_closed: bool,
    /// Neither a winner nor a draw, or a winner who is not at the table
    pub invalid_outcome: bool,
}

/// What the desk says happened at a table
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetResultRequest {
    /// Who won, `null` for a draw
    #[serde(default)]
    pub winner: Option<TournamentParticipantUuid>,
    /// Whether it was drawn
    #[serde(default)]
    pub draw: bool,
    /// Games the winner took
    #[serde(default)]
    pub winner_games: i16,
    /// Games the loser took
    #[serde(default)]
    pub loser_games: i16,
    /// Games inside the match that were themselves drawn
    #[serde(default)]
    pub games_drawn: i16,
}

/// Why the desk's result was not written
#[derive(Default, Serialize, JsonSchema)]
pub struct SetResultErrors {
    /// The round is closed, or the table is a bye nobody played
    pub not_editable: bool,
    /// Neither a winner nor a draw, or a winner who is not at the table
    pub invalid_outcome: bool,
}

/// One tiebreaker, so a client can name the column it is looking at
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema)]
pub enum TiebreakerResponse {
    /// Accumulated match points
    MatchPoints,
    /// Share of the match points this player could have taken
    MatchWinPercent,
    /// Mean of the opponents' match-win percentages
    OpponentMatchWinPercent,
    /// Share of the game points this player could have taken
    GameWinPercent,
    /// Mean of the opponents' game-win percentages
    OpponentGameWinPercent,
    /// Mean of the opponents' raw match points
    OpponentsAveragePoints,
}

impl From<Tiebreaker> for TiebreakerResponse {
    fn from(value: Tiebreaker) -> Self {
        match value {
            Tiebreaker::MatchPoints => Self::MatchPoints,
            Tiebreaker::MatchWinPercent => Self::MatchWinPercent,
            Tiebreaker::OpponentMatchWinPercent => Self::OpponentMatchWinPercent,
            Tiebreaker::GameWinPercent => Self::GameWinPercent,
            Tiebreaker::OpponentGameWinPercent => Self::OpponentGameWinPercent,
            Tiebreaker::OpponentsAveragePoints => Self::OpponentsAveragePoints,
        }
    }
}

/// One row of the standings
///
/// Every percentage is in basis points — 10 000 is 100 % — which is also the
/// precision it is meant to be shown at. Two rows whose numbers render the same
/// really are equal, so a reader checking the table by hand never finds a tie
/// broken by a digit that was not on screen.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StandingResponse {
    /// Whose row this is
    pub participant: TournamentParticipantUuid,
    /// The name they appear under
    pub display_name: MaxStr<64>,
    /// The place printed beside them, shared with anybody they tie
    pub place: i64,
    /// Their position in the total order, which is what pairing slices
    pub order: i64,
    /// Whether they have since left the event
    pub dropped: bool,
    /// Accumulated match points
    pub match_points: i32,
    /// Matches won
    pub wins: i32,
    /// Matches lost
    pub losses: i32,
    /// Matches drawn
    pub draws: i32,
    /// Byes received
    pub byes: i32,
    /// Share of the match points they could have taken
    pub match_win: i64,
    /// Mean of their opponents' match-win percentages
    pub opponent_match_win: i64,
    /// Share of the game points they could have taken
    pub game_win: i64,
    /// Mean of their opponents' game-win percentages
    pub opponent_game_win: i64,
    /// Mean of their opponents' raw match points, in the same fixed point
    pub opponents_average_points: i64,
}

/// The standings of a tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StandingsResponse {
    /// The rows, best first
    pub standings: Vec<StandingResponse>,
    /// Which tiebreakers this event applies, most significant first
    pub tiebreakers: Vec<TiebreakerResponse>,
    /// How many tables of the current round have no settled result
    ///
    /// The reason the page can say "three tables still out" rather than letting
    /// ranks shuffle under a reader who does not know why.
    pub outstanding_tables: i64,
}

/// What starting (or otherwise moving) a tournament did beyond the status
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetTournamentStatusResponse {
    /// How many players were dropped for never checking in
    ///
    /// Only ever non-zero on the move to [`TournamentStatus::Running`]. The
    /// client already listed them in its confirmation, so this is the count
    /// that actually happened rather than the one it predicted.
    pub dropped_awaiting_check_in: i64,
}

/// Request to change who may see a tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetTournamentVisibilityRequest {
    /// The visibility to switch to
    pub visibility: Visibility,
}

/// A freshly minted join code
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentJoinCodeResponse {
    /// The raw code, six characters
    pub join_code: MaxStr<8>,
}

/// Somebody on a tournament's roster, as an actor may see them
///
/// [`Self::notes`] is `None` unless the viewer is staff — see
/// [`Self::from_parts`].
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentParticipantResponse {
    /// Primary key
    pub uuid: TournamentParticipantUuid,
    /// The name the player appears under
    pub display_name: MaxStr<64>,
    /// Where the player stands in the event
    pub status: ParticipantStatus,
    /// Whether this row has no account behind it yet
    pub is_guest: bool,
    /// The first round the player was part of
    pub entered_round: i16,
    /// When the player checked in, `None` until they did
    pub checked_in_at: Option<SchemaDateTime>,
    /// The point in time the player registered
    pub registered_at: SchemaDateTime,
    /// Organizer-only notes on the player, `None` for every other viewer
    pub notes: Option<MaxStr<512>>,
    /// Whether this player has a decklist on file
    pub has_decklist: bool,
}

impl TournamentParticipantResponse {
    /// Build the response, redacting [`Self::notes`] unless `is_organizer`
    ///
    /// `has_decklist` is not derived here — it comes from a batch read
    /// ([`crate::models::tournament::decklist::submitted`] for the roster) or
    /// from the write the caller just made, never from a per-row query: the
    /// roster must never drag decklist text along, see the module docs on
    /// [`crate::models::tournament::decklist`].
    pub fn from_parts(
        participant: TournamentParticipant,
        has_decklist: bool,
        is_organizer: bool,
    ) -> Self {
        Self {
            uuid: participant.uuid,
            display_name: participant.display_name,
            status: participant.status,
            is_guest: participant.is_guest,
            entered_round: participant.entered_round,
            checked_in_at: participant.checked_in_at.map(SchemaDateTime),
            registered_at: SchemaDateTime(participant.registered_at),
            notes: is_organizer.then_some(participant.notes).flatten(),
            has_decklist,
        }
    }
}

/// Every participant on a tournament's roster
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTournamentParticipantsResponse {
    /// The roster, oldest registration first
    pub participants: Vec<TournamentParticipantResponse>,
}

/// Request to put a player on the roster from the desk
///
/// Two shapes in one request: with `account` the row belongs to that account
/// from the start — the organizer looked the player up because their phone
/// was dead — and `display_name` is optional, defaulting to the username.
/// Without it the row is a guest a name was typed for, claimable later by QR.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AddTournamentParticipantRequest {
    /// The account to seat, `None` to add a guest by name alone
    #[serde(default)]
    pub account: Option<AccountUuid>,
    /// The name the player appears under; required for a guest, optional
    /// alongside `account`
    #[serde(default)]
    pub display_name: Option<MaxStr<64>>,
    /// A decklist to type in for them, pasted text only — an organizer never
    /// links a Planarium deck on somebody else's behalf
    #[serde(default)]
    pub decklist_text: Option<MaxStr<16384>>,
}

/// Why a player could not be put on the roster
#[derive(Default, Serialize, JsonSchema)]
pub struct AddParticipantErrors {
    /// No name was given for a guest row
    pub empty_name: bool,
    /// The named account does not exist
    pub unknown_account: bool,
    /// That account already has a row in this tournament
    pub already_registered: bool,
    /// The event is finished or cancelled — nothing goes on the roster now
    pub registration_closed: bool,
    /// The pasted decklist was blank once trimmed
    pub invalid_decklist: bool,
}

/// One account an organizer's player search turned up
///
/// Username only. The search exists to resolve "which of these is my player",
/// and a username is what the organizer reads off their screen — anything
/// else would make this a directory.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PlayerSearchResultResponse {
    /// The account found
    pub uuid: AccountUuid,
    /// Its username
    pub username: MaxStr<32>,
    /// Whether this account is already on this tournament's roster
    pub on_roster: bool,
}

/// How many hits one player search answers with
///
/// An organizer is looking for one known person, not browsing: a short list
/// they can read at a glance is the whole point, and a longer needle is the
/// way to narrow it.
pub const PLAYER_SEARCH_LIMIT: u64 = 10;

/// The needle an organizer's player search carries
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SearchPlayersRequest {
    /// What the organizer typed; blank answers nothing
    pub q: String,
}

/// What a player search answers
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SearchPlayersResponse {
    /// The accounts found, alphabetically, capped by the server
    pub accounts: Vec<PlayerSearchResultResponse>,
}

/// Request to change a participant's display name and/or organizer notes
///
/// `notes: null` clears the notes; an absent `notes` key leaves them alone —
/// see [`crate::http::handler_frontend::collections::schema::double_option`].
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateTournamentParticipantRequest {
    /// A new display name, `None` to leave it alone
    #[serde(default)]
    pub display_name: Option<MaxStr<64>>,
    /// New organizer notes; absent leaves them alone, `null` clears them
    #[serde(
        default,
        deserialize_with = "crate::http::handler_frontend::collections::schema::double_option"
    )]
    pub notes: Option<Option<MaxStr<512>>>,
}

/// One line of the organizer-only staff list
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentOrganizerResponse {
    /// The helping account
    pub account: AccountUuid,
    /// The account's username
    pub username: MaxStr<32>,
    /// What the helper may do
    pub role: OrganizerRole,
    /// The point in time the helper was added
    pub created_at: SchemaDateTime,
}

impl From<TournamentOrganizer> for TournamentOrganizerResponse {
    fn from(organizer: TournamentOrganizer) -> Self {
        Self {
            account: organizer.account,
            username: organizer.username,
            role: organizer.role,
            created_at: SchemaDateTime(organizer.created_at),
        }
    }
}

/// A tournament's staff list
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTournamentOrganizersResponse {
    /// The staff, oldest-added first
    pub organizers: Vec<TournamentOrganizerResponse>,
}

/// Request to add an account as staff
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AddTournamentOrganizerRequest {
    /// The account's username
    pub username: Username,
    /// What the helper may do
    pub role: OrganizerRole,
}

/// Why [`super::handler::add_tournament_organizer`] was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct AddOrganizerErrors {
    /// No account has that username
    pub unknown_account: bool,
    /// That account already holds an organizer row on this tournament
    pub already_organizer: bool,
    /// That account is the tournament's owner, who needs no organizer row
    pub is_owner: bool,
}

/// Request to claim a guest row with its claim token
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClaimParticipantRequest {
    /// The token handed out when the guest row was created
    pub claim_token: MaxStr<64>,
}

/// What a successful claim answers with
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClaimParticipantResponse {
    /// The tournament the claimed row belongs to
    pub tournament: TournamentUuid,
    /// The now-claimed participant row
    pub participant: TournamentParticipantUuid,
}

/// Why a claim-token action was refused
///
/// Shared by [`super::handler::claim_tournament_participant`] (which can also
/// answer [`Self::already_registered`]) and, unauthenticated, by
/// [`crate::http::handler_frontend::join::handler::look_up_claim_token`] and
/// [`crate::http::handler_frontend::join::handler::reattach_claim_token`] —
/// the latter two only ever set [`Self::invalid_token`], since there is no
/// account on a guest request for [`Self::already_registered`] to describe.
#[derive(Default, Serialize, JsonSchema)]
pub struct ClaimErrors {
    /// No unclaimed row carries this token
    pub invalid_token: bool,
    /// The claiming account already has a row in that guest row's tournament
    pub already_registered: bool,
}

/// A guest row's live claim token, for staff to show as a QR code
///
/// `None` covers both "already claimed" and "this is an account row" alike —
/// see [`crate::models::tournament::participant::claim_token`] for why the
/// caller has no reason to tell the two apart.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClaimTokenResponse {
    /// The live token, `None` when there is none to hand out
    pub claim_token: Option<MaxStr<64>>,
}

/// How many entries a tournament's audit log page holds by default
fn default_audit_limit() -> u32 {
    100
}

/// The most entries a single audit log page may ask for
pub const MAX_TOURNAMENT_AUDIT_LIMIT: u32 = 500;

/// Query parameters of [`super::handler::list_tournament_audit`]
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTournamentAuditQuery {
    /// How many entries to return, newest first
    #[serde(default = "default_audit_limit")]
    pub limit: u32,
}

/// One organizer-visible line in a tournament's history
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentAuditEntryResponse {
    /// Primary key
    pub uuid: Uuid,
    /// What happened
    pub action: AuditAction,
    /// Who did it, by username; `None` for the system or a deleted account
    pub actor: Option<MaxStr<32>>,
    /// What it happened to
    pub subject: Option<Uuid>,
    /// A short rendered account of the change
    pub detail: Option<MaxStr<1024>>,
    /// The point in time the entry was written
    pub created_at: SchemaDateTime,
}

impl From<TournamentAuditEntry> for TournamentAuditEntryResponse {
    fn from(entry: TournamentAuditEntry) -> Self {
        Self {
            uuid: entry.uuid,
            action: entry.action,
            actor: entry.actor,
            subject: entry.subject,
            detail: entry.detail,
            created_at: SchemaDateTime(entry.created_at),
        }
    }
}

/// A tournament's audit log
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTournamentAuditResponse {
    /// The entries, newest first
    pub entries: Vec<TournamentAuditEntryResponse>,
}

/// A participant's decklist, as read back for its owner or for staff
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DecklistResponse {
    /// The player it belongs to
    pub participant: TournamentParticipantUuid,
    /// The Planarium deck the text was rendered from, if any — provenance only
    pub deck: Option<DeckUuid>,
    /// The list itself
    pub text: MaxStr<16384>,
    /// When it was last written
    pub updated_at: SchemaDateTime,
}

impl From<Decklist> for DecklistResponse {
    fn from(decklist: Decklist) -> Self {
        Self {
            participant: decklist.participant,
            deck: decklist.deck,
            text: decklist.text,
            updated_at: SchemaDateTime(decklist.updated_at),
        }
    }
}

/// What [`super::handler::get_participant_decklist`] and
/// [`super::handler::set_participant_decklist`] answer with
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetDecklistResponse {
    /// The decklist itself, `None` while nothing has been submitted
    pub decklist: Option<DecklistResponse>,
    /// Whether the tournament's decklists are locked tournament-wide
    pub locked: bool,
    /// Whether the viewer may write this decklist right now — staff always,
    /// the participant themself only while `!locked`. Computed server-side so
    /// the UI never has to re-derive it from `locked` plus who is asking.
    pub may_edit: bool,
}

/// Request to write, replace or clear a participant's decklist
///
/// Both fields absent clears the list; both present is refused as
/// [`DecklistErrors::invalid_decklist`] — a request names at most one source.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetDecklistRequest {
    /// Link a Planarium deck — the caller must own it
    #[serde(default)]
    pub deck: Option<DeckUuid>,
    /// Paste text directly
    #[serde(default)]
    pub text: Option<MaxStr<16384>>,
}

/// Why [`super::handler::set_participant_decklist`] was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct DecklistErrors {
    /// The tournament's decklists are locked tournament-wide and the caller
    /// is not staff
    pub locked: bool,
    /// The named deck does not exist, is not the caller's, or rendered to
    /// nothing playable — an empty deck is not a list anybody can register
    pub unknown_deck: bool,
    /// The pasted text was blank once trimmed, or both `deck` and `text` were
    /// given in the same request
    pub invalid_decklist: bool,
}

/// Why [`super::handler::check_in_tournament_participant`] was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct CheckInErrors {
    /// The tournament's decklist policy requires a decklist before check-in
    /// and this player has none on file
    pub decklist_missing: bool,
}

/// One venue from the caller's own book, as offered back by the picker
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentVenueResponse {
    /// Primary key
    pub uuid: TournamentVenueUuid,
    /// Name of the place
    pub name: MaxStr<255>,
    /// Where it is
    pub address: Option<MaxStr<512>>,
    /// How to actually get in
    pub instructions: Option<MaxStr<1024>>,
}

impl From<Venue> for TournamentVenueResponse {
    fn from(venue: Venue) -> Self {
        Self {
            uuid: venue.uuid,
            name: venue.name,
            address: venue.address,
            instructions: venue.instructions,
        }
    }
}

/// The caller's own venue book, most recently used first
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTournamentVenuesResponse {
    /// The venues, most recently used first
    pub venues: Vec<TournamentVenueResponse>,
}
