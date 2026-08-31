//! What one reader's advisor knows about one deck.
//!
//! Six settings the advisor used to keep in the browser: which themes to
//! argue for, the shape to grade the curve against, how much a card may
//! cost, the cards never to offer, the cards never to cut, and whether the
//! reader has been asked any of it yet.
//!
//! Stored as JSON rather than as five tables on purpose: this service never
//! reads inside these values. A theme id, a bucket id and a corridor are the
//! graph service's vocabulary, and it changes between its releases — a
//! column per concept here would be a migration every time it grows.

use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

/// Which themes the advisor argues for, and which it steers away from
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct ThemePrefs {
    /// Themes to steer toward
    #[serde(default)]
    pub pinned: Vec<String>,
    /// Themes to steer away from
    #[serde(default)]
    pub excluded: Vec<String>,
}

/// One bucket's target corridor, in cards
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Corridor {
    /// The floor
    pub low: f64,
    /// The ceiling
    pub high: f64,
}

/// What the deck is graded against, where the builder moved it
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct DeckTargets {
    /// Corridors by role bucket id, only for the ones that were moved
    #[serde(default)]
    pub buckets: HashMap<String, Corridor>,
    /// Corridors by primary card type, only for the ones that were moved
    #[serde(default)]
    pub types: HashMap<String, Corridor>,
    /// The target curve as shares per mana value, `None` on the bracket's own shape
    #[serde(default)]
    pub curve: Option<Vec<f64>>,
}

/// A card the advisor has been told something about
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MarkedCard {
    /// The oracle identity the advisor filters on
    pub oracle_id: String,
    /// The name, so a list of these reads without resolving anything
    pub name: String,
}

/// One reader's whole advisor settings document for one deck
///
/// The same six fields the stored row's columns hold, read out and written
/// back as one document — a deck nobody has advised yet still has one of
/// these, simply with every field at its default. See the module doc for why
/// this is JSON rather than five tables.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct AdvisorSettings {
    /// Which themes to argue for and which to avoid
    pub themes: ThemePrefs,
    /// The shape the deck is graded against, where it was moved
    pub targets: DeckTargets,
    /// The restriction on what may be suggested at all, `None` for the whole pool
    pub pool_query: Option<MaxStr<512>>,
    /// Cards the advisor must never offer
    #[serde(default)]
    pub ignored: Vec<MarkedCard>,
    /// Cards the advisor must never propose cutting
    #[serde(default)]
    pub kept: Vec<MarkedCard>,
    /// Whether the reader has been through the advisor's questions
    #[serde(default)]
    pub setup_done: bool,
}
