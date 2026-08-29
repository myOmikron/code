//! What a format asks of a deck
//!
//! The construction rules only: how many cards, how many copies of one, whether
//! a commander is required. Whether a *card* is legal is a different question,
//! answered against the catalog — see [`crate::models::printing::TRACKED_FORMATS`].
//!
//! Adding a format takes three steps, and the first two are easy to forget:
//! put its slug into `TRACKED_FORMATS`, run `sync-catalog` so every printing
//! gets its `legal_formats` rewritten, and only then add a row here. A format
//! listed here but missing from the catalog reads as "no card is legal".

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

/// How many cards a deck holds
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DeckSize {
    /// Exactly this many, commander included
    Exactly {
        /// The count
        cards: u16,
    },
    /// At least this many, no upper bound
    AtLeast {
        /// The count
        cards: u16,
    },
}

/// Whether the format is played with a commander
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommanderRule {
    /// No commander zone
    None,
    /// A commander is required
    Required {
        /// Fewest cards in the commander zone
        min: u8,
        /// Most cards in the commander zone, two for partners
        max: u8,
    },
}

/// What a format asks of a deck built for it
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct FormatRules {
    /// The slug, matching Scryfall's `legalities` keys
    pub slug: &'static str,
    /// How many cards the deck holds
    pub deck_size: DeckSize,
    /// How many copies of one card may be played, ignoring basic lands
    pub max_copies: u8,
    /// Whether a commander is required, and how many
    pub commander: CommanderRule,
    /// How many cards the sideboard may hold, zero when the format has none
    pub sideboard: u8,
    /// Whether the deck's colours are bound to its commander's identity
    ///
    /// A default, not a verdict: there are commanders that grant the deck a
    /// colour outside their own identity, so a deck may overrule this with
    /// [`Deck::allowed_color_identity`](crate::models::deck::Deck::allowed_color_identity).
    pub color_identity_locked: bool,
}

/// The formats a deck can be built for
///
/// Every format Scryfall reports legality for, so a deck can be built for
/// anything the catalog can be asked about — see
/// [`TRACKED_FORMATS`](crate::models::printing::TRACKED_FORMATS), which this
/// list has to stay a subset of.
///
/// The singleton formats lead, because their shapes differ from one another;
/// everything after them is the ordinary sixty card deck with a fifteen card
/// sideboard, which is what the rest of constructed Magic is.
pub const FORMAT_RULES: [FormatRules; 23] = [
    FormatRules {
        slug: "commander",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "duel",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "predh",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "paupercommander",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "oathbreaker",
        deck_size: DeckSize::Exactly { cards: 60 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 2, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "brawl",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 1 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "competitivebrawl",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 1 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "standardbrawl",
        deck_size: DeckSize::Exactly { cards: 60 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 1 },
        sideboard: 0,
        color_identity_locked: true,
    },
    FormatRules {
        slug: "gladiator",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::None,
        sideboard: 0,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "standard",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "future",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "pioneer",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "modern",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "legacy",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "vintage",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "pauper",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "penny",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "premodern",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "oldschool",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "historic",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "timeless",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "alchemy",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
    FormatRules {
        slug: "tlr",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
    },
];

/// The rules of one format, or `None` for a slug that is not offered
pub fn rules_for(slug: &str) -> Option<&'static FormatRules> {
    FORMAT_RULES.iter().find(|rules| rules.slug == slug)
}

/// What a Commander bracket asks of a deck
///
/// Wizards' five brackets, from a themed pile to a tournament deck. Only one of
/// their conditions can be checked against the catalog — how many Game Changers
/// the deck plays, since that list is curated and Scryfall carries the flag.
/// Mass land denial, chained extra turns, tutor density and how early a two
/// card combo goes off are judgements about how a deck *plays*, so they are put
/// to the builder as a checklist rather than guessed at.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct BracketRules {
    /// Which bracket, one to five
    pub number: u8,
    /// The slug the client turns into a name
    pub slug: &'static str,
    /// How many Game Changers may be played, `None` for no limit
    pub max_game_changers: Option<u8>,
    /// Whether the bracket permits mass land denial
    ///
    /// Read as "is it allowed", which is what the values below say: bracket 1
    /// holds `false` because it plays none. The wording matters — the
    /// legality band warns on `false`, so a reader who inverted these would
    /// silently invert every warning.
    pub mass_land_denial: bool,
    /// Whether the bracket permits chained extra turns, read like
    /// [`Self::mass_land_denial`]
    pub extra_turns: bool,
    /// Whether the bracket permits two card infinite combos, read like
    /// [`Self::mass_land_denial`]
    pub two_card_combos: bool,
}

/// The five Commander brackets
pub const BRACKETS: [BracketRules; 5] = [
    BracketRules {
        number: 1,
        slug: "exhibition",
        max_game_changers: Some(0),
        mass_land_denial: false,
        extra_turns: false,
        two_card_combos: false,
    },
    BracketRules {
        number: 2,
        slug: "core",
        max_game_changers: Some(0),
        mass_land_denial: false,
        extra_turns: false,
        two_card_combos: false,
    },
    BracketRules {
        number: 3,
        slug: "upgraded",
        max_game_changers: Some(3),
        mass_land_denial: false,
        extra_turns: false,
        two_card_combos: true,
    },
    BracketRules {
        number: 4,
        slug: "optimized",
        max_game_changers: None,
        mass_land_denial: true,
        extra_turns: true,
        two_card_combos: true,
    },
    BracketRules {
        number: 5,
        slug: "cedh",
        max_game_changers: None,
        mass_land_denial: true,
        extra_turns: true,
        two_card_combos: true,
    },
];

/// The rules of one bracket, or `None` for a number outside one to five
pub fn bracket(number: u8) -> Option<&'static BracketRules> {
    BRACKETS.iter().find(|rules| rules.number == number)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::printing::TRACKED_FORMATS;

    #[test]
    fn every_format_has_catalog_legality() {
        for rules in &FORMAT_RULES {
            assert!(
                TRACKED_FORMATS.contains(&rules.slug),
                "{} has rules but the catalog does not track its legality",
                rules.slug,
            );
        }
    }

    #[test]
    fn commander_is_singleton_and_hundred() {
        let commander = rules_for("commander").expect("commander is offered");
        assert_eq!(commander.max_copies, 1);
        assert_eq!(commander.deck_size, DeckSize::Exactly { cards: 100 });
        assert!(commander.color_identity_locked);
    }

    #[test]
    fn brackets_climb_from_none_to_no_limit() {
        assert_eq!(bracket(1).expect("one").max_game_changers, Some(0));
        assert_eq!(bracket(3).expect("three").max_game_changers, Some(3));
        assert_eq!(bracket(5).expect("five").max_game_changers, None);
        assert!(bracket(0).is_none());
        assert!(bracket(6).is_none());
    }

    #[test]
    fn unknown_slug_has_no_rules() {
        assert!(rules_for("archon").is_none());
        assert!(rules_for("").is_none());
    }

    #[test]
    fn every_scryfall_format_can_be_built_for() {
        for format in TRACKED_FORMATS {
            assert!(
                rules_for(format).is_some(),
                "{format} is tracked but cannot be built for",
            );
        }
    }
}
