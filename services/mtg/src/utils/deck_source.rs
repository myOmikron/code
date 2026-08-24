//! Reading a decklist off somebody else's site
//!
//! The user hands over the link they already have open. Nothing else about the
//! url is trusted: the host decides which builder it is, the deck's id is read
//! out of the path, and the request that actually goes out is one this module
//! composes. An arbitrary url is never fetched, so this is not a hole to reach
//! the inside of the network through.

use std::time::Duration;

use serde::Deserialize;
use thiserror::Error;
use tracing::instrument;
use url::Url;

use crate::models::deck::DeckZone;

/// Identifies this service to the sites it reads from
const USER_AGENT: &str = "Planarium/0.1 deck-import";

/// How long a builder has to answer before the import gives up
const TIMEOUT: Duration = Duration::from_secs(10);

/// A deck on a site this can read
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeckSource {
    /// A deck on moxfield.com, by its public id
    Moxfield(String),
    /// A deck on archidekt.com, by its numeric id
    Archidekt(u64),
}

/// Why a link could not be turned into a decklist
#[derive(Debug, Error)]
pub enum DeckSourceError {
    /// The url is not one of a site this can read
    #[error("this link is not a deck on a site we can read")]
    Unsupported,
    /// The site refused or was unreachable
    #[error("{site} answered {status}")]
    Refused {
        /// Which site
        site: &'static str,
        /// What it answered
        status: u16,
    },
    /// The site could be reached but its answer was not what we expect
    #[error("{site}'s answer could not be read")]
    Unreadable {
        /// Which site
        site: &'static str,
    },
    /// The request itself failed
    #[error("{site} could not be reached")]
    Unreachable {
        /// Which site
        site: &'static str,
    },
}

/// One card of a fetched decklist
#[derive(Debug, Clone)]
pub struct FetchedCard {
    /// How many copies
    pub quantity: i32,
    /// The card's name
    pub name: String,
    /// The set it was printed in, when the site says
    pub set_code: Option<String>,
    /// The collector number, when the site says
    pub collector_number: Option<String>,
    /// Which zone it sits in
    pub zone: DeckZone,
}

/// A decklist read off another site
#[derive(Debug, Clone)]
pub struct FetchedDeck {
    /// What the deck is called there
    pub name: String,
    /// The format it is built for, as the site spells it
    pub format: Option<String>,
    /// The cards
    pub cards: Vec<FetchedCard>,
}

/// The share token in a link to a deck on this instance
///
/// Read rather than fetched: a link to our own site is answered from the
/// database, so importing a deck somebody shared costs no outgoing request and
/// carries the exact print of every card. Comes back as `None` for every link
/// that is not `https://<host>/shared/decks/<token>`, another instance's links
/// included — those have to go the long way round like any other site.
pub fn parse_share_link(url: &str, host: &str) -> Option<String> {
    let url = Url::parse(url.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }

    if url.host_str()?.trim_start_matches("www.").to_lowercase()
        != host.trim_start_matches("www.").to_lowercase()
    {
        return None;
    }

    let segments: Vec<&str> = url
        .path_segments()?
        .filter(|part| !part.is_empty())
        .collect();
    match segments.as_slice() {
        ["shared", "decks", token, ..] => Some((*token).to_owned()),
        _ => None,
    }
}

/// Work out which site a link points at
///
/// Only the host and the path shape are read; anything else is refused rather
/// than fetched.
pub fn parse_deck_url(url: &str) -> Option<DeckSource> {
    let url = Url::parse(url.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }

    let host = url.host_str()?.trim_start_matches("www.").to_lowercase();
    let segments: Vec<&str> = url
        .path_segments()?
        .filter(|part| !part.is_empty())
        .collect();

    match host.as_str() {
        "moxfield.com" => match segments.as_slice() {
            ["decks", id, ..] => Some(DeckSource::Moxfield((*id).to_owned())),
            _ => None,
        },
        "archidekt.com" => match segments.as_slice() {
            ["decks", id, ..] => id.parse().ok().map(DeckSource::Archidekt),
            _ => None,
        },
        _ => None,
    }
}

