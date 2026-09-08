//! What artwork MPCFill has for a card
//!
//! MPCFill (formerly MPC Autofill) keeps a search index over the community's
//! Google Drive folders of custom card art and hands finished orders to
//! MakePlayingCards. Its api is two requests wide: a search that answers a
//! card's name with a list of image ids, and a lookup that says what each of
//! those images is — which drive it came from, at what resolution, and where
//! its thumbnail sits. The ids are Google Drive file ids, and they are exactly
//! what an order xml names, so a client that has them can write the order.
//!
//! Asked from here rather than from the browser: their server answers with
//! `Access-Control-Allow-Origin` for their own site and for localhost only, so
//! a page served from anywhere else never gets to read the answer. Going
//! through the service also means one cache for every reader instead of one per
//! browser, which is the polite way to lean on a community-funded index.
//!
//! Their `2/` api, not the `3/` one their repository has moved on to: the
//! server behind mpcfill.com answers `3/editorSearch/` with a 404, and the
//! difference is the shape of the search — `2/` takes a list of queries and
//! answers with a bucket per card type, `3/` takes a map and answers with one
//! list per key.
//!
//! Nothing is stored. The index moves — drives are added, images are replaced —
//! and an id kept in our database would rot; a search is cheap enough to make
//! again when the order is placed.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use serde::Deserialize;
use serde::Serialize;
use tokio::sync::Mutex;
use tracing::debug;
use url::Url;

/// How long a connection attempt to MPCFill may take
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Upper bound on one request to MPCFill
///
/// Their search runs over an Elasticsearch index and answers a whole deck's
/// worth of names in one request, which is slower than a single lookup but
/// nowhere near this.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Identifies this service to MPCFill
const USER_AGENT: &str = "Planarium/0.1 mpcfill-client";

/// How long a search is served from the cache
///
/// New art shows up in the drives daily, so a few hours behind is nothing a
/// reader would notice, and it keeps a deck that is picked through card by card
/// from asking the same question a hundred times.
const IMAGES_MAX_AGE: Duration = Duration::from_secs(6 * 60 * 60);

/// How long the list of drives is served from the cache
const SOURCES_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

/// How many searched names the cache holds before it is emptied
///
/// A card's hits are a few hundred bytes, so this is a couple of megabytes at
/// worst. Emptied rather than evicted one by one: the cache is a courtesy to
/// their server, not a store anything depends on.
const IMAGES_CACHE_SIZE: usize = 4_096;

/// How many images one lookup asks about
///
/// Their `2/cards/` endpoint pages at a thousand.
const CARDS_PER_LOOKUP: usize = 1_000;

/// The lowest resolution an image may have to be searched for
const MINIMUM_DPI: u32 = 0;

/// The highest resolution an image may have to be searched for
const MAXIMUM_DPI: u32 = 1_500;

/// The largest image, in megabytes, that is searched for
const MAXIMUM_SIZE_MB: u32 = 30;

/// One image of one card, as MPCFill holds it
#[derive(Debug, Clone)]
pub struct Image {
    /// The Google Drive file id — what an order xml names
    pub id: String,
    /// The file's name in the drive, e.g. `Sol Ring (Normal).png`
    pub name: String,
    /// The drive the image came from, as its owner named it
    pub source: String,
    /// The resolution the image was uploaded at
    pub dpi: i64,
    /// How large the file is, in bytes
    pub size: i64,
    /// The language the card is printed in, as a two-letter code
    pub language: String,
    /// What the image was tagged with, e.g. `NSFW`, `Extended`
    pub tags: Vec<String>,
    /// A thumbnail 400 pixels across, for a picker's grid
    pub thumbnail_small: String,
    /// A thumbnail 800 pixels across, for looking at one closely
    pub thumbnail_medium: String,
}

/// Setup for [`MpcFill`], the option must be filled
#[derive(Debug, Default)]
pub struct MpcFillSetup {
    /// Base url of the MPCFill server whose index is searched
    pub base_url: Option<Url>,
}

