//! Which cards Archon lets a deck play
//!
//! Archon is the Commander variant played one on one: two players, twenty
//! life, at least a hundred cards. The shape of the deck is in
//! [`FORMAT_RULES`](crate::models::format::FORMAT_RULES); what is here is the
//! card pool, because Scryfall does not report Archon legality and so the
//! catalog has to derive it.
//!
//! The pool is the eternal one. Archon publishes what it excludes — silver
//! borders and acorn stamps, oversized and Planechase-shaped cards, cards that
//! ask for physical skill or start subgames, ante, conspiracies, stickers and
//! attractions, and the cards Wizards pulled for racist depictions — and
//! Vintage excludes every one of them already, as `not_legal` or as `banned`.
//! So the pool is what Vintage calls legal or restricted; restriction is a
//! limit on copies, and a singleton format sets a stricter one anyway. On top
//! of that comes Archon's own banlist, which is fetched rather than kept here:
//! it is a living list, and a copy in this file would be wrong the day it
//! moves.

use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;
use std::time::Instant;

use anyhow::Context;
use serde::Deserialize;
use tokio::sync::Mutex;
use tracing::info;
use tracing::warn;

/// The slug Archon is tracked and stored under
///
/// Not one of Scryfall's, unlike every other entry in
/// [`TRACKED_FORMATS`](crate::models::printing::TRACKED_FORMATS).
pub const SLUG: &str = "archon";

/// Where Archon publishes its banlist
const BANLIST_URL: &str = "https://archon.page/wp-content/uploads/data/archon-banlist.json";

/// How long a fetched banlist is served before it is fetched again
///
/// The list moves a few times a year and the file is two kilobytes, so a day
/// is both far more often than it needs and far less traffic than one page
/// view of the site it comes from.
const MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

/// How long a banlist that could not be refreshed is served before trying again
const RETRY_AFTER: Duration = Duration::from_secs(15 * 60);

/// How long the fetch is given before it counts as failed
const TIMEOUT: Duration = Duration::from_secs(30);

/// Identifies this service to archon.page
const USER_AGENT: &str = "Planarium/0.1 archon-banlist";

/// The Vintage verdicts that put a card in Archon's pool
const IN_POOL: [&str; 2] = ["legal", "restricted"];

/// The banlist as archon.page publishes it
///
/// Every list is optional: a file that drops a key it once had should cost
/// that one rule, not the whole format.
#[derive(Debug, Default, Deserialize)]
struct PublishedBanlist {
    #[serde(default)]
    banned: Vec<String>,
    #[serde(default)]
    banned_as_commander: Vec<String>,
    #[serde(default)]
    banned_as_partner: Vec<String>,
    #[serde(default)]
    banned_as_companion: Vec<String>,
    #[serde(default)]
    banned_partner_pairings: Vec<Vec<String>>,
}

/// Cards Archon bans from a zone rather than from the deck
///
/// Every card named here is legal in the ninety-nine — the ban is on the job,
/// not on the card. The catalog cannot answer those, because a printing row
/// says nothing about where in a deck the card ends up, so they are handed to
/// the client and read against the command zone there.
#[derive(Debug, Default, Clone)]
pub struct RoleBans {
    /// Cards that may not be a commander
    pub commander: Vec<String>,
    /// Cards that may not be one of a pair of partnered commanders
    ///
    /// On their own they are legal commanders, which is why this is not
    /// [`Self::commander`]: only the second seat is the problem.
    pub partner: Vec<String>,
    /// Cards that may not be the companion
    pub companion: Vec<String>,
    /// Commander pairs that may not sit in the command zone together
    pub pairings: Vec<[String; 2]>,
}

/// What Archon bans, as the rest of the service asks about it
#[derive(Debug, Default)]
pub struct Banlist {
    /// Cards no deck may play, in any zone
    banned: HashSet<String>,
    /// Cards banned from a zone rather than from the deck
    pub roles: RoleBans,
}