/// Fetch a decklist from the site it lives on
#[instrument(name = "deck_source::fetch", skip_all)]
pub async fn fetch(source: &DeckSource) -> Result<FetchedDeck, DeckSourceError> {
    let (site, endpoint) = match source {
        DeckSource::Moxfield(id) => (
            "Moxfield",
            format!("https://api2.moxfield.com/v3/decks/all/{id}"),
        ),
        DeckSource::Archidekt(id) => (
            "Archidekt",
            format!("https://archidekt.com/api/decks/{id}/"),
        ),
    };

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| DeckSourceError::Unreachable { site })?;

    let response = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|_| DeckSourceError::Unreachable { site })?;

    if !response.status().is_success() {
        return Err(DeckSourceError::Refused {
            site,
            status: response.status().as_u16(),
        });
    }

    let body = response
        .text()
        .await
        .map_err(|_| DeckSourceError::Unreachable { site })?;

    let deck = match source {
        DeckSource::Moxfield(_) => read_moxfield(&body),
        DeckSource::Archidekt(_) => read_archidekt(&body),
    };
    deck.ok_or(DeckSourceError::Unreadable { site })
}

/// Moxfield's answer, read leniently
///
/// Their v3 groups the zones under `boards`, their v2 put them at the top
/// level, and both are accepted here: an import that breaks because a site
/// moved a key is a support request nobody wants.
#[derive(Debug, Deserialize)]
struct MoxfieldDeck {
    #[serde(default)]
    name: String,
    #[serde(default)]
    format: Option<String>,
    #[serde(default)]
    boards: Option<MoxfieldBoards>,
    #[serde(default)]
    mainboard: Option<MoxfieldCards>,
    #[serde(default)]
    sideboard: Option<MoxfieldCards>,
    #[serde(default)]
    commanders: Option<MoxfieldCards>,
    #[serde(default)]
    maybeboard: Option<MoxfieldCards>,
}

/// The zones of a v3 answer
#[derive(Debug, Deserialize)]
struct MoxfieldBoards {
    #[serde(default)]
    mainboard: Option<MoxfieldBoard>,
    #[serde(default)]
    sideboard: Option<MoxfieldBoard>,
    #[serde(default)]
    commanders: Option<MoxfieldBoard>,
    #[serde(default)]
    maybeboard: Option<MoxfieldBoard>,
}

/// One zone of a v3 answer
#[derive(Debug, Deserialize)]
struct MoxfieldBoard {
    #[serde(default)]
    cards: MoxfieldCards,
}

/// The cards of one zone, keyed by whatever id the site uses
type MoxfieldCards = std::collections::HashMap<String, MoxfieldEntry>;

/// One card of a zone
#[derive(Debug, Deserialize)]
struct MoxfieldEntry {
    #[serde(default = "one")]
    quantity: i32,
    #[serde(default)]
    card: MoxfieldCard,
}

/// What Moxfield says about a card
#[derive(Debug, Default, Deserialize)]
struct MoxfieldCard {
    #[serde(default)]
    name: String,
    #[serde(default)]
    set: Option<String>,
    #[serde(default)]
    cn: Option<String>,
}

/// Archidekt's answer, read leniently
#[derive(Debug, Deserialize)]
struct ArchidektDeck {
    #[serde(default)]
    name: String,
    #[serde(default)]
    format: Option<serde_json::Value>,
    #[serde(default)]
    cards: Vec<ArchidektEntry>,
}

/// One card of an Archidekt deck
#[derive(Debug, Deserialize)]
struct ArchidektEntry {
    #[serde(default = "one")]
    quantity: i32,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    card: ArchidektCard,
}

