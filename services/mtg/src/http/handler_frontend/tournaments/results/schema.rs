use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

/// The Result a Participant reports for its Match
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ReportResultRequest {
    /// Games won per Seat, in Seat order
    pub games_won: Vec<i16>,
    /// Games nobody won
    pub games_drawn: i16,
}

/// Why a Participant's report was refused
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct ReportResultErrors {
    /// The Tournament is entered afterwards: its Organizers set every Result
    pub entered_afterwards: bool,
    /// The Match's Round is not running, or the Tournament is over
    pub not_running: bool,
    /// The game score does not fit a Match of this Tournament
    pub invalid_score: bool,
    /// Another Participant reported a different Result; dispute it instead
    pub reported_by_other: bool,
    /// The Result is disputed; an Organizer settles it
    pub disputed: bool,
    /// An Organizer set the Result
    pub confirmed: bool,
}

/// Why a Participant's dispute was refused
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct DisputeResultErrors {
    /// The Tournament is entered afterwards: its Organizers set every Result
    pub entered_afterwards: bool,
    /// The Match's Round is not running, or the Tournament is over
    pub not_running: bool,
    /// The Match has no Result to dispute
    pub no_result: bool,
    /// The Participant reported it itself; report again to correct it
    pub own_report: bool,
    /// An Organizer set the Result
    pub confirmed: bool,
}
