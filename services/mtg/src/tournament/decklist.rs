//! Renders a decklist as plain text (names only, like the frontend's names-only export)

use std::collections::HashMap;

/// Maximum length of a stored decklist, matching `tournament_decklist.text`
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
    /// The section's lines, unmerged and unsorted
    pub lines: Vec<DecklistLine>,
}

/// Section headings in written order (no maybeboard: a decklist says what is played)
pub const SECTION_HEADINGS: [&str; 4] = ["Commander", "Deck", "Companion", "Sideboard"];

/// Render sections as `"{quantity} {name}"` lines, merged, `str`-sorted, empty ones skipped
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
