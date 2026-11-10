//! How many copies of each Deck entry the deck's Physical deck covers with Proxies
//!
//! A Proxy fulfils a Deck entry like a real card (ADR 0007), so the count is
//! read off the Deviation, which hands the Physical deck out to the Deck
//! entries. A Registered deck reads it while it follows its deck and freezes
//! it with the copy (ADR 0002).

use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;

use crate::models::deck::Deck;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::deviation::DeckDeviation;
use crate::models::deck::deviation::LineDeviation;

/// The Proxy count of every Deck entry of one deck
///
/// An entry the Physical deck covers with no Proxy, one in the maybe board,
/// and every entry of a deck without a Physical deck count zero.
#[derive(Debug, Clone, Default)]
pub struct DeckProxies(HashMap<DeckCardUuid, i32>);

impl DeckProxies {
    /// Read the deck's list and its Physical deck and count the Proxies per Deck entry
    ///
    /// The caller has to have established that the reader may see them.
    #[instrument(name = "DeckProxies::read", skip(tx))]
    pub async fn read(tx: &mut Transaction, deck: DeckUuid) -> Result<Self, rorm::Error> {
        let collection = Deck::collection(tx, deck).await?;
        let deviation =
            DeckDeviation::read(tx, deck, collection.map(|collection| collection.uuid)).await?;
        Ok(Self(
            deviation
                .map(|deviation| deviation.lines)
                .unwrap_or_default()
                .iter()
                .map(|line| (line.entry, line_proxies(line)))
                .filter(|(_, count)| *count > 0)
                .collect(),
        ))
    }

    /// How many copies of `entry` are Proxies
    pub fn of(&self, entry: DeckCardUuid) -> i32 {
        self.0.get(&entry).copied().unwrap_or(0)
    }
}

/// How many of the copies standing in for a line are Proxies
///
/// Those of the listed printing and finish, and those of another printing:
/// a Proxy of another printing is a Deviation, but still a Proxy played for
/// that line. A surplus Proxy plays for none.
fn line_proxies(line: &LineDeviation) -> i32 {
    line.proxies
        + line
            .other_printing
            .iter()
            .filter(|copies| copies.proxy)
            .map(|copies| copies.quantity)
            .sum::<i32>()
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::line_proxies;
    use crate::models::deck::DeckCardUuid;
    use crate::models::deck::deviation::DeviationCopies;
    use crate::models::deck::deviation::LineDeviation;

    /// Copies of another printing standing in for a line
    fn other(quantity: i32, proxy: bool) -> DeviationCopies {
        DeviationCopies {
            printing: Uuid::now_v7(),
            quantity,
            foil: false,
            proxy,
            card: None,
        }
    }

    #[test]
    fn proxies_of_the_listed_and_of_other_printings_count_but_no_surplus() {
        let line = LineDeviation {
            entry: DeckCardUuid::from_uuid(Uuid::now_v7()),
            in_deck: 2,
            proxies: 1,
            other_printing: vec![other(1, true), other(1, false)],
            missing: 0,
            surplus: 3,
        };
        assert_eq!(line_proxies(&line), 2);
    }
}