/// Global module wrapping the client for MPCFill's search index
pub struct MpcFill {
    /// Base url of the server the index is asked of
    base_url: Url,
    /// The pooled client every request shares
    client: reqwest::Client,
    /// The drives to search, and when the list is due to be fetched again
    sources: Mutex<Option<CachedSources>>,
    /// What was found for a searched name, keyed by the name as searched
    images: Mutex<HashMap<String, CachedImages>>,
    /// The community's card backs, which are one search for everybody
    cardbacks: Mutex<Option<CachedImages>>,
}

impl Module for MpcFill {
    type Setup = MpcFillSetup;
    type PreInit = (reqwest::Client, Url);

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        let base_url = setup
            .base_url
            .ok_or("base_url must be set in MpcFillSetup")?;

        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| format!("Failed to build the MPCFill http client: {error}"))?;

        Ok((client, base_url))
    }

    type Dependencies = ();

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let (client, base_url) = pre_init;
        Ok(Self {
            base_url,
            client,
            sources: Mutex::new(None),
            images: Mutex::new(HashMap::new()),
            cardbacks: Mutex::new(None),
        })
    }
}

impl MpcFill {
    /// The images MPCFill has for each of these cards
    ///
    /// The answer is one list per name, in the order it was asked, and each
    /// list is in the order MPCFill ranks it: their own sort by drive and
    /// resolution, which is what their editor shows first as well. A name
    /// nothing was found for gets an empty list rather than an error — a card
    /// nobody has drawn is a normal answer.
    ///
    /// # Arguments
    /// - `names`: the cards' names, as printed; they are sanitised here
    pub async fn images_for(&self, names: &[String]) -> anyhow::Result<Vec<Vec<Arc<Image>>>> {
        let searched: Vec<String> = names.iter().map(|name| searchable(name)).collect();

        // The same name twice is one search: a deck plays four of a card as
        // four slots, and they are all filled from the same list of art.
        let mut found: HashMap<String, Vec<Arc<Image>>> = HashMap::new();
        let mut missing: Vec<String> = Vec::new();
        {
            let cache = self.images.lock().await;
            for name in &searched {
                if name.is_empty() || found.contains_key(name) {
                    continue;
                }
                match cache.get(name) {
                    Some(cached) if Instant::now() < cached.stale_at => {
                        found.insert(name.clone(), cached.images.clone());
                    }
                    _ => missing.push(name.clone()),
                }
            }
            missing.sort();
            missing.dedup();
            drop(cache);
        }

        if !missing.is_empty() {
            let fetched = self.search(&missing).await?;
            let mut cache = self.images.lock().await;
            if cache.len() + fetched.len() > IMAGES_CACHE_SIZE {
                cache.clear();
            }
            for (name, images) in fetched {
                cache.insert(
                    name.clone(),
                    CachedImages {
                        stale_at: Instant::now() + IMAGES_MAX_AGE,
                        images: images.clone(),
                    },
                );
                found.insert(name, images);
            }
        }

        Ok(searched
            .into_iter()
            .map(|name| found.get(&name).cloned().unwrap_or_default())
            .collect())
    }

    /// The card backs MPCFill offers
    ///
    /// One list for everybody, so it is fetched once and held: an order names
    /// exactly one of these as the back of every card that does not bring its
    /// own.
    pub async fn cardbacks(&self) -> anyhow::Result<Vec<Arc<Image>>> {
        let mut cache = self.cardbacks.lock().await;

        if let Some(cached) = cache.as_ref()
            && Instant::now() < cached.stale_at
        {
            return Ok(cached.images.clone());
        }

        let settings = self.search_settings().await?;
        let response: CardbacksResponse = self
            .post(
                "2/cardbacks/",
                &CardbacksRequest {
                    search_settings: settings,
                },
            )
            .await?;
        let images = self.lookup(&response.cardbacks).await?;

        *cache = Some(CachedImages {
            stale_at: Instant::now() + IMAGES_MAX_AGE,
            images: images.clone(),
        });

        Ok(images)
    }

