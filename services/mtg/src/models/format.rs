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
//!
//! One format's legality is not Scryfall's to report — see
//! [`archon`](crate::utils::archon), which the sync derives it from and which
//! also carries the bans this table has no room for: the ones that apply to a
//! zone rather than to a deck.

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
    /// Whether a deck in this format claims one of the [`BRACKETS`]
    ///
    /// The brackets are Wizards' own, written for Commander and for nothing
    /// else: they talk about Game Changers, mass land denial and how early a
    /// two card combo goes off at a four player table. A Modern deck has no
    /// answer to give here, so it is not asked.
    pub has_brackets: bool,
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
pub const FORMAT_RULES: [FormatRules; 24] = [
    FormatRules {
        slug: "commander",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: true,
    },
    FormatRules {
        slug: "duel",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "archon",
        // A hundred *at least*, unlike every other commander format: Archon
        // drops rule 903.5a and sets no ceiling at all.
        deck_size: DeckSize::AtLeast { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        // Archon does have a sideboard, of exactly one card, and that card has
        // to be the companion. The companion has a zone of its own here and is
        // counted there, which leaves nothing this number could permit.
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "predh",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "paupercommander",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "oathbreaker",
        deck_size: DeckSize::Exactly { cards: 60 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 2, max: 2 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "brawl",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 1 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "competitivebrawl",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 1 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "standardbrawl",
        deck_size: DeckSize::Exactly { cards: 60 },
        max_copies: 1,
        commander: CommanderRule::Required { min: 1, max: 1 },
        sideboard: 0,
        color_identity_locked: true,
        has_brackets: false,
    },
    FormatRules {
        slug: "gladiator",
        deck_size: DeckSize::Exactly { cards: 100 },
        max_copies: 1,
        commander: CommanderRule::None,
        sideboard: 0,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "standard",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "future",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "pioneer",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "modern",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "legacy",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "vintage",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "pauper",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "penny",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "premodern",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "oldschool",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "historic",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "timeless",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "alchemy",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
    FormatRules {
        slug: "tlr",
        deck_size: DeckSize::AtLeast { cards: 60 },
        max_copies: 4,
        commander: CommanderRule::None,
        sideboard: 15,
        color_identity_locked: false,
        has_brackets: false,
    },
];

/// The rules of one format, or `None` for a slug that is not offered
pub fn rules_for(slug: &str) -> Option<&'static FormatRules> {
    FORMAT_RULES.iter().find(|rules| rules.slug == slug)
}

/// The formats a tournament is played in that no deck is built for
///
/// Limited: the deck comes out of the packs the event hands out, built at
/// the table. There is nothing to check in advance and no legality for the
/// catalog to track — a booster is legal in the event it was opened for. So
/// these are not [`FormatRules`] and never appear in [`FORMAT_RULES`]: a
/// tournament may be played in one, a deck cannot be built for one.
pub const LIMITED_FORMATS: [&str; 2] = ["draft", "sealed"];

/// Whether a slug names one of the [`LIMITED_FORMATS`]
pub fn is_limited(slug: &str) -> bool {
    LIMITED_FORMATS.contains(&slug)
}

/// Whether a tournament may be played in this format
///
/// A format a deck can be built for, or one of the limited ones; the two
/// sets do not overlap, see [`LIMITED_FORMATS`].
pub fn is_tournament_format(slug: &str) -> bool {
    rules_for(slug).is_some() || is_limited(slug)
}

/// Whether a deck built for this format may claim a bracket
///
/// A slug the service does not offer claims none either: there is nothing to
/// hold the claim against.
pub fn has_brackets(slug: &str) -> bool {
    rules_for(slug).is_some_and(|rules| rules.has_brackets)
}

/// How much extra-turn play a bracket tolerates
///
/// Three values rather than a yes/no, because the published rule is not one:
/// Exhibition plays no extra turns at all, Core and Upgraded ask only that
/// they are not *chained*, and the top two ask nothing. A single Time Warp is
/// a legal Core card, so a boolean here could only be wrong in one direction
/// or the other.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ExtraTurnRule {
    /// No extra turns at all
    None,
    /// Extra turns, as long as the deck cannot take them back to back
    NoChaining,
    /// No limit
    Any,
}

/// How much combo play a bracket tolerates
///
/// Same three-step shape as [`ExtraTurnRule`] and for the same reason: the
/// rule Exhibition states ("no intentional infinite combos") is stricter than
/// the one Core states ("none of two cards"), so a deck holding a three card
/// line sits in Core rather than in Exhibition. Upgraded's published rule is
/// about how *early* a two card combo goes off, which nothing here can read,
/// so it tolerates them outright — the same judgement call the table makes.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ComboRule {
    /// No complete combo of any length
    None,
    /// Combos, as long as none of them is two cards
    NoTwoCard,
    /// No limit
    Any,
}

