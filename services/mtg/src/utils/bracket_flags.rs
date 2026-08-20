//! Which cards keep a deck out of a lower Commander bracket.
//!
//! The bracket system's own rules: brackets 1 and 2 play no mass land denial
//! and no extra-turn spells, and bracket 3 still plays no mass land denial. So
//! claiming a bracket the deck does not meet is a contradiction the legality
//! band should say out loud, the way it already does for game changers.
//!
//! Game changers need no detection — Scryfall publishes the official list as a
//! flag. These two do, and the honest place to do it is here, once per card
//! while the catalog is synced: the answer is a property of the oracle card and
//! never changes between syncs, so deriving it per page view would be the same
//! work repeated forever. What is stored is the answer, not the evidence: two
//! booleans per row rather than the ~163 characters of rules text they were
//! read from, which over 540k printings is a megabyte instead of ninety.
//!
//! The patterns are curated against the canonical offenders and **err toward
//! silence**. A stax piece the regexes miss is a warning that never appears,
//! which is the right failure mode for a warning — telling someone their legal
//! deck is illegal is worse than staying quiet about an edge case.

use std::sync::LazyLock;

use regex::Regex;

/// Takes an extra turn — the bracket 1–2 prohibition
///
/// Written against the printed wording ("takes an extra turn after this one"),
/// which covers Time Warp through Nexus of Fate.
static EXTRA_TURN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\btakes? (an|two|three|any number of) extra turns?\b").expect("static pattern")
});

/// Stranglehold-shaped text names extra turns in order to forbid them
static EXTRA_TURN_HATE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)can't take extra turns").expect("static pattern"));

/// Mass land denial — prohibited through bracket 3
///
/// Each pattern is here for named cards: Armageddon and Ruination; Decree of
/// Annihilation; Wildfire and Tectonic Break; Winter Orb and Rising Waters;
/// Blood Moon and Magus of the Moon.
static MASS_LAND_DENIAL: LazyLock<[Regex; 6]> = LazyLock::new(|| {
    [
        Regex::new(r"(?i)destroy (all|each|every)\b[^.]*\blands?\b").expect("static pattern"),
        Regex::new(r"(?i)exile (all|each|every)\b[^.]*\blands?\b").expect("static pattern"),
        // Plural only: Smallpox's "sacrifices a land" is one land, not mass.
        Regex::new(r"(?i)each player sacrifices\b[^.]*\blands\b").expect("static pattern"),
        Regex::new(r"(?i)\blands (don't|do not) untap\b").expect("static pattern"),
        // Winter Orb's modern wording. The pattern above was written for it
        // and no longer matches: the card was errata'd from "Lands don't
        // untap" to this, and the hand-written test fixture it was checked
        // against kept the old text, so the miss only showed up when the
        // patterns were run over the real catalog. Worded on lands, so
        // Static Orb — "more than two permanents" — stays out.
        Regex::new(r"(?i)can't untap more than \w+ lands?\b").expect("static pattern"),
        Regex::new(r"(?i)nonbasic lands (are|lose)\b").expect("static pattern"),
    ]
});

/// Whether the rules text takes extra turns
///
/// # Arguments
/// - `oracle_text`: the card's rules text, both faces joined
pub fn is_extra_turns(oracle_text: &str) -> bool {
    EXTRA_TURN.is_match(oracle_text) && !EXTRA_TURN_HATE.is_match(oracle_text)
}

/// Whether the rules text denies lands en masse
///
/// # Arguments
/// - `oracle_text`: the card's rules text, both faces joined
pub fn is_mass_land_denial(oracle_text: &str) -> bool {
    MASS_LAND_DENIAL.iter().any(|pattern| pattern.is_match(oracle_text))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The canonical offenders, by name, so a pattern edit has to answer for
    /// the cards it was written for.
    #[test]
    fn catches_the_named_mass_land_denial() {
        for text in [
            "Destroy all lands.",                                    // Armageddon
            "Destroy all nonbasic lands.",                           // Ruination
            "Exile all artifacts, creatures, and lands.",            // Decree of Annihilation
            "Each player sacrifices four lands.",                    // Wildfire
            // Real oracle text, not a plausible paraphrase — see the pattern
            // list. Rising Waters kept the old wording; Winter Orb did not.
            "Lands don't untap during their controllers' untap steps.", // Rising Waters
            "As long as this artifact is untapped, players can't untap more than one land during their untap steps.", // Winter Orb
            "Nonbasic lands are Mountains.",                         // Blood Moon
        ] {
            assert!(is_mass_land_denial(text), "missed: {text}");
        }
    }

    #[test]
    fn leaves_single_land_destruction_alone() {
        for text in [
            "Destroy target land.",
            // One land each, which is a rattlesnake, not a wipe.
            "Each player sacrifices a land.",
            "Search your library for a basic land card.",
            // Stax, but not land denial: Static Orb holds down permanents.
            "As long as this artifact is untapped, players can't untap more than two permanents during their untap steps.",
        ] {
            assert!(!is_mass_land_denial(text), "false positive: {text}");
        }
    }

    #[test]
    fn catches_extra_turns_without_the_cards_that_forbid_them() {
        assert!(is_extra_turns("Take an extra turn after this one."));
        assert!(is_extra_turns("Target player takes two extra turns after this one."));
        // Stranglehold names extra turns precisely to stop them.
        assert!(!is_extra_turns("Your opponents can't take extra turns."));
        assert!(!is_extra_turns("Draw a card at the beginning of your next turn."));
    }
}
