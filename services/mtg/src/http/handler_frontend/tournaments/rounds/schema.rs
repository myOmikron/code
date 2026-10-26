use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;

use crate::models::tournament::TournamentState;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::round::MatchUuid;
use crate::models::tournament::round::RoundRefusal;
use crate::models::tournament::round::RoundStage;
use crate::models::tournament::round::RoundState;
use crate::tournament::reporting::ResultState;
use crate::tournament::standings::Tiebreaker;

/// The Rounds of a Tournament the reader may see, and how many are planned
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RoundsResponse {
    /// The Rounds, oldest first; a previewed one only for Organizers
    pub rounds: Vec<RoundResponse>,
    /// How many Swiss Rounds an Organizer set, or the first Round settled; `null` while the suggestion applies
    pub swiss_rounds: Option<i16>,
    /// How many Swiss Rounds mtg suggests for the Participants there are now;
    /// `null` for a Ruleset mtg does not pair yet
    pub suggested_swiss_rounds: Option<i16>,
    /// The server's clock when it answered, to count a round timer down against
    pub server_time: SchemaDateTime,
    /// How many Participants the Top cut takes, `null` without one
    ///
    /// Once it started the size it started with; before, the size the
    /// Participants who play on fill, so a Top 8 of seven reads 4.
    pub top_cut_size: Option<i16>,
}

/// One Round
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RoundResponse {
    /// Its number, 1 for the first Round; the Top cut goes on counting after the Swiss Rounds
    pub number: i16,
    /// Whether it is a Swiss Round or one of the Top cut
    pub stage: RoundStage,
    /// How far it got
    pub state: RoundState,
    /// Its Matches by table number, then its Byes
    pub matches: Vec<MatchResponse>,
    /// Its round timer while it runs; `null` before and after, and for a Tournament without one
    pub timer: Option<RoundTimerResponse>,
}

/// The round timer of a running Round
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RoundTimerResponse {
    /// How long the Round runs, in seconds
    pub length_seconds: u32,
    /// When time is up
    pub ends_at: SchemaDateTime,
    /// Seconds left when the server answered, 0 once time is up
    pub remaining_seconds: u32,
    /// Whether time was up when the server answered
    pub time_up: bool,
    /// How many turns follow the active player's turn once time is up, under the Tournament's Ruleset
    ///
    /// Information only: 5 under MTR, 0 under the multiplayer Rulesets.
    pub extra_turns: u8,
}

/// The reader's Match in the running Round of a Tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MyMatchResponse {
    /// The reader's Participant, `null` if the reader plays in none
    pub participant: Option<ParticipantUuid>,
    /// The running Round, `null` while none runs
    pub round: Option<CurrentRoundResponse>,
    /// The server's clock when it answered, to count the round timer down against
    pub server_time: SchemaDateTime,
}

/// The running Round as one Participant sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CurrentRoundResponse {
    /// Its number
    pub number: i16,
    /// Its round timer, `null` for a Tournament without one
    pub timer: Option<RoundTimerResponse>,
    /// The reader's Match or Bye in it; `null` if the reader is not seated in it
    pub my_match: Option<MatchResponse>,
}

/// One Match, or a Bye
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MatchResponse {
    /// Primary key
    pub uuid: MatchUuid,
    /// The number of its table, 1 for the top table; `null` for a Bye
    pub table_number: Option<i16>,
    /// Who plays, by Seat number
    pub seats: Vec<SeatResponse>,
    /// Its Result, `null` while it has none and for a Bye
    pub result: Option<ResultResponse>,
    /// Whether some of its Participants met in an earlier Round
    pub rematch: bool,
}

/// A Participant's Seat in a Match
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SeatResponse {
    /// Who sits there
    pub participant: ParticipantUuid,
    /// The Account's username as it is now, or the Guest's name
    pub name: String,
    /// Whether it is a Guest rather than an Account
    pub guest: bool,
    /// The Seat number, 1 for the first turn
    pub seat: i16,
}

/// The game score of a Match
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResultResponse {
    /// Games won per Seat, in Seat order
    pub games_won: Vec<i16>,
    /// Games nobody won
    pub games_drawn: i16,
    /// Where it stands: reported by a Participant, disputed, or set by an Organizer
    pub state: ResultState,
    /// The Participant who reported it, `null` when an Organizer set it
    pub reported_by: Option<ParticipantUuid>,
    /// The Participant who disputed it, `null` unless it is disputed
    pub disputed_by: Option<ParticipantUuid>,
}

/// The Round just paired
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PairedRoundResponse {
    /// Its number
    pub number: i16,
}

/// Where the Tournament stands after a Round ended or the Swiss Rounds changed
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentStateResponse {
    /// The Tournament's state now, `Finished` after the last Swiss Round
    pub state: TournamentState,
}

