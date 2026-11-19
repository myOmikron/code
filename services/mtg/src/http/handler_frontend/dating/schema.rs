//! Schemas of Command Zone Dating

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::dating::DateStatus;
use crate::models::dating::date::DateProgress;
use crate::models::dating::date::TurnBy;
use crate::models::deck::DeckUuid;
use crate::models::deck::advisor::ThemeLevel;

/// Which way a Commander was swiped
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum SwipeKind {
    /// Left
    Pass,
    /// Right
    Like,
    /// Up: a guaranteed match, once a day
    SuperLike,
}

/// The dimension a rejection names
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum RejectDimension {
    /// The themes the account plays
    Themes,
    /// The colors the account plays
    Colors,
    /// The bracket the account plays at
    Bracket,
    /// What the account's decks cost
    Budget,
    /// How salty the account's Commanders are
    Salt,
}

/// Whether the Commander wants more or less of a dimension than the account brings
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum LeanDirection {
    /// The Commander wants more
    More,
    /// The Commander wants less
    Less,
}

/// Why a Commander said no
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RejectReason {
    /// The worst dimension
    pub dimension: RejectDimension,
    /// More or less of it
    pub direction: Option<LeanDirection>,
    /// The missing interest, or the missing color letters
    pub detail: Option<String>,
}

/// Asks for the next Commanders
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DatingStackRequest {
    /// Only Commanders within these colors, as letters of WUBRG
    pub colors: Option<MaxStr<8>>,
    /// Only Commanders with all of these colors, as letters of WUBRG
    #[serde(default)]
    pub required_colors: Option<MaxStr<8>>,
    /// Only Commanders printed in one of these sets, by code; empty means every set
    #[serde(default)]
    pub sets: Vec<MaxStr<16>>,
    /// Commanders the client still holds, unswiped
    pub pending: Vec<Uuid>,
}

/// A set with legendary cards, to filter the stack by
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DatingSetResponse {
    /// Set code, upper case
    pub code: String,
    /// Full set name
    pub name: String,
    /// How many legendary cards it holds
    pub legends: usize,
}

/// One EDHREC tag of a Commander
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct InterestResponse {
    /// EDHREC's label
    pub label: String,
    /// The advisor theme it maps onto
    pub theme: Option<String>,
}

/// A Commander in the stack
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DatingCardResponse {
    /// Oracle id
    pub commander: Uuid,
    /// The Default printing, to add it to a deck
    pub printing: Option<Uuid>,
    /// Card name
    pub name: String,
    /// Color identity letters
    pub color_identity: String,
    /// Art crop url
    pub image_art_crop: Option<String>,
    /// Full card image url
    pub image_normal: Option<String>,
    /// Type line
    pub type_line: String,
    /// Oracle text
    pub oracle_text: String,
    /// EDHREC popularity rank
    pub edhrec_rank: Option<i64>,
    /// Card price in euro
    pub price_eur: Option<f64>,
    /// Top tags
    pub interests: Vec<InterestResponse>,
    /// Picked for compatibility rather than popularity
    pub your_type: bool,
}

/// The next Commanders to swipe
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DatingStackResponse {
    /// The Commanders, in order
    pub commanders: Vec<DatingCardResponse>,
    /// Unswiped Commanders left in the pool
    pub remaining: i64,
    /// Super likes left today
    pub super_likes_left: i64,
    /// The account has neither decks nor answers: ask the questions first
    pub profile_needed: bool,
}

/// A swipe
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SwipeRequest {
    /// The Commander's oracle id
    pub commander: Uuid,
    /// Which way
    pub kind: SwipeKind,
}

/// The Commander's answer
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SwipeResponse {
    /// Where the date stands now
    pub status: DateStatus,
    /// Why a rejection happened
    pub reason: Option<RejectReason>,
    /// The interest both sides share
    pub shared: Option<String>,
    /// Super likes left today
    pub super_likes_left: i64,
    /// The Commander said yes only because the last likes were all rejected
    pub pity: bool,
}