    /// Asks MPCFill for the images of every one of these names
    ///
    /// Two requests for the whole batch rather than two per name: their search
    /// takes a map of names and answers with a map of ids, and the lookup that
    /// turns those ids into images pages at a thousand at a time.
    async fn search(&self, names: &[String]) -> anyhow::Result<HashMap<String, Vec<Arc<Image>>>> {
        let settings = self.search_settings().await?;
        let queries = names
            .iter()
            .map(|name| SearchQuery {
                query: name.clone(),
                card_type: CARD,
            })
            .collect();

        let response: SearchResponse = self
            .post(
                "2/editorSearch/",
                &SearchRequest {
                    queries,
                    search_settings: settings,
                },
            )
            .await?;

        // One bucket per card type comes back per name; only the cards were
        // asked for, and a name nothing was found for brings an empty one.
        let found: HashMap<String, Vec<String>> = response
            .results
            .into_iter()
            .map(|(name, buckets)| {
                let ids = buckets.get(CARD).cloned().unwrap_or_default();
                (name, ids)
            })
            .collect();

        let ids: Vec<String> = found
            .values()
            .flatten()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        let images = self.lookup(&ids).await?;
        let by_id: HashMap<&str, &Arc<Image>> = images
            .iter()
            .map(|image| (image.id.as_str(), image))
            .collect();

        debug!(
            names = names.len(),
            images = images.len(),
            "Searched MPCFill's index"
        );

        Ok(found
            .into_iter()
            .map(|(name, ids)| {
                let images = ids
                    .iter()
                    // An id the lookup did not answer for is dropped: it is an
                    // image that left the drive between the two requests.
                    .filter_map(|id| by_id.get(id.as_str()).map(|image| Arc::clone(*image)))
                    .collect();
                (name, images)
            })
            .collect())
    }

    /// What each of these ids is, in the order they were asked
    async fn lookup(&self, ids: &[String]) -> anyhow::Result<Vec<Arc<Image>>> {
        let mut cards: HashMap<String, WireCard> = HashMap::new();

        for chunk in ids.chunks(CARDS_PER_LOOKUP) {
            let response: CardsResponse = self
                .post(
                    "2/cards/",
                    &CardsRequest {
                        card_identifiers: chunk.to_vec(),
                    },
                )
                .await?;
            cards.extend(response.results);
        }

        Ok(ids
            .iter()
            .filter_map(|id| cards.remove(id))
            .map(|card| Arc::new(Image::from(card)))
            .collect())
    }

    /// The settings every search is made with
    ///
    /// Everything is wide open apart from the drives: no language, tag, size or
    /// resolution is ruled out, because a reader who is looking at the art with
    /// their own eyes is the better filter. The drives have to be named, though
    /// — MPCFill searches the ones it is given and nothing else.
    async fn search_settings(&self) -> anyhow::Result<SearchSettings> {
        Ok(SearchSettings {
            search_type_settings: SearchTypeSettings {
                fuzzy_search: true,
                filter_cardbacks: false,
            },
            source_settings: SourceSettings {
                sources: self
                    .source_keys()
                    .await?
                    .iter()
                    .map(|source| (*source, true))
                    .collect(),
            },
            filter_settings: FilterSettings {
                minimum_dpi: MINIMUM_DPI,
                maximum_dpi: MAXIMUM_DPI,
                maximum_size: MAXIMUM_SIZE_MB,
                languages: Vec::new(),
                includes_tags: Vec::new(),
                excludes_tags: Vec::new(),
            },
        })
    }