/// Why a Round could not be paired, started, ended or discarded
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct RoundErrors {
    /// The Tournament is Finished or Cancelled
    pub tournament_over: bool,
    /// A Round is previewed or running, so the next one waits
    pub round_open: bool,
    /// Every Swiss Round was paired
    pub all_rounds_paired: bool,
    /// Fewer than two Participants can be paired
    pub too_few_participants: bool,
    /// mtg does not pair this Tournament's Ruleset yet
    pub ruleset_not_paired: bool,
    /// No Round of that number is previewed
    pub not_previewed: bool,
    /// No Round of that number is running
    pub not_running: bool,
    /// A Match of the Round has no Result yet
    pub results_missing: bool,
    /// A Result of the Round is disputed; an Organizer settles it first
    pub results_disputed: bool,
    /// No Round of that number ended
    pub not_ended: bool,
    /// A later Round started, so this one cannot be taken back
    pub later_round_started: bool,
}

impl From<RoundRefusal> for RoundErrors {
    fn from(value: RoundRefusal) -> Self {
        let mut errors = Self::default();
        match value {
            RoundRefusal::TournamentOver => errors.tournament_over = true,
            RoundRefusal::RoundOpen => errors.round_open = true,
            RoundRefusal::AllRoundsPaired => errors.all_rounds_paired = true,
            RoundRefusal::TooFewParticipants => errors.too_few_participants = true,
            RoundRefusal::RulesetNotPaired => errors.ruleset_not_paired = true,
            RoundRefusal::NotPreviewed => errors.not_previewed = true,
            RoundRefusal::NotRunning => errors.not_running = true,
            RoundRefusal::ResultsMissing => errors.results_missing = true,
            RoundRefusal::ResultsDisputed => errors.results_disputed = true,
            RoundRefusal::NotEnded => errors.not_ended = true,
            RoundRefusal::LaterRoundStarted => errors.later_round_started = true,
        }
        errors
    }
}

/// An Organizer's layout of a previewed Round
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ArrangeRoundRequest {
    /// The Matches, top table first, each listing its Participants in Seat order
    pub matches: Vec<Vec<ParticipantUuid>>,
    /// Who has a Bye
    pub byes: Vec<ParticipantUuid>,
}

/// Why a layout of a previewed Round was refused
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct ArrangeRoundErrors {
    /// The Tournament is Finished or Cancelled
    pub tournament_over: bool,
    /// No Round of that number is previewed
    pub not_previewed: bool,
    /// The Round is one of the Top cut, which the standings seed
    pub top_cut: bool,
    /// Somebody sits who is no Participant the Round pairs
    pub not_pairable: bool,
    /// Somebody sits more than once
    pub seated_twice: bool,
    /// A Participant the Round pairs sits nowhere
    pub not_seated: bool,
    /// A Match seats a number of Participants it cannot have
    pub match_size: bool,
    /// The Ruleset never gives a Bye
    pub no_byes: bool,
}

/// The Result an Organizer sets for a Match
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SetResultRequest {
    /// Games won per Seat, in Seat order
    pub games_won: Vec<i16>,
    /// Games nobody won
    pub games_drawn: i16,
}

/// Why a Result could not be set
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct SetResultErrors {
    /// The Match's Round is only previewed
    pub not_started: bool,
    /// The game score does not fit a Match of this Tournament
    pub invalid_score: bool,
}

/// How many Swiss Rounds an Organizer wants played
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SetSwissRoundsRequest {
    /// The number, at least the Rounds paired so far and at most 30
    pub swiss_rounds: i16,
}

/// Why the number of Swiss Rounds was refused
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct SetSwissRoundsErrors {
    /// Below the Rounds paired so far, below one or above 30, or the Tournament is over
    pub out_of_range: bool,
}

/// The standings of a Tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StandingsResponse {
    /// The Ruleset's Tiebreakers after Match points, the most significant first
    pub tiebreakers: Vec<Tiebreaker>,
    /// Every Participant, best first
    pub standings: Vec<StandingResponse>,
}

/// One Participant's line in the standings
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StandingResponse {
    /// Its place, 1 for the top; Participants equal on everything share one
    pub place: u32,
    /// Who
    pub participant: ParticipantUuid,
    /// The Account's username as it is now, or the Guest's name
    pub name: String,
    /// Whether it is a Guest rather than an Account
    pub guest: bool,
    /// Its Match points, Byes included
    pub match_points: u32,
    /// Matches won, Byes not included
    pub wins: u32,
    /// Matches lost
    pub losses: u32,
    /// Matches drawn
    pub draws: u32,
    /// Byes had
    pub byes: u32,
    /// Its Tiebreakers between 0 and 1, in the order of [`StandingsResponse::tiebreakers`]
    pub tiebreakers: Vec<f64>,
    /// The last Round started before it Dropped, `null` while it plays on
    pub dropped_after_round: Option<i16>,
}
