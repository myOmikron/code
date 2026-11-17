//! The advisor's side of dating: profiles, the stack and verdicts

use galvyn::core::Module;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::dating::GraphProfile;
use crate::models::dating::ProfileAnswers;
use crate::models::dating::ProfileDeck;
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
}

/// A slice of the stack
#[derive(Debug, Clone, Deserialize)]
pub struct Stack {
    /// The Commanders
    pub commanders: Vec<StackCommander>,
    /// Unswiped Commanders left in the pool
    pub remaining: i64,
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
struct Answers {
    colors: Vec<String>,
    bracket: Option<i16>,
    budget_eur: Option<i32>,
}

#[derive(Serialize)]
struct ProfileRequest<'a> {
    decks: &'a [ProfileDeck],
    answers: Option<Answers>,
}

#[derive(Serialize)]
struct StackRequest<'a> {
    profile: &'a GraphProfile,
    exclude: &'a [Uuid],
    colors: Option<Vec<String>>,
    count: usize,
    seed: u64,
}

#[derive(Serialize)]
struct VerdictRequest<'a> {
    profile: &'a GraphProfile,
    commander: Uuid,
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
    colors: Option<&str>,
    count: usize,
    seed: u64,
) -> anyhow::Result<Stack> {
    let request = StackRequest {
        profile,
        exclude,
        colors: colors.map(letters),
        count,
        seed,
    };
    GraphClient::global()
        .post("/dating/stack", &request)
        .await?
        .ok_or_else(|| anyhow::anyhow!("the advisor has no dating stack endpoint"))
}

/// The Commander's answer to a like, `None` when it is not in the pool
pub async fn verdict(profile: &GraphProfile, commander: Uuid) -> anyhow::Result<Option<Verdict>> {
    GraphClient::global()
        .post("/dating/verdict", &VerdictRequest { profile, commander })
        .await
}