    /// Every drive MPCFill indexes, ascending by the key it holds them under
    ///
    /// Their own editor lets a reader order the drives and searches them in
    /// that order; here they are searched in the order they were registered,
    /// which is what their site defaults to as well.
    async fn source_keys(&self) -> anyhow::Result<Vec<i64>> {
        let mut cache = self.sources.lock().await;

        if let Some(cached) = cache.as_ref()
            && Instant::now() < cached.stale_at
        {
            return Ok(cached.sources.clone());
        }

        let response: SourcesResponse = self.get("2/sources/").await?;
        let mut sources: Vec<i64> = response
            .results
            .into_values()
            .map(|source| source.pk)
            .collect();
        sources.sort_unstable();

        *cache = Some(CachedSources {
            stale_at: Instant::now() + SOURCES_MAX_AGE,
            sources: sources.clone(),
        });

        Ok(sources)
    }

    /// Reads one of MPCFill's `GET` endpoints
    async fn get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> anyhow::Result<T> {
        let url = self.base_url.join(path)?;
        Ok(self
            .client
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }

    /// Posts to one of MPCFill's endpoints and reads the answer
    async fn post<B: Serialize, T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        body: &B,
    ) -> anyhow::Result<T> {
        let url = self.base_url.join(path)?;
        Ok(self
            .client
            .post(url)
            .json(body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
}

/// A fetched list of images and when it is due to be fetched again
struct CachedImages {
    /// When the list stops being served from here
    stale_at: Instant,
    /// The images
    images: Vec<Arc<Image>>,
}

/// The fetched list of drives and when it is due to be fetched again
struct CachedSources {
    /// When the list stops being served from here
    stale_at: Instant,
    /// The keys of the drives
    sources: Vec<i64>,
}

/// The punctuation MPCFill's index drops from a name
///
/// Their own list, character for character, and dropped rather than replaced:
/// `Urza's Saga` is held as `urzas saga`, and asking for `urza s saga` finds
/// nothing at all. Hyphens are not in it — `Snow-Covered Forest` keeps its one.
const DROPPED: &str = "~`!@#$%^&*(){}[];:\"'\u{2019}<,.>?/\\|_+=";

/// A card's name as MPCFill's index spells it
///
/// Their index holds a name folded down to lower case words: the punctuation
/// above gone, whatever is left of the spacing collapsed. A name searched as
/// printed matches nothing, which is why this happens here rather than being
/// left to the caller.
///
/// The two halves of a two-faced card are not separated here — that is the
/// caller's business, because it is the caller that knows whether it wants the
/// front or the back.
fn searchable(name: &str) -> String {
    name.chars()
        .filter(|character| !DROPPED.contains(*character))
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// What MPCFill calls an ordinary card, as opposed to a back or a token
const CARD: &str = "CARD";

/// A search over MPCFill's index
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    /// What to look for, every entry distinct
    queries: Vec<SearchQuery>,
    /// Which drives to search and what to rule out
    search_settings: SearchSettings,
}

/// One name to look for
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    /// The name, sanitised
    query: String,
    /// Whether a card, a back or a token is wanted
    card_type: &'static str,
}

/// A request for MPCFill's card backs
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CardbacksRequest {
    /// Which drives to search and what to rule out
    search_settings: SearchSettings,
}

/// A request for what a list of ids is
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CardsRequest {
    /// The Google Drive file ids
    card_identifiers: Vec<String>,
}

/// How a search is narrowed
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchSettings {
    /// How names are matched
    search_type_settings: SearchTypeSettings,
    /// Which drives are searched
    source_settings: SourceSettings,
    /// What is ruled out
    filter_settings: FilterSettings,
}

/// How names are matched
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchTypeSettings {
    /// Whether a name that is not spelled exactly still matches
    fuzzy_search: bool,
    /// Whether the filters below apply to card backs as well
    filter_cardbacks: bool,
}

/// Which drives are searched
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceSettings {
    /// Every drive's key and whether it is searched, in search order
    sources: Vec<(i64, bool)>,
}

/// What a search rules out
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FilterSettings {
    /// The lowest resolution an image may have
    #[serde(rename = "minimumDPI")]
    minimum_dpi: u32,
    /// The highest resolution an image may have
    #[serde(rename = "maximumDPI")]
    maximum_dpi: u32,
    /// The largest an image may be, in megabytes
    maximum_size: u32,
    /// The languages images may be in, empty for every one of them
    languages: Vec<String>,
    /// Tags an image has to carry, empty for no such rule
    includes_tags: Vec<String>,
    /// Tags an image may not carry, empty for no such rule
    excludes_tags: Vec<String>,
}

/// What a search found, keyed by the name that was searched
#[derive(Debug, Deserialize)]
struct SearchResponse {
    /// Per searched name one bucket per card type, holding the ids in MPCFill's own order
    results: HashMap<String, HashMap<String, Vec<String>>>,
}

/// What MPCFill's card backs are
#[derive(Debug, Deserialize)]
struct CardbacksResponse {
    /// The ids of the backs, in MPCFill's own order
    cardbacks: Vec<String>,
}

/// What a list of ids is
#[derive(Debug, Deserialize)]
struct CardsResponse {
    /// One image per id that is still in a drive
    results: HashMap<String, WireCard>,
}

/// One image, as MPCFill describes it
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireCard {
    /// The Google Drive file id
    identifier: String,
    /// The file's name in the drive
    name: String,
    /// The drive it came from
    source_name: String,
    /// The resolution it was uploaded at
    dpi: i64,
    /// How large the file is, in bytes
    size: i64,
    /// The file's extension, kept apart from its name in the index
    #[serde(default)]
    extension: String,
    /// The language the card is printed in
    #[serde(default)]
    language: String,
    /// What the image is tagged with
    #[serde(default)]
    tags: Vec<String>,
    /// A thumbnail 400 pixels across
    small_thumbnail_url: String,
    /// A thumbnail 800 pixels across
    medium_thumbnail_url: String,
}

impl From<WireCard> for Image {
    fn from(card: WireCard) -> Self {
        // The index keeps the file's stem and its extension apart; an order
        // names the file, so they are put back together here — `Sol Ring
        // (Extended Dom)` plus `png` is what MPCFill writes as
        // `Sol Ring (Extended Dom).png`.
        let name = if card.extension.is_empty() {
            card.name
        } else {
            format!("{}.{}", card.name, card.extension)
        };

        Self {
            id: card.identifier,
            name,
            source: card.source_name,
            dpi: card.dpi,
            size: card.size,
            language: card.language,
            tags: card.tags,
            thumbnail_small: card.small_thumbnail_url,
            thumbnail_medium: card.medium_thumbnail_url,
        }
    }
}

/// The drives MPCFill indexes
#[derive(Debug, Deserialize)]
struct SourcesResponse {
    /// One drive per key it is held under
    results: HashMap<String, WireSource>,
}

/// One drive
#[derive(Debug, Deserialize)]
struct WireSource {
    /// The key a search names the drive by
    pk: i64,
}

#[cfg(test)]
mod tests {
    use super::CARD;
    use super::FilterSettings;
    use super::Image;
    use super::MAXIMUM_DPI;
    use super::MAXIMUM_SIZE_MB;
    use super::MINIMUM_DPI;
    use super::SearchQuery;
    use super::SearchRequest;
    use super::SearchResponse;
    use super::SearchSettings;
    use super::SearchTypeSettings;
    use super::SourceSettings;
    use super::WireCard;
    use super::searchable;

    #[test]
    fn folds_a_name_the_way_the_index_holds_it() {
        assert_eq!(searchable("Sol Ring"), "sol ring");
        assert_eq!(searchable("Braids, Cabal Minion"), "braids cabal minion");
        assert_eq!(searchable("Ach! Hans, Run!"), "ach hans run");
        assert_eq!(searchable("Bothersome Quasit"), "bothersome quasit");
    }

    #[test]
    fn keeps_the_hyphen_a_name_is_printed_with() {
        assert_eq!(searchable("Snow-Covered Forest"), "snow-covered forest");
    }

    /// Dropped, not replaced: their index holds `urzas saga`, and their own
    /// search finds nothing for `urza s saga`.
    #[test]
    fn closes_the_gap_an_apostrophe_leaves() {
        assert_eq!(searchable("Urza's Saga"), "urzas saga");
        assert_eq!(searchable("Urza\u{2019}s Saga"), "urzas saga");
        assert_eq!(searchable("Yawgmoth's Will"), "yawgmoths will");
    }

    #[test]
    fn has_nothing_to_search_for_an_empty_name() {
        assert_eq!(searchable("  "), "");
    }

    /// A search as the client sends it
    fn request() -> SearchRequest {
        SearchRequest {
            queries: vec![SearchQuery {
                query: String::from("sol ring"),
                card_type: CARD,
            }],
            search_settings: SearchSettings {
                search_type_settings: SearchTypeSettings {
                    fuzzy_search: true,
                    filter_cardbacks: false,
                },
                source_settings: SourceSettings {
                    sources: vec![(1, true), (2, true)],
                },
                filter_settings: FilterSettings {
                    minimum_dpi: MINIMUM_DPI,
                    maximum_dpi: MAXIMUM_DPI,
                    maximum_size: MAXIMUM_SIZE_MB,
                    languages: Vec::new(),
                    includes_tags: Vec::new(),
                    excludes_tags: Vec::new(),
                },
            },
        }
    }

    /// The wire format their `2/` api takes, which is not the one `3/` takes:
    /// a list of queries, the drives as pairs, and two keys that are spelled
    /// with `DPI` rather than camel case.
    #[test]
    fn writes_the_search_the_way_their_api_takes_it() {
        let json = serde_json::to_value(request()).expect("the request serialises");

        assert_eq!(json["queries"][0]["query"], "sol ring");
        assert_eq!(json["queries"][0]["cardType"], "CARD");
        assert_eq!(
            json["searchSettings"]["searchTypeSettings"]["fuzzySearch"],
            true
        );
        assert_eq!(json["searchSettings"]["sourceSettings"]["sources"][1][0], 2);
        assert_eq!(
            json["searchSettings"]["sourceSettings"]["sources"][1][1],
            true
        );
        assert_eq!(json["searchSettings"]["filterSettings"]["minimumDPI"], 0);
        assert_eq!(json["searchSettings"]["filterSettings"]["maximumDPI"], 1500);
        assert_eq!(json["searchSettings"]["filterSettings"]["maximumSize"], 30);
        assert_eq!(
            json["searchSettings"]["filterSettings"]["languages"][0],
            serde_json::Value::Null
        );
    }

    /// Their answer is a bucket per card type, and a name they found nothing
    /// for brings an empty object rather than an empty list.
    #[test]
    fn reads_the_ids_out_of_the_card_bucket() {
        let response: SearchResponse =
            serde_json::from_str(r#"{"results":{"sol ring":{"CARD":["a","b"]},"whatever":{}}}"#)
                .expect("the answer parses");

        assert_eq!(
            response.results["sol ring"][CARD],
            vec![String::from("a"), String::from("b")]
        );
        assert!(!response.results["whatever"].contains_key(CARD));
    }

    /// One image as their `2/cards/` endpoint really answers it
    #[test]
    fn puts_a_file_name_back_together() {
        let card: WireCard = serde_json::from_str(
            r#"{"cardType":"CARD","dpi":1200,"extension":"png","identifier":"1OL6SM",
                "language":"EN","mediumThumbnailUrl":"medium","name":"Sol Ring (Extended Dom)",
                "size":12732208,"smallThumbnailUrl":"small","source":"MrTeferi",
                "sourceName":"MrTeferi","tags":[]}"#,
        )
        .expect("the card parses");
        let image = Image::from(card);

        assert_eq!(image.name, "Sol Ring (Extended Dom).png");
        assert_eq!(image.source, "MrTeferi");
        assert_eq!(image.dpi, 1200);
        assert_eq!(image.thumbnail_small, "small");
    }
}
