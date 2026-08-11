//! How rare a printing is

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;

/// Rarity of a printing, as Scryfall reports it
///
/// The order of the variants is the ladder, commonest first — the same order
/// the set symbol's colours run in. Keep it that way: sorting a collection by
/// rarity means sorting by this, and a separate rank function would be a second
/// place to get it wrong.
///
/// [`Self::Special`] and [`Self::Bonus`] sit at the end because they are not a
/// step on that ladder — they mark the timeshifted and bonus sheets, which have
/// no place among the four.
#[derive(
    Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
pub enum CardRarity {
    /// Common
    Common,
    /// Uncommon
    Uncommon,
    /// Rare
    Rare,
    /// Mythic rare
    Mythic,
    /// Timeshifted and the like
    Special,
    /// Bonus sheets
    Bonus,
}

impl CardRarity {
    /// Reads Scryfall's spelling, which is the lowercase variant name
    ///
    /// Anything unknown becomes [`Self::Common`]: a rarity nobody has heard of
    /// is not worth refusing a card over, and the catalog would rather hold the
    /// printing with a dull rarity than not at all.
    pub fn from_scryfall(rarity: &str) -> Self {
        match rarity {
            "uncommon" => Self::Uncommon,
            "rare" => Self::Rare,
            "mythic" => Self::Mythic,
            "special" => Self::Special,
            "bonus" => Self::Bonus,
            _ => Self::Common,
        }
    }

    /// Where the rarity sits on the ladder, lowest first
    ///
    /// Stored alongside the rarity so a query can order by it without a `CASE`
    /// spelled out at every call site.
    pub fn rank(self) -> i16 {
        match self {
            Self::Common => 0,
            Self::Uncommon => 1,
            Self::Rare => 2,
            Self::Mythic => 3,
            Self::Special => 4,
            Self::Bonus => 5,
        }
    }
}

custom_db_enum! {
    enum: CardRarity,
    variants: [Common, Uncommon, Rare, Mythic, Special, Bonus],
    decoder: CardRarityDecoder,
}