/// What Archidekt says about a card
#[derive(Debug, Default, Deserialize)]
struct ArchidektCard {
    #[serde(default)]
    #[serde(rename = "collectorNumber")]
    collector_number: Option<String>,
    #[serde(default)]
    edition: Option<ArchidektEdition>,
    #[serde(default)]
    #[serde(rename = "oracleCard")]
    oracle_card: Option<ArchidektOracle>,
}

/// The set an Archidekt card was printed in
#[derive(Debug, Deserialize)]
struct ArchidektEdition {
    #[serde(default)]
    editioncode: Option<String>,
}

/// The card behind an Archidekt printing
#[derive(Debug, Deserialize)]
struct ArchidektOracle {
    #[serde(default)]
    name: String,
}

/// A card without a stated count is one card
fn one() -> i32 {
    1
}

/// Read Moxfield's answer
fn read_moxfield(body: &str) -> Option<FetchedDeck> {
    let deck: MoxfieldDeck = serde_json::from_str(body).ok()?;

    let boards = deck.boards.as_ref();
    let zones: [(Option<&MoxfieldCards>, Option<&MoxfieldBoard>, DeckZone); 4] = [
        (
            deck.mainboard.as_ref(),
            boards.and_then(|boards| boards.mainboard.as_ref()),
            DeckZone::Main,
        ),
        (
            deck.sideboard.as_ref(),
            boards.and_then(|boards| boards.sideboard.as_ref()),
            DeckZone::Side,
        ),
        (
            deck.commanders.as_ref(),
            boards.and_then(|boards| boards.commanders.as_ref()),
            DeckZone::Commander,
        ),
        (
            deck.maybeboard.as_ref(),
            boards.and_then(|boards| boards.maybeboard.as_ref()),
            DeckZone::Maybe,
        ),
    ];

    let mut cards = Vec::new();
    for (flat, nested, zone) in zones {
        let entries = nested.map(|board| &board.cards).or(flat);
        let Some(entries) = entries else { continue };
        for entry in entries.values() {
            if entry.card.name.is_empty() {
                continue;
            }
            cards.push(FetchedCard {
                quantity: entry.quantity.max(1),
                name: entry.card.name.clone(),
                set_code: entry.card.set.clone(),
                collector_number: entry.card.cn.clone(),
                zone,
            });
        }
    }

    if cards.is_empty() {
        return None;
    }
    Some(FetchedDeck {
        name: deck.name,
        format: deck.format,
        cards,
    })
}

/// Read Archidekt's answer
///
/// The zone is a category rather than a column there: a card is a commander,
/// a sideboard card or a maybeboard card by carrying that word among its
/// categories.
fn read_archidekt(body: &str) -> Option<FetchedDeck> {
    let deck: ArchidektDeck = serde_json::from_str(body).ok()?;

    let mut cards = Vec::new();
    for entry in &deck.cards {
        let name = entry
            .card
            .oracle_card
            .as_ref()
            .map(|oracle| oracle.name.clone())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }

        cards.push(FetchedCard {
            quantity: entry.quantity.max(1),
            name,
            set_code: entry
                .card
                .edition
                .as_ref()
                .and_then(|edition| edition.editioncode.clone()),
            collector_number: entry.card.collector_number.clone(),
            zone: zone_of(&entry.categories),
        });
    }

    if cards.is_empty() {
        return None;
    }
    Some(FetchedDeck {
        name: deck.name,
        format: deck.format.and_then(format_slug),
        cards,
    })
}

/// The zone an Archidekt category list names
fn zone_of(categories: &[String]) -> DeckZone {
    for category in categories {
        match category.to_lowercase().as_str() {
            "commander" | "commanders" => return DeckZone::Commander,
            "sideboard" => return DeckZone::Side,
            "maybeboard" => return DeckZone::Maybe,
            "companion" => return DeckZone::Companion,
            _ => {}
        }
    }
    DeckZone::Main
}

