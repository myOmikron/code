//! Where each legendary card was printed, for the set and rarity filters of the stack

use std::collections::BTreeMap;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;
use std::time::Instant;

use galvyn::core::Module;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::card_attributes::rarity::CardRarity;
use crate::models::row::decode;

/// How long one read of the catalog is served
const MAX_AGE: Duration = Duration::from_secs(60 * 60);

/// One set and rarity a legendary card was printed at
#[derive(Debug, Clone)]
struct LegendPrinting {
    oracle_id: Uuid,
    set_code: String,
    rarity_rank: i16,
}

/// A set with legendary cards in it
#[derive(Debug, Clone)]
pub struct LegendSet {
    /// Set code, upper case
    pub code: String,
    /// Full set name
    pub name: String,
    /// How many legendary cards it holds
    pub legends: usize,
}

/// Every set and rarity each legendary card was printed at
#[derive(Debug)]
pub struct Legends {
    printings: Vec<LegendPrinting>,
    sets: Vec<LegendSet>,
}

impl Legends {
    /// The legendary cards printed in one of `sets` at one of `rarities`; an empty list leaves that side open
    pub fn matching(&self, sets: &HashSet<String>, rarities: &[CardRarity]) -> Vec<Uuid> {
        let ranks: HashSet<i16> = rarities.iter().map(|rarity| rarity.rank()).collect();
        let mut seen = HashSet::new();
        self.printings
            .iter()
            .filter(|p| sets.is_empty() || sets.contains(&p.set_code))
            .filter(|p| ranks.is_empty() || ranks.contains(&p.rarity_rank))
            .filter(|p| seen.insert(p.oracle_id))
            .map(|p| p.oracle_id)
            .collect()
    }

    /// The sets with legendary cards, by code
    pub fn sets(&self) -> &[LegendSet] {
        &self.sets
    }
}

struct Cached {
    stale_at: Instant,
    legends: Arc<Legends>,
}

static CACHE: LazyLock<Mutex<Option<Cached>>> = LazyLock::new(|| Mutex::new(None));

/// The legendary printings, read from the catalog at most once an hour
pub async fn legends() -> anyhow::Result<Arc<Legends>> {
    let mut cache = CACHE.lock().await;
    if let Some(cached) = cache.as_ref()
        && Instant::now() < cached.stale_at
    {
        return Ok(Arc::clone(&cached.legends));
    }
    let legends = Arc::new(read().await?);
    *cache = Some(Cached {
        stale_at: Instant::now() + MAX_AGE,
        legends: Arc::clone(&legends),
    });
    Ok(legends)
}

async fn read() -> anyhow::Result<Legends> {
    let mut tx = Database::global().start_transaction().await?;
    let rows = (&mut tx)
        .execute::<All>(
            "SELECT DISTINCT p.oracle_id, upper(p.set_code) AS set_code, p.set_name, p.rarity_rank \
             FROM printing p \
             WHERE p.oracle_id IS NOT NULL AND p.type_line LIKE 'Legendary%'"
                .to_string(),
            Vec::new(),
        )
        .await?;
    tx.commit().await?;

    let mut printings = Vec::with_capacity(rows.len());
    let mut sets: BTreeMap<String, (String, HashSet<Uuid>)> = BTreeMap::new();
    for row in rows {
        let printing = LegendPrinting {
            oracle_id: row.get("oracle_id").map_err(decode)?,
            set_code: row.get("set_code").map_err(decode)?,
            rarity_rank: row.get("rarity_rank").map_err(decode)?,
        };
        let name: String = row.get("set_name").map_err(decode)?;
        sets.entry(printing.set_code.clone())
            .or_insert_with(|| (name, HashSet::new()))
            .1
            .insert(printing.oracle_id);
        printings.push(printing);
    }

    Ok(Legends {
        printings,
        sets: sets
            .into_iter()
            .map(|(code, (name, oracle_ids))| LegendSet {
                code,
                name,
                legends: oracle_ids.len(),
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn printing(oracle_id: u128, set_code: &str, rarity: CardRarity) -> LegendPrinting {
        LegendPrinting {
            oracle_id: Uuid::from_u128(oracle_id),
            set_code: set_code.to_string(),
            rarity_rank: rarity.rank(),
        }
    }

    fn legends() -> Legends {
        Legends {
            printings: vec![
                printing(1, "BLB", CardRarity::Mythic),
                printing(1, "BLC", CardRarity::Rare),
                printing(2, "BLB", CardRarity::Uncommon),
                printing(3, "FDN", CardRarity::Rare),
            ],
            sets: Vec::new(),
        }
    }

    #[test]
    fn a_set_keeps_its_legends() {
        let sets = HashSet::from(["BLB".to_string()]);

        let ids = legends().matching(&sets, &[]);

        assert_eq!(ids, vec![Uuid::from_u128(1), Uuid::from_u128(2)]);
    }

    #[test]
    fn a_rarity_counts_any_printing_at_it() {
        let ids = legends().matching(&HashSet::new(), &[CardRarity::Rare]);

        assert_eq!(ids, vec![Uuid::from_u128(1), Uuid::from_u128(3)]);
    }

    #[test]
    fn set_and_rarity_must_meet_in_one_printing() {
        let sets = HashSet::from(["BLB".to_string()]);

        let ids = legends().matching(&sets, &[CardRarity::Rare]);

        assert!(ids.is_empty());
    }
}
