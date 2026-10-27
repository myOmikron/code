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
use crate::models::tournament::listing::OverviewFilter;
use crate::models::tournament::listing::Timeframe;
use crate::models::tournament::settings::EntryFee;
use crate::models::tournament::settings::RawTournamentSettings;
use crate::models::tournament::settings::SettingsRefusal;
use crate::models::visibility::Visibility;
use crate::tournament::ruleset::BestOf;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::top_cut::TopCut;

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
    /// How many Participants self sign-up admits at most, two or more; `null` for no limit
    pub participant_limit: Option<i32>,
    /// Whether Accounts may sign up themselves; only for a public or unlisted Tournament
    pub self_sign_up: bool,
    /// How many Games a one-on-one Match is played to: required at Table size 2, `null` above
    pub best_of: Option<BestOf>,
    /// How many minutes the round timer gives a Round, 1 to 240; `null` for no timer
    pub round_minutes: Option<i16>,
    /// The Top cut after the Swiss Rounds: Top 4 or Top 8 at Table size 2, the final above; `null` for none
    pub top_cut: Option<TopCut>,
    /// How many Games a Top cut Match is played to: required with a Top 4 or Top 8, `null` otherwise
    pub top_cut_best_of: Option<BestOf>,
    /// Whether the Tournament is entered afterwards instead of run live: its Organizers
    /// set every pairing and Result, any date fits; `false` when left out
    #[serde(default)]
    pub entered_afterwards: bool,
    /// What playing costs, `null` or left out for nothing
    ///
    /// With a fee every Participant starts unpaid and is only paired once an
    /// Organizer marked it paid. Taking a fee up or dropping it is refused
    /// after the first Round started; amount and currency stay editable.
    #[serde(default)]
    pub entry_fee: Option<EntryFeeSchema>,
}

/// What playing in a Tournament costs
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EntryFeeSchema {
    /// The amount in the currency's smallest unit, cents for euros; above zero
    pub amount: i32,
    /// The ISO 4217 code of the currency, three capital letters like `EUR`
    pub currency: MaxStr<3>,
}

impl From<EntryFeeSchema> for EntryFee {
    fn from(value: EntryFeeSchema) -> Self {
        Self {
            amount: value.amount,
            currency: value.currency,
        }
    }
}

impl From<EntryFee> for EntryFeeSchema {
    fn from(value: EntryFee) -> Self {
        Self {
            amount: value.amount,
            currency: value.currency,
        }
    }
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
            participant_limit: value.participant_limit,
            self_sign_up: value.self_sign_up,
            best_of: value.best_of,
            round_minutes: value.round_minutes,
            top_cut: value.top_cut,
            top_cut_best_of: value.top_cut_best_of,
            entered_afterwards: value.entered_afterwards,
            entry_fee: value.entry_fee.map(EntryFee::from),
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
    /// The participant limit is below two
    pub participant_limit_too_small: bool,
    /// Self sign-up is on for a private Tournament
    pub self_sign_up_needs_visibility: bool,
    /// Best-of is missing at Table size 2 or given above it
    pub best_of_mismatch: bool,
    /// The entry fee is zero or less
    pub entry_fee_not_positive: bool,
    /// The entry fee's currency is not three capital letters
    pub unknown_currency: bool,
    /// The round timer is below a minute or above 240
    pub round_minutes_out_of_range: bool,
    /// Table size, Ruleset, best-of or entering afterwards changed, or an entry
    /// fee was taken up or dropped, after the first Round started
    pub rules_locked: bool,
    /// The Top cut is not played at the Table size
    pub top_cut_mismatch: bool,
    /// The Top cut's best-of is missing with a Top 4 or Top 8 or given without one
    pub top_cut_best_of_mismatch: bool,
    /// The Top cut or its best-of changed after the Swiss Rounds were over
    pub top_cut_locked: bool,
}

impl From<SettingsRefusal> for TournamentSettingsErrors {
    fn from(value: SettingsRefusal) -> Self {
        Self {
            table_size_out_of_range: value.table_size_out_of_range,
            ruleset_mismatch: value.ruleset_mismatch,
            unknown_format: value.unknown_format,
            participant_limit_too_small: value.participant_limit_too_small,
            self_sign_up_needs_visibility: value.self_sign_up_needs_visibility,
            best_of_mismatch: value.best_of_mismatch,
            entry_fee_not_positive: value.entry_fee_not_positive,
            unknown_currency: value.unknown_currency,
            round_minutes_out_of_range: value.round_minutes_out_of_range,
            rules_locked: false,
            top_cut_mismatch: value.top_cut_mismatch,
            top_cut_best_of_mismatch: value.top_cut_best_of_mismatch,
            top_cut_locked: false,
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
    /// How many Participants self sign-up admits at most, `null` for no limit
    pub participant_limit: Option<i32>,
    /// Whether Accounts may sign up themselves
    pub self_sign_up: bool,
    /// How many Games a one-on-one Match is played to, `null` for a multiplayer one
    pub best_of: Option<BestOf>,
    /// How many minutes the round timer gives a Round, `null` for no timer
    pub round_minutes: Option<u16>,
    /// The Top cut after the Swiss Rounds, `null` for none
    pub top_cut: Option<TopCut>,
    /// How many Games a Top cut Match is played to, `null` without a Top 4 or Top 8
    pub top_cut_best_of: Option<BestOf>,
    /// Whether it is entered afterwards: its Organizers set every pairing and Result,
    /// Participants report nothing and get no pushes
    pub entered_afterwards: bool,
    /// What playing costs, `null` for nothing
    pub entry_fee: Option<EntryFeeSchema>,
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
            participant_limit: tournament.participant_limit,
            self_sign_up: tournament.self_sign_up,
            best_of: tournament.best_of,
            round_minutes: tournament.round_minutes,
            top_cut: tournament.top_cut,
            top_cut_best_of: tournament.top_cut_best_of,
            entered_afterwards: tournament.entered_afterwards,
            entry_fee: tournament.entry_fee.map(EntryFeeSchema::from),
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

/// What the public overview narrows its Tournaments down to; every filter is optional
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ListPublicTournamentsQuery {
    /// Only upcoming (soonest first) or only past (latest first) Tournaments
    pub timeframe: Option<Timeframe>,
    /// Only Tournaments of this format, a slug from the deck formats
    pub format: Option<MaxStr<32>>,
    /// Only Tournaments whose location contains this text, case ignored
    pub location: Option<MaxStr<255>>,
}

impl From<ListPublicTournamentsQuery> for OverviewFilter {
    fn from(value: ListPublicTournamentsQuery) -> Self {
        Self {
            timeframe: value.timeframe,
            format: value.format,
            location: value.location.map(|location| location.to_string()),
        }
    }
}

/// The Tournaments an Account runs and the ones it plays in
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MyTournamentsResponse {
    /// The Tournaments it organizes, as Owner or Co-organizer, latest start first
    pub organizing: Vec<TournamentSummaryResponse>,
    /// The Tournaments it takes part in as a Participant, latest start first
    pub participating: Vec<TournamentSummaryResponse>,
    /// Ongoing Tournaments the Account participates in without having Dropped
    pub ongoing_participations: Vec<TournamentUuid>,
}