/// What a rewind undid
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RewindResponse {
    /// The Commander whose swipe was undone, `None` without any swipe
    pub commander: Option<Uuid>,
}

/// A date that got past a pass
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DateResponse {
    /// The Commander's oracle id
    pub commander: Uuid,
    /// The Default printing, to add it to a deck
    pub printing: Option<Uuid>,
    /// Card name
    pub name: String,
    /// Color identity letters
    pub color_identity: String,
    /// Art crop url
    pub image_art_crop: Option<String>,
    /// Full card image url
    pub image_normal: Option<String>,
    /// Where the date stands
    pub status: DateStatus,
    /// Swiped up
    pub super_like: bool,
    /// Restored with "No, come back"
    pub came_back: bool,
    /// Why a rejection happened
    pub reason: Option<RejectReason>,
    /// The interest both sides share
    pub shared: Option<String>,
    /// When the swipe happened
    pub created_at: SchemaDateTime,
    /// The deck of a date that is not finished yet
    pub open_date: Option<Uuid>,
}

/// Every date, split by how it went
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DatesResponse {
    /// Matches, newest first
    pub matches: Vec<DateResponse>,
    /// Liked but rejected or unmatched, newest first
    pub shots: Vec<DateResponse>,
}

/// The dating-profile questions
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DatingAnswers {
    /// Colors as letters of WUBRG
    pub colors: MaxStr<8>,
    /// Preferred bracket, 1 to 5
    pub bracket: Option<i16>,
    /// Typical deck budget in euro
    pub budget_eur: Option<i32>,
}

/// How strongly the account plays a theme
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ThemeStrength {
    /// Advisor theme id
    pub theme: String,
    /// The theme's label
    pub label: String,
    /// 0..1
    pub strength: f64,
}

/// What Commanders see of the account
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DatingProfileResponse {
    /// The answers, if given
    pub answers: Option<DatingAnswers>,
    /// How many decks went into the profile
    pub decks: i64,
    /// Themes, strongest first
    pub themes: Vec<ThemeStrength>,
    /// Color letters played, most played first
    pub colors: Vec<String>,
    /// Average bracket
    pub bracket: Option<f64>,
    /// Typical deck price in euro
    pub budget_eur: Option<f64>,
    /// Average salt of the account's Commanders
    pub salt: Option<f64>,
}

/// Start a date on a deck that has the Commander
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StartDateRequest {
    /// The deck being planned
    pub deck: DeckUuid,
}

/// Answer the Commander's proposal
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AnswerDateRequest {
    /// How much of the proposed theme
    pub level: ThemeLevel,
}

/// Bring a theme of the account's own
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct BringThemeRequest {
    /// A theme id from the palette
    pub theme: MaxStr<64>,
    /// How much of it; never `avoid`
    pub level: ThemeLevel,
}

/// A theme on a date
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DateThemeResponse {
    /// Advisor theme id
    pub theme: String,
    /// The theme's label
    pub label: String,
}

/// One turn taken
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DateTurnResponse {
    /// Whose turn it was
    pub by: TurnBy,
    /// Advisor theme id
    pub theme: String,
    /// The theme's label
    pub label: String,
    /// The level it ended at
    pub level: ThemeLevel,
    /// What it did to the chemistry
    pub delta: i32,
}

/// A date and what can happen next
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DateSessionResponse {
    /// The deck being planned
    pub deck: Uuid,
    /// The Commander's oracle id
    pub commander: Uuid,
    /// Card name
    pub name: String,
    /// Art crop url
    pub image_art_crop: Option<String>,
    /// Where the date stands
    pub status: DateProgress,
    /// 0 to 100
    pub chemistry: i32,
    /// Whose turn is next, `None` once over
    pub next: Option<TurnBy>,
    /// The round, from 1 to 3
    pub round: i32,
    /// What the Commander proposes on its turn
    pub proposal: Option<DateThemeResponse>,
    /// What the account may bring on its turn
    pub palette: Vec<DateThemeResponse>,
    /// The turns so far
    pub turns: Vec<DateTurnResponse>,
}
