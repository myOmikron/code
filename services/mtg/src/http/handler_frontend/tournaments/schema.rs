use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::Username;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::OrganizerRole;
use crate::models::tournament::listing::ListedTournament;
use crate::models::tournament::settings::RawTournamentSettings;
use crate::models::tournament::settings::SettingsRefusal;
use crate::models::visibility::Visibility;
use crate::tournament::ruleset::Ruleset;

/// Every setting of a Tournament, to create one or to replace its settings
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentSettingsRequest {
    /// What the Tournament is called
    pub name: MaxStr<128>,
    /// What Participants should know beforehand
    pub description: Option<MaxStr<4096>>,
    /// Where it takes place, as free text
    pub location: Option<MaxStr<255>>,
    /// When it is announced to start: the date and the start time
    pub starts_at: SchemaDateTime,
    /// How many Participants a full Match seats, 2 to 5
    pub table_size: i16,
    /// The Ruleset to follow: `Mtr` at 2, `TopDeck` or `MultiplayerAddendum` at 3 to 5
    pub ruleset: Ruleset,
    /// The format played, a slug from the deck formats; `null` for any
    pub format: Option<MaxStr<32>>,
    /// Who may see the Tournament
    pub visibility: Visibility,
}

impl From<TournamentSettingsRequest> for RawTournamentSettings {
    fn from(value: TournamentSettingsRequest) -> Self {
        Self {
            name: value.name,
            description: value.description,
            location: value.location,
            starts_at: value.starts_at.0,
            table_size: value.table_size,
            ruleset: value.ruleset,
            format: value.format,
            visibility: value.visibility,
        }
    }
}

/// Why a Tournament's settings were refused
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct TournamentSettingsErrors {
    /// The Table size is outside 2 to 5
    pub table_size_out_of_range: bool,
    /// The Ruleset is not played at the Table size
    pub ruleset_mismatch: bool,
    /// The format is not one a deck can be built for
    pub unknown_format: bool,
}

impl From<SettingsRefusal> for TournamentSettingsErrors {
    fn from(value: SettingsRefusal) -> Self {
        Self {
            table_size_out_of_range: value.table_size_out_of_range,
            ruleset_mismatch: value.ruleset_mismatch,
            unknown_format: value.unknown_format,
        }
    }
}

/// A Tournament as one reader sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentResponse {
    /// Primary key
    pub uuid: TournamentUuid,
    /// What the Tournament is called
    pub name: MaxStr<128>,
    /// What Participants should know beforehand
    pub description: Option<MaxStr<4096>>,
    /// Where it takes place, as free text
    pub location: Option<MaxStr<255>>,
    /// When it is announced to start
    pub starts_at: SchemaDateTime,
    /// How many Participants a full Match seats
    pub table_size: i16,
    /// The Ruleset it follows
    pub ruleset: Ruleset,
    /// The format played, `null` for any
    pub format: Option<MaxStr<32>>,
    /// Who may see it
    pub visibility: Visibility,
    /// Where it stands
    pub state: TournamentState,
    /// Its Owner's username, `null` while the Tombstone holds it
    pub owner: Option<String>,
    /// The part the reader plays in running it, `null` for none
    pub organizer_role: Option<OrganizerRole>,
    /// Secret of the share link while it is Unlisted, for its Organizers only
    pub share_token: Option<MaxStr<64>>,
}

impl TournamentResponse {
    /// The Tournament as a reader playing `organizer_role` in it sees it
    ///
    /// Only an Organizer gets the share link.
    pub fn new(
        tournament: Tournament,
        owner: Option<Username>,
        organizer_role: Option<OrganizerRole>,
    ) -> Self {
        Self {
            uuid: tournament.uuid,
            name: tournament.name,
            description: tournament.description,
            location: tournament.location,
            starts_at: SchemaDateTime(tournament.starts_at),
            table_size: tournament.table_size.get(),
            ruleset: tournament.ruleset,
            format: tournament.format,
            visibility: tournament.visibility,
            state: tournament.state,
            owner: owner.map(|owner| owner.as_str().to_string()),
            organizer_role,
            share_token: organizer_role.and(tournament.share_token),
        }
    }
}

/// A Tournament in a list
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TournamentSummaryResponse {
    /// Primary key
    pub uuid: TournamentUuid,
    /// What the Tournament is called
    pub name: MaxStr<128>,
    /// Where it takes place, as free text
    pub location: Option<MaxStr<255>>,
    /// When it is announced to start
    pub starts_at: SchemaDateTime,
    /// How many Participants a full Match seats
    pub table_size: i16,
    /// The Ruleset it follows
    pub ruleset: Ruleset,
    /// The format played, `null` for any
    pub format: Option<MaxStr<32>>,
    /// Who may see it
    pub visibility: Visibility,
    /// Where it stands
    pub state: TournamentState,
    /// Its Owner's username, `null` while the Tombstone holds it
    pub owner: Option<String>,
}

impl TournamentSummaryResponse {
    /// A Tournament in a list, with the name of its Owner
    pub fn new(tournament: Tournament, owner: Option<&Username>) -> Self {
        Self {
            uuid: tournament.uuid,
            name: tournament.name,
            location: tournament.location,
            starts_at: SchemaDateTime(tournament.starts_at),
            table_size: tournament.table_size.get(),
            ruleset: tournament.ruleset,
            format: tournament.format,
            visibility: tournament.visibility,
            state: tournament.state,
            owner: owner.map(|owner| owner.as_str().to_string()),
        }
    }
}

impl From<ListedTournament> for TournamentSummaryResponse {
    fn from(value: ListedTournament) -> Self {
        Self::new(value.tournament, value.owner.as_ref())
    }
}

/// A list of Tournaments
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListTournamentsResponse {
    /// The Tournaments, latest start first
    pub tournaments: Vec<TournamentSummaryResponse>,
}
