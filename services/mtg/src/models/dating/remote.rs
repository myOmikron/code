//! The advisor's side of dating: profiles, the stack and verdicts

use std::collections::HashMap;

use galvyn::core::Module;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::dating::GraphProfile;
use crate::models::dating::ProfileAnswers;
use crate::models::dating::ProfileDeck;
use crate::models::dating::date::Support;
use crate::models::dating::salt_value;
use crate::modules::graph::GraphClient;

/// One EDHREC tag of a Commander
#[derive(Debug, Clone, Deserialize)]
pub struct Interest {
    /// EDHREC's label
    pub label: String,
    /// The advisor theme it maps onto
    pub theme: Option<String>,
    /// Share of the Commander's decks carrying it
    pub share: f64,
}

/// A Commander of the stack, as the advisor sees it
#[derive(Debug, Clone, Deserialize)]
pub struct StackCommander {
    /// Oracle id
    pub oracle_id: Uuid,
    /// Card name
    pub name: String,
    /// Color identity letters
    pub color_identity: Vec<String>,
    /// EDHREC popularity rank
    pub edhrec_rank: Option<i64>,
    /// Card price in euro
    pub price_eur: Option<f64>,
    /// Oracle text
    pub oracle_text: String,
    /// Type line
    pub type_line: String,
    /// EDHREC salt score
    pub salt: Option<f64>,
    /// EDHREC deck count
    pub decks: i64,
    /// Average bracket of its decks
    pub bracket: Option<f64>,
    /// -1 budget to +1 expensive
    pub budget_lean: Option<f64>,
    /// Top tags
    pub interests: Vec<Interest>,
    /// Picked for compatibility rather than popularity
    pub your_type: bool,
    /// What second Commander it looks for
    #[serde(default)]
    pub seeks: Option<Seeks>,
}

/// What second Commander a Commander looks for
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum Seeks {
    /// Another Commander with a matching partner ability
    #[serde(alias = "partner")]
    Partner,
    /// A Background
    #[serde(alias = "background")]
    Background,
    /// A Time Lord Doctor
    #[serde(alias = "doctor")]
    Doctor,
    /// A Doctor's companion
    #[serde(alias = "companion")]
    Companion,
}

/// A slice of the stack
#[derive(Debug, Clone, Deserialize)]
pub struct Stack {
    /// The Commanders
    pub commanders: Vec<StackCommander>,
    /// Unswiped Commanders left in the pool
    pub remaining: i64,
}

/// A slice of a lead's partner stack
#[derive(Debug, Clone, Deserialize)]
pub struct PartnerStack {
    /// The second Commanders
    pub commanders: Vec<StackCommander>,
    /// Unswiped ones left
    pub remaining: i64,
    /// The lead
    pub lead: StackCommander,
}

/// A Commander's answer to a like
#[derive(Debug, Clone, Deserialize)]
pub struct Verdict {
    /// Whether it is a match
    #[serde(rename = "match")]
    pub is_match: bool,
    /// Compatibility, 0..1
    pub score: f64,
    /// The worst dimension of a rejection
    pub dimension: Option<String>,
    /// More or less of it
    pub direction: Option<String>,
    /// The missing interest or colors
    pub detail: Option<String>,
    /// The interest both sides share
    pub shared: Option<String>,
}

#[derive(Serialize)]
struct Answers<'a> {
    colors: Vec<String>,
    bracket: Option<i16>,
    budget_eur: Option<i32>,
    salt: Option<f64>,
    avoided: &'a [String],
}

#[derive(Serialize)]
struct ProfileRequest<'a> {
    decks: &'a [ProfileDeck],
    answers: Option<Answers<'a>>,
}

#[derive(Serialize)]
struct StackRequest<'a> {
    profile: &'a GraphProfile,
    exclude: &'a [Uuid],
    colors: Option<Vec<String>>,
    required: Vec<String>,
    only: Option<&'a [Uuid]>,
    poly: bool,
    count: usize,
    seed: u64,
}

#[derive(Serialize)]
struct PartnersRequest<'a> {
    profile: &'a GraphProfile,
    commander: Uuid,
    exclude: &'a [Uuid],
    colors: Option<Vec<String>>,
    required: Vec<String>,
    count: usize,
    seed: u64,
}

#[derive(Serialize)]
struct SeeksRequest<'a> {
    commanders: &'a [Uuid],
}