/// Archidekt writes its format as a number, which says nothing here
fn format_slug(format: serde_json::Value) -> Option<String> {
    format.as_str().map(str::to_lowercase)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_hosts_it_knows() {
        assert_eq!(
            parse_deck_url("https://moxfield.com/decks/AbC123"),
            Some(DeckSource::Moxfield("AbC123".to_owned())),
        );
        assert_eq!(
            parse_deck_url("https://www.moxfield.com/decks/AbC123/primer"),
            Some(DeckSource::Moxfield("AbC123".to_owned())),
        );
        assert_eq!(
            parse_deck_url("https://archidekt.com/decks/123456/my_deck"),
            Some(DeckSource::Archidekt(123456)),
        );
    }

    #[test]
    fn reads_our_own_share_links() {
        assert_eq!(
            parse_share_link("https://planarium.app/shared/decks/tok3n", "planarium.app"),
            Some("tok3n".to_owned()),
        );
        assert_eq!(
            parse_share_link(
                "https://planarium.app/shared/decks/tok3n/cards",
                "planarium.app"
            ),
            Some("tok3n".to_owned()),
        );
    }

    #[test]
    fn refuses_share_links_of_other_hosts() {
        assert!(
            parse_share_link("https://elsewhere.app/shared/decks/tok3n", "planarium.app").is_none()
        );
        assert!(
            parse_share_link(
                "https://planarium.app/shared/collections/tok3n",
                "planarium.app"
            )
            .is_none()
        );
        assert!(parse_share_link("https://planarium.app/decks/tok3n", "planarium.app").is_none());
        assert!(parse_share_link("file:///etc/passwd", "planarium.app").is_none());
    }

    #[test]
    fn refuses_everything_else() {
        assert!(parse_deck_url("https://example.com/decks/1").is_none());
        assert!(parse_deck_url("http://localhost:8080/admin").is_none());
        assert!(parse_deck_url("file:///etc/passwd").is_none());
        assert!(parse_deck_url("https://moxfield.com/users/somebody").is_none());
        assert!(parse_deck_url("not a url").is_none());
    }

    #[test]
    fn reads_a_moxfield_answer_in_either_shape() {
        let v3 = r#"{
            "name": "Hashaton",
            "format": "commander",
            "boards": {
                "mainboard": { "cards": { "a": { "quantity": 2, "card": { "name": "Sol Ring", "set": "LTR", "cn": "123" } } } },
                "commanders": { "cards": { "b": { "quantity": 1, "card": { "name": "Hashaton" } } } }
            }
        }"#;
        let deck = read_moxfield(v3).expect("v3 reads");
        assert_eq!(deck.name, "Hashaton");
        assert_eq!(deck.cards.len(), 2);

        let v2 = r#"{
            "name": "Old",
            "mainboard": { "a": { "quantity": 4, "card": { "name": "Lightning Bolt" } } }
        }"#;
        let deck = read_moxfield(v2).expect("v2 reads");
        assert_eq!(deck.cards.len(), 1);
        assert_eq!(deck.cards[0].quantity, 4);
    }

    #[test]
    fn reads_an_archidekt_answer() {
        let body = r#"{
            "name": "Ramp",
            "cards": [
                {
                    "quantity": 1,
                    "categories": ["Commander"],
                    "card": {
                        "collectorNumber": "1",
                        "edition": { "editioncode": "ltr" },
                        "oracleCard": { "name": "Atraxa" }
                    }
                },
                {
                    "quantity": 3,
                    "categories": ["Ramp"],
                    "card": { "oracleCard": { "name": "Sol Ring" } }
                }
            ]
        }"#;
        let deck = read_archidekt(body).expect("archidekt reads");
        assert_eq!(deck.cards.len(), 2);
        assert_eq!(deck.cards[0].zone, DeckZone::Commander);
        assert_eq!(deck.cards[1].zone, DeckZone::Main);
        assert_eq!(deck.cards[1].quantity, 3);
    }

    #[test]
    fn an_answer_without_cards_is_unreadable() {
        assert!(read_moxfield(r#"{"name": "empty"}"#).is_none());
        assert!(read_archidekt(r#"{"name": "empty", "cards": []}"#).is_none());
    }
}
