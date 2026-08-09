//! The condition a physical card is in

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;

/// Condition of a physical card, using Cardmarket's grades
///
/// The order of the variants is the grading scale, best first. Keep it that
/// way — comparisons and sorting read better than a separate rank function.
#[derive(
    Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
pub enum CardCondition {
    /// Mint
    Mint,
    /// Near Mint
    NearMint,
    /// Excellent
    Excellent,
    /// Good
    Good,
    /// Light Played
    LightPlayed,
    /// Played
    Played,
    /// Poor
    Poor,
}
custom_db_enum! {
    enum: CardCondition,
    variants: [Mint, NearMint, Excellent, Good, LightPlayed, Played, Poor],
    decoder: CardConditionDecoder,
}