#[derive(Serialize)]
struct VerdictRequest<'a> {
    profile: &'a GraphProfile,
    commander: Uuid,
    partner: Option<Uuid>,
}

/// Which Commanders a stack request holds
#[derive(Debug, Clone, Copy)]
pub struct StackFilter<'a> {
    /// Only Commanders within these colors
    pub colors: Option<&'a str>,
    /// Only Commanders with all of these colors
    pub required: &'a str,
    /// Only these Commanders
    pub only: Option<&'a [Uuid]>,
    /// Only Commanders that take a second one
    pub poly: bool,
}

fn letters(colors: &str) -> Vec<String> {
    colors
        .chars()
        .filter(|c| "WUBRG".contains(*c))
        .map(String::from)
        .collect()
}

/// Build what Commanders see of an account
pub async fn build_profile(
    decks: &[ProfileDeck],
    answers: Option<&ProfileAnswers>,
) -> anyhow::Result<GraphProfile> {
    let request = ProfileRequest {
        decks,
        answers: answers.map(|answers| Answers {
            colors: letters(&answers.colors),
            bracket: answers.bracket,
            budget_eur: answers.budget_eur,
            salt: answers.salt.map(salt_value),
            avoided: &answers.avoided,
        }),
    };
    GraphClient::global()
        .post("/dating/profile", &request)
        .await?
        .ok_or_else(|| anyhow::anyhow!("the advisor has no dating profile endpoint"))
}

/// The next Commanders to swipe
pub async fn stack(
    profile: &GraphProfile,
    exclude: &[Uuid],
    filter: StackFilter<'_>,
    count: usize,
    seed: u64,
) -> anyhow::Result<Stack> {
    let request = StackRequest {
        profile,
        exclude,
        colors: filter.colors.map(letters),
        required: letters(filter.required),
        only: filter.only,
        poly: filter.poly,
        count,
        seed,
    };
    GraphClient::global()
        .post("/dating/stack", &request)
        .await?
        .ok_or_else(|| anyhow::anyhow!("the advisor has no dating stack endpoint"))
}

/// The next second Commanders for `commander`, `None` when it is not in the pool
pub async fn partners(
    profile: &GraphProfile,
    commander: Uuid,
    exclude: &[Uuid],
    filter: StackFilter<'_>,
    count: usize,
    seed: u64,
) -> anyhow::Result<Option<PartnerStack>> {
    let request = PartnersRequest {
        profile,
        commander,
        exclude,
        colors: filter.colors.map(letters),
        required: letters(filter.required),
        count,
        seed,
    };
    GraphClient::global()
        .post("/dating/partners", &request)
        .await
}

/// What second Commander each of them looks for; ones that look for none are missing
pub async fn seeks(commanders: &[Uuid]) -> anyhow::Result<HashMap<Uuid, Seeks>> {
    if commanders.is_empty() {
        return Ok(HashMap::new());
    }
    Ok(GraphClient::global()
        .post("/dating/seeks", &SeeksRequest { commanders })
        .await?
        .unwrap_or_default())
}

/// The answer to a like on a Commander or a pair, `None` when one is not in the pool
pub async fn verdict(
    profile: &GraphProfile,
    commander: Uuid,
    partner: Option<Uuid>,
) -> anyhow::Result<Option<Verdict>> {
    GraphClient::global()
        .post(
            "/dating/verdict",
            &VerdictRequest {
                profile,
                commander,
                partner,
            },
        )
        .await
}

/// A theme as the advisor rates it for one Commander
#[derive(Debug, Clone, Deserialize)]
pub struct RatedTheme {
    /// Advisor theme id
    pub theme: String,
    /// The theme's label
    pub label: String,
    /// Share of the Commander's usual cards that fit it
    pub support: f64,
    /// That share in three steps
    pub tier: Support,
}

/// What a Commander brings to a date
#[derive(Debug, Clone, Deserialize)]
pub struct DatePlan {
    /// One theme per Commander turn
    pub proposals: Vec<RatedTheme>,
    /// Every theme, best supported first
    pub themes: Vec<RatedTheme>,
}

#[derive(Serialize)]
struct DateRequest {
    commander: Uuid,
}

/// The Commander's date plan, `None` when it is not in the pool
pub async fn date_plan(commander: Uuid) -> anyhow::Result<Option<DatePlan>> {
    GraphClient::global()
        .post("/dating/date", &DateRequest { commander })
        .await
}
