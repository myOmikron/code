use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

use crate::models::tournament::TournamentState;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::round::MatchUuid;
use crate::models::tournament::round::RoundRefusal;
use crate::models::tournament::round::RoundState;
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
}

/// One Round
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RoundResponse {
    /// Its number, 1 for the first Round
    pub number: i16,
    /// How far it got
    pub state: RoundState,
    /// Its Matches by table number, then its Byes
    pub matches: Vec<MatchResponse>,
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
        }
        errors
    }
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
