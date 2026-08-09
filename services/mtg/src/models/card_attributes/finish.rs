//! The finish a physical card was printed with

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;

/// Finish of a physical card, mirroring Scryfall's `finishes`
///
/// These three are the complete set — Scryfall documents `finishes` as exactly
/// `nonfoil`, `foil` and `etched`, and prices it accordingly (`eur`/`eur_foil`,
/// `usd`/`usd_foil`/`usd_etched`).
///
/// Special treatments such as surge, textured, galaxy or neon ink are **not**
/// finishes: they live in Scryfall's `promo_types`/`frame_effects` and get
/// their own collector number, hence their own printing id. Adding them here
/// would encode the same fact twice and allow combinations that cannot exist.
/// A finish only ever describes what varies *within* one printing.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum CardFinish {
    /// Regular, non-foil
    Nonfoil,
    /// Traditional foil
    Foil,
    /// Etched foil
    Etched,
}
custom_db_enum! {
    enum: CardFinish,
    variants: [Nonfoil, Foil, Etched],
    decoder: CardFinishDecoder,
}