/// What a Commander bracket asks of a deck
///
/// Wizards' five brackets, from a themed pile to a tournament deck. Four of
/// their conditions are read against the deck: Game Changers from Scryfall's
/// curated flag, mass land denial and extra turns from the catalog flags
/// derived in [`crate::utils::bracket_flags`], and complete combos from the
/// graph advisor. Tutor density and how early a combo goes off remain
/// judgements about how a deck *plays*, so they stay with the builder.
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
    /// legality band warns on `false`, so a reader who inverted this would
    /// silently invert every warning.
    pub mass_land_denial: bool,
    /// How much extra-turn play the bracket tolerates
    pub extra_turns: ExtraTurnRule,
    /// How much combo play the bracket tolerates
    pub combos: ComboRule,
}

/// The five Commander brackets
pub const BRACKETS: [BracketRules; 5] = [
    BracketRules {
        number: 1,
        slug: "exhibition",
        max_game_changers: Some(0),
        mass_land_denial: false,
        extra_turns: ExtraTurnRule::None,
        combos: ComboRule::None,
    },
    BracketRules {
        number: 2,
        slug: "core",
        max_game_changers: Some(0),
        mass_land_denial: false,
        extra_turns: ExtraTurnRule::NoChaining,
        combos: ComboRule::NoTwoCard,
    },
    BracketRules {
        number: 3,
        slug: "upgraded",
        max_game_changers: Some(3),
        mass_land_denial: false,
        extra_turns: ExtraTurnRule::NoChaining,
        combos: ComboRule::Any,
    },
    BracketRules {
        number: 4,
        slug: "optimized",
        max_game_changers: None,
        mass_land_denial: true,
        extra_turns: ExtraTurnRule::Any,
        combos: ComboRule::Any,
    },
    BracketRules {
        number: 5,
        slug: "cedh",
        max_game_changers: None,
        mass_land_denial: true,
        extra_turns: ExtraTurnRule::Any,
        combos: ComboRule::Any,
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

    /// The two rules that are not yes/no, at the rungs where they differ —
    /// a Core deck may play an extra turn and a three card combo, and that is
    /// the whole point of spelling them out in three steps.
    #[test]
    fn core_tolerates_what_exhibition_does_not() {
        let exhibition = bracket(1).expect("one");
        let core = bracket(2).expect("two");
        assert_eq!(exhibition.extra_turns, ExtraTurnRule::None);
        assert_eq!(exhibition.combos, ComboRule::None);
        assert_eq!(core.extra_turns, ExtraTurnRule::NoChaining);
        assert_eq!(core.combos, ComboRule::NoTwoCard);
        assert_eq!(bracket(3).expect("three").combos, ComboRule::Any);
        assert_eq!(bracket(4).expect("four").extra_turns, ExtraTurnRule::Any);
    }

    #[test]
    fn only_commander_claims_a_bracket() {
        assert!(has_brackets("commander"));
        assert!(!has_brackets("duel"));
        assert!(!has_brackets("modern"));
        assert!(!has_brackets("archon"));
    }

    #[test]
    fn unknown_slug_has_no_rules() {
        assert!(rules_for("canadian-highlander").is_none());
        assert!(rules_for("").is_none());
    }

    /// A limited format is something to hold a tournament in, not something
    /// to build a deck for — and the catalog must not be asked about it.
    #[test]
    fn limited_formats_are_played_but_never_built() {
        for slug in LIMITED_FORMATS {
            assert!(is_tournament_format(slug), "{slug} cannot be played");
            assert!(rules_for(slug).is_none(), "{slug} has deck rules");
            assert!(!TRACKED_FORMATS.contains(&slug), "{slug} is tracked");
        }
        assert!(is_tournament_format("commander"));
        assert!(!is_limited("commander"));
        assert!(!is_tournament_format("canadian-highlander"));
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