impl Banlist {
    /// Whether Archon lets a deck play this card
    ///
    /// # Arguments
    /// - `name`: the card's English name, as Scryfall spells it
    /// - `legalities`: Scryfall's verdict per format
    pub fn is_legal(&self, name: &str, legalities: &HashMap<String, String>) -> bool {
        let vintage = legalities.get("vintage").map(String::as_str).unwrap_or("");
        IN_POOL.contains(&vintage) && !self.banned.contains(name)
    }
}

impl From<PublishedBanlist> for Banlist {
    fn from(published: PublishedBanlist) -> Self {
        Self {
            banned: published.banned.iter().map(spelled).collect(),
            roles: RoleBans {
                commander: published.banned_as_commander.iter().map(spelled).collect(),
                partner: published.banned_as_partner.iter().map(spelled).collect(),
                companion: published.banned_as_companion.iter().map(spelled).collect(),
                // Anything that is not a pair is dropped rather than guessed
                // at: a rule about two commanders needs both of them.
                pairings: published
                    .banned_partner_pairings
                    .iter()
                    .filter_map(|pair| match pair.as_slice() {
                        [left, right] => Some([spelled(left), spelled(right)]),
                        _ => None,
                    })
                    .collect(),
            },
        }
    }
}

/// Spells a published card name the way the catalog spells it
///
/// The file writes possessives with a typographic apostrophe — `Mishra’s
/// Workshop` — where Scryfall and therefore the catalog write a plain one. A
/// name left as published matches no card and would ban nothing.
fn spelled(name: impl AsRef<str>) -> String {
    name.as_ref().replace('\u{2019}', "'")
}

/// A fetched banlist and when it is due to be fetched again
struct Cached {
    /// When the list stops being served from here
    stale_at: Instant,
    /// The list
    banlist: Arc<Banlist>,
}

/// The last fetched banlist
///
/// Process-wide: the catalog sync and the webserver are separate processes and
/// each keeps its own, which costs one two-kilobyte request a day each.
static CACHE: LazyLock<Mutex<Option<Cached>>> = LazyLock::new(|| Mutex::new(None));

/// Archon's banlist, fetched at most once a day
///
/// A fetch that fails while a list is already held serves the held one rather
/// than nothing: the file changes a few times a year, so yesterday's answer is
/// very nearly right where an empty list would call the whole format legal.
///
/// # Returns
/// The banlist, or an error when it has never been fetched successfully
pub async fn banlist() -> anyhow::Result<Arc<Banlist>> {
    let mut cache = CACHE.lock().await;

    if let Some(cached) = cache.as_ref()
        && Instant::now() < cached.stale_at
    {
        return Ok(Arc::clone(&cached.banlist));
    }

    match fetch().await {
        Ok(fetched) => {
            let banlist = Arc::new(fetched);
            *cache = Some(Cached {
                stale_at: Instant::now() + MAX_AGE,
                banlist: Arc::clone(&banlist),
            });
            Ok(banlist)
        }
        Err(error) => match cache.as_mut() {
            Some(cached) => {
                warn!(%error, "Serving the last Archon banlist, refreshing it failed");
                cached.stale_at = Instant::now() + RETRY_AFTER;
                Ok(Arc::clone(&cached.banlist))
            }
            None => Err(error),
        },
    }
}

/// Asks archon.page for its banlist
async fn fetch() -> anyhow::Result<Banlist> {
    let published: PublishedBanlist = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(TIMEOUT)
        .build()
        .context("building the http client")?
        .get(BANLIST_URL)
        .send()
        .await
        .context("asking archon.page for its banlist")?
        .error_for_status()
        .context("archon.page refused the banlist")?
        .json()
        .await
        .context("reading the banlist")?;

    let banlist = Banlist::from(published);
    info!(
        banned = banlist.banned.len(),
        commander = banlist.roles.commander.len(),
        partner = banlist.roles.partner.len(),
        companion = banlist.roles.companion.len(),
        pairings = banlist.roles.pairings.len(),
        "Fetched the Archon banlist"
    );

    Ok(banlist)
}
