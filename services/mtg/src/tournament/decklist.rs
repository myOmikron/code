//! Rendering a decklist as the plain text an organizer reads
//!
//! Pure on purpose, like the rest of [`super`]: turning a Planarium deck's
//! card slots into a decklist has nothing to do with the database or who is
//! allowed to see it, and keeping it a plain function over a snapshot is what
//! lets [`crate::models::tournament::decklist`] unit-test the shape of the
//! output without a transaction. The format mirrors the names-only mode of
//! `frontend/mtg/src/utils/deck-export.ts`: one line per card, no print, no
//! foil marker — an organizer checking a list against a banlist cares what is
//! played, not which copy.

use std::collections::HashMap;

/// The largest a decklist's stored text may be
///
/// Matches `tournament_decklist.text`'s column bound — see the model's docs
/// on why a 16 KB cap and no further validation.
pub const MAX_DECKLIST_CHARS: usize = 16384;

/// One line of a decklist before it is merged with the rest of its section
#[derive(Debug, Clone)]
pub struct DecklistLine {
    /// How many copies this line contributes
    pub quantity: u32,
    /// The card's name
    pub name: String,
}

/// One section of a decklist, its lines not yet merged or sorted
#[derive(Debug, Clone)]
pub struct DecklistSection {
    /// The heading this section is written under, one of [`SECTION_HEADINGS`]
    pub heading: &'static str,
    /// The section's lines, as read off the deck — possibly several lines
    /// naming the same card, in no particular order
    pub lines: Vec<DecklistLine>,
}

/// Section headings, in the order a decklist is written
///
/// Maybeboard is deliberately absent: a decklist handed to an organizer says
/// what is actually being played, and a card only under consideration is not
/// that.
pub const SECTION_HEADINGS: [&str; 4] = ["Commander", "Deck", "Companion", "Sideboard"];

/// Render decklist sections into the plain text a decklist is stored and read as
///
/// Within each section, lines naming the same card are merged into one by
/// summing their quantities, and the result is sorted by name in plain `str`
/// order — not a locale-aware collation, unlike the frontend's export, since
/// this text is read by an organizer, not typeset. A section with no lines
/// left after merging is skipped entirely rather than written with an empty
/// body. What remains is joined into `"{quantity} {name}"` lines under their
/// heading, one blank line between sections, and no trailing newline —
/// including when every section was empty, which renders as `""`.
pub fn render(sections: &[DecklistSection]) -> String {
    let mut rendered_sections = Vec::with_capacity(sections.len());

    for section in sections {
        let mut merged: HashMap<&str, u32> = HashMap::new();
        for line in &section.lines {
            *merged.entry(line.name.as_str()).or_insert(0) += line.quantity;
        }
        if merged.is_empty() {
            continue;
        }

        let mut names: Vec<&str> = merged.keys().copied().collect();
        names.sort_unstable();

        let mut block = Vec::with_capacity(names.len() + 1);
        block.push(section.heading.to_owned());
        for name in names {
            block.push(format!("{} {name}", merged[name]));
        }
        rendered_sections.push(block.join("\n"));
    }

    rendered_sections.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(quantity: u32, name: &str) -> DecklistLine {
        DecklistLine {
            quantity,
            name: name.to_owned(),
        }
    }

    #[test]
    fn merges_lines_naming_the_same_card() {
        let sections = [DecklistSection {
            heading: "Deck",
            lines: vec![line(2, "Sol Ring"), line(1, "Sol Ring")],
        }];
        assert_eq!(render(&sections), "Deck\n3 Sol Ring");
    }

    #[test]
    fn sorts_by_plain_str_order() {
        let sections = [DecklistSection {
            heading: "Deck",
            lines: vec![line(1, "Zealous Conscripts"), line(1, "Arcane Signet")],
        }];
        assert_eq!(
            render(&sections),
            "Deck\n1 Arcane Signet\n1 Zealous Conscripts"
        );
    }

    #[test]
    fn skips_an_empty_section() {
        let sections = [
            DecklistSection {
                heading: "Commander",
                lines: vec![line(1, "The Ur-Dragon")],
            },
            DecklistSection {
                heading: "Companion",
                lines: vec![],
            },
            DecklistSection {
                heading: "Deck",
                lines: vec![line(1, "Sol Ring")],
            },
        ];
        assert_eq!(
            render(&sections),
            "Commander\n1 The Ur-Dragon\n\nDeck\n1 Sol Ring"
        );
    }

    #[test]
    fn empty_input_renders_as_an_empty_string() {
        assert_eq!(render(&[]), "");

        let sections = [DecklistSection {
            heading: "Deck",
            lines: vec![],
        }];
        assert_eq!(render(&sections), "");
    }

    #[test]
    fn preserves_the_order_sections_were_given_in() {
        let sections = [
            DecklistSection {
                heading: "Sideboard",
                lines: vec![line(1, "Rebuff the Wicked")],
            },
            DecklistSection {
                heading: "Commander",
                lines: vec![line(1, "Kynaios and Tiro of Meletis")],
            },
        ];
        assert_eq!(
            render(&sections),
            "Sideboard\n1 Rebuff the Wicked\n\nCommander\n1 Kynaios and Tiro of Meletis"
        );
    }
}
