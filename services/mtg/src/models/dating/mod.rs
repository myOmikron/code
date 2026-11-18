//! Command Zone Dating: an account's swipes on Commanders and the profile they judge it by

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::hash::DefaultHasher;
use std::hash::Hash;
use std::hash::Hasher;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::dating::db::DatingProfileInsertPatch;
use crate::models::dating::db::DatingProfileModel;
use crate::models::dating::db::DatingSwipeInsertPatch;
use crate::models::dating::db::DatingSwipeModel;
use crate::models::deck::Deck;
use crate::models::deck::listing::DeckSummary;
use crate::models::row::decode;

pub mod date;
pub(in crate::models) mod db;
pub mod legends;
pub mod remote;

/// How many decks feed a profile, newest first
pub const MAX_PROFILE_DECKS: usize = 40;

/// Where a date with a Commander stands
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum DateStatus {
    /// Swiped left
    Passed,
    /// Both sides like each other
    Matched,
    /// The Commander said no
    Rejected,
    /// Unmatched after a match
    Unmatched,
}
custom_db_enum! {
    enum: DateStatus,
    variants: [Passed, Matched, Rejected, Unmatched],
    decoder: DateStatusDecoder,
}

/// What Commanders see of an account, as the advisor builds it
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GraphProfile {
    /// How many decks went into it
    pub decks: i64,
    /// Theme id to how strongly the account plays it, 0..1
    pub themes: BTreeMap<String, f64>,
    /// Theme id to its label
    #[serde(default)]
    pub labels: BTreeMap<String, String>,
    /// Color letter to the share of decks playing it
    pub colors: BTreeMap<String, f64>,
    /// Average bracket
    pub bracket: Option<f64>,
    /// Typical deck price in euro
    pub budget_eur: Option<f64>,
    /// Average salt of the account's Commanders
    pub salt: Option<f64>,
}

/// The dating-profile questions, for accounts without decks
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProfileAnswers {
    /// Colors as letters of WUBRG
    pub colors: String,
    /// Preferred bracket
    pub bracket: Option<i16>,
    /// Typical deck budget in euro
    pub budget_eur: Option<i32>,
}

/// One deck as the profile reads it
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProfileDeck {
    /// Oracle ids of the commanders
    pub commanders: Vec<Uuid>,
    /// Oracle id to copies, main deck only
    pub cards: BTreeMap<Uuid, i64>,
    /// The deck's bracket
    pub bracket: Option<i16>,
    /// List value in euro
    pub price_eur: Option<f64>,
    /// Color identity letters
    pub colors: Vec<String>,
}

/// An account's dating profile row
#[derive(Debug, Clone)]
pub struct DatingProfile {
    /// The answers, if the questions were answered
    pub answers: Option<ProfileAnswers>,
    /// The last profile the advisor built
    pub snapshot: Option<GraphProfile>,
    /// Fingerprint of the snapshot's inputs
    pub snapshot_key: Option<String>,
}

impl From<DatingProfileModel> for DatingProfile {
    fn from(model: DatingProfileModel) -> Self {
        Self {
            answers: model.answered.then(|| ProfileAnswers {
                colors: model.colors.into_inner(),
                bracket: model.bracket,
                budget_eur: model.budget_eur,
            }),
            snapshot: model.snapshot.map(Json::into_inner),
            snapshot_key: model.snapshot_key.map(MaxStr::into_inner),
        }
    }
}

impl DatingProfile {
    /// The account's profile row, `None` before the first stack
    #[instrument(name = "DatingProfile::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Option<DatingProfile>, rorm::Error> {
        let model = rorm::query(&mut *tx, DatingProfileModel)
            .condition(DatingProfileModel.owner.equals(owner.into_inner()))
            .optional()
            .await?;
        Ok(model.map(Self::from))
    }

    /// Store answers; the snapshot is dropped so the next read rebuilds it
    #[instrument(name = "DatingProfile::save_answers", skip(tx))]
    pub async fn save_answers(
        tx: &mut Transaction,
        owner: AccountUuid,
        answers: &ProfileAnswers,
    ) -> Result<(), rorm::Error> {
        let colors = MaxStr::new(answers.colors.clone()).unwrap_or_default();
        let updated = rorm::update(&mut *tx, DatingProfileModel)
            .set(DatingProfileModel.colors, colors.clone())
            .set(DatingProfileModel.bracket, answers.bracket)
            .set(DatingProfileModel.budget_eur, answers.budget_eur)
            .set(DatingProfileModel.answered, true)
            .set(DatingProfileModel.snapshot_key, None)
            .condition(DatingProfileModel.owner.equals(owner.into_inner()))
            .await?;
        if updated == 0 {
            rorm::insert(&mut *tx, DatingProfileModel)
                .return_nothing()
                .single(&DatingProfileInsertPatch {
                    uuid: Uuid::now_v7(),
                    owner: ForeignModelByField(owner.into_inner()),
                    colors,
                    bracket: answers.bracket,
                    budget_eur: answers.budget_eur,
                    answered: true,
                    snapshot: None,
                    snapshot_key: None,
                })
                .await?;
        }
        Ok(())
    }

    /// Store a freshly built snapshot and the fingerprint it was built from
    #[instrument(name = "DatingProfile::save_snapshot", skip(tx, snapshot))]
    pub async fn save_snapshot(
        tx: &mut Transaction,
        owner: AccountUuid,
        snapshot: GraphProfile,
        key: &str,
    ) -> Result<(), rorm::Error> {
        let key = MaxStr::new(key.to_string()).ok();
        let updated = rorm::update(&mut *tx, DatingProfileModel)
            .set(DatingProfileModel.snapshot, Some(Json(snapshot.clone())))
            .set(DatingProfileModel.snapshot_key, key.clone())
            .condition(DatingProfileModel.owner.equals(owner.into_inner()))
            .await?;
        if updated == 0 {
            rorm::insert(&mut *tx, DatingProfileModel)
                .return_nothing()
                .single(&DatingProfileInsertPatch {
                    uuid: Uuid::now_v7(),
                    owner: ForeignModelByField(owner.into_inner()),
                    colors: MaxStr::default(),
                    bracket: None,
                    budget_eur: None,
                    answered: false,
                    snapshot: Some(Json(snapshot)),
                    snapshot_key: key,
                })
                .await?;
        }
        Ok(())
    }
}

/// The account's decks with Commanders, newest first, as the profile reads them
#[instrument(name = "ProfileDeck::read_for_account", skip(tx))]
pub async fn read_profile_decks(
    tx: &mut Transaction,
    owner: AccountUuid,
) -> Result<Vec<ProfileDeck>, rorm::Error> {
    let decks = Deck::get_all_for_account(tx, owner).await?;
    let summaries = DeckSummary::read_for_account(tx, owner).await?;

    let rows = (&mut *tx)
        .execute::<All>(
            "SELECT c.deck, p.oracle_id, c.zone, SUM(c.quantity)::BIGINT AS quantity, \
                    MIN(p.color_identity) AS color_identity \
             FROM deckcard c \
             JOIN deck d ON d.uuid = c.deck \
             JOIN printing p ON p.id = c.printing \
             WHERE d.owner = $1 AND c.zone IN ('Main', 'Commander') AND p.oracle_id IS NOT NULL \
             GROUP BY c.deck, p.oracle_id, c.zone"
                .to_string(),
            vec![Value::Uuid(owner.into_inner())],
        )
        .await?;

    let mut by_deck: HashMap<Uuid, ProfileDeck> = HashMap::new();
    for row in rows {
        let deck: Uuid = row.get("deck").map_err(decode)?;
        let oracle_id: Uuid = row.get("oracle_id").map_err(decode)?;
        let zone: String = row.get("zone").map_err(decode)?;
        let quantity: i64 = row.get("quantity").map_err(decode)?;
        let identity: String = row.get("color_identity").map_err(decode)?;
        let entry = by_deck.entry(deck).or_insert_with(|| ProfileDeck {
            commanders: Vec::new(),
            cards: BTreeMap::new(),
            bracket: None,
            price_eur: None,
            colors: Vec::new(),
        });
        if zone == "Commander" {
            entry.commanders.push(oracle_id);
            for letter in identity.chars().filter(|c| "WUBRG".contains(*c)) {
                let letter = letter.to_string();
                if !entry.colors.contains(&letter) {
                    entry.colors.push(letter);
                }
            }
        } else {
            *entry.cards.entry(oracle_id).or_default() += quantity;
        }
    }

    let mut out = Vec::new();
    for deck in decks.into_iter().rev() {
        let Some(mut profile_deck) = by_deck.remove(&deck.uuid.into_inner()) else {
            continue;
        };
        if profile_deck.commanders.is_empty() {
            continue;
        }
        profile_deck.commanders.sort();
        profile_deck.bracket = deck.bracket;
        if let Some(allowed) = deck.allowed_color_identity {
            profile_deck.colors = allowed
                .chars()
                .filter(|c| "WUBRG".contains(*c))
                .map(String::from)
                .collect();
        }
        profile_deck.colors.sort();
        profile_deck.price_eur = summaries
            .get(&deck.uuid)
            .map(|summary| summary.price_eur as f64 / 100.0);
        out.push(profile_deck);
        if out.len() == MAX_PROFILE_DECKS {
            break;
        }
    }
    Ok(out)
}

/// Fingerprint of a profile's inputs: a changed deck or answer means a rebuild
pub fn profile_key(decks: &[ProfileDeck], answers: Option<&ProfileAnswers>) -> String {
    let mut hasher = DefaultHasher::new();
    for deck in decks {
        deck.commanders.hash(&mut hasher);
        for (card, quantity) in &deck.cards {
            card.hash(&mut hasher);
            quantity.hash(&mut hasher);
        }
        deck.bracket.hash(&mut hasher);
        deck.price_eur.map(f64::to_bits).hash(&mut hasher);
        deck.colors.hash(&mut hasher);
    }
    answers.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// One swipe on a Commander
#[derive(Debug, Clone)]
pub struct Swipe {
    /// The Commander's oracle id
    pub commander: Uuid,
    /// Where the date stands
    pub status: DateStatus,
    /// Swiped up
    pub super_like: bool,
    /// Restored with "No, come back"
    pub came_back: bool,
    /// The dimension a rejection names
    pub dimension: Option<String>,
    /// More or less of that dimension
    pub direction: Option<String>,
    /// The missing interest or colors
    pub detail: Option<String>,
    /// The interest both sides share
    pub shared: Option<String>,
    /// When the swipe happened
    pub created_at: OffsetDateTime,
}

impl From<DatingSwipeModel> for Swipe {
    fn from(model: DatingSwipeModel) -> Self {
        Self {
            commander: model.commander,
            status: model.status,
            super_like: model.super_like,
            came_back: model.came_back,
            dimension: model.dimension.map(MaxStr::into_inner),
            direction: model.direction.map(MaxStr::into_inner),
            detail: model.detail.map(MaxStr::into_inner),
            shared: model.shared.map(MaxStr::into_inner),
            created_at: model.created_at,
        }
    }
}

/// A swipe to record
#[derive(Debug, Clone)]
pub struct SwipeInsert {
    /// The Commander's oracle id
    pub commander: Uuid,
    /// Where the date stands
    pub status: DateStatus,
    /// Swiped up
    pub super_like: bool,
    /// Compatibility the Commander saw
    pub score: f64,
    /// The dimension a rejection names
    pub dimension: Option<String>,
    /// More or less of that dimension
    pub direction: Option<String>,
    /// The missing interest or colors
    pub detail: Option<String>,
    /// The interest both sides share
    pub shared: Option<String>,
}

fn bounded<const N: usize>(value: Option<String>) -> Option<MaxStr<N>> {
    let mut value = value?;
    if value.len() > N {
        let mut end = N;
        while !value.is_char_boundary(end) {
            end -= 1;
        }
        value.truncate(end);
    }
    MaxStr::new(value).ok()
}

impl Swipe {
    /// Oracle ids of every Commander the account has swiped
    #[instrument(name = "Swipe::swiped", skip(tx))]
    pub async fn swiped(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<Uuid>, rorm::Error> {
        let rows = rorm::query(&mut *tx, DatingSwipeModel.commander)
            .condition(DatingSwipeModel.owner.equals(owner.into_inner()))
            .all()
            .await?;
        Ok(rows)
    }

    /// Record a swipe, replacing an earlier one on the same Commander
    #[instrument(name = "Swipe::record", skip(tx))]
    pub async fn record(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: SwipeInsert,
    ) -> Result<Swipe, rorm::Error> {
        rorm::delete(&mut *tx, DatingSwipeModel)
            .condition(rorm::and![
                DatingSwipeModel.owner.equals(owner.into_inner()),
                DatingSwipeModel.commander.equals(insert.commander),
            ])
            .await?;
        let model = rorm::insert(&mut *tx, DatingSwipeModel)
            .single(&DatingSwipeInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                commander: insert.commander,
                status: insert.status,
                super_like: insert.super_like,
                score: insert.score,
                dimension: bounded(insert.dimension),
                direction: bounded(insert.direction),
                detail: bounded(insert.detail),
                shared: bounded(insert.shared),
            })
            .await?;
        Ok(Swipe::from(model))
    }

    /// Undo the newest swipe, returning its Commander
    #[instrument(name = "Swipe::rewind", skip(tx))]
    pub async fn rewind(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Option<Uuid>, rorm::Error> {
        let newest = rorm::query(&mut *tx, DatingSwipeModel)
            .condition(DatingSwipeModel.owner.equals(owner.into_inner()))
            .order_desc(DatingSwipeModel.created_at)
            .optional()
            .await?;
        let Some(newest) = newest else {
            return Ok(None);
        };
        rorm::delete(&mut *tx, DatingSwipeModel)
            .condition(DatingSwipeModel.uuid.equals(newest.uuid))
            .await?;
        Ok(Some(newest.commander))
    }

    /// How many super likes the account spent since `since`
    #[instrument(name = "Swipe::super_likes_since", skip(tx))]
    pub async fn super_likes_since(
        tx: &mut Transaction,
        owner: AccountUuid,
        since: OffsetDateTime,
    ) -> Result<i64, rorm::Error> {
        let rows = rorm::query(&mut *tx, DatingSwipeModel.uuid)
            .condition(rorm::and![
                DatingSwipeModel.owner.equals(owner.into_inner()),
                DatingSwipeModel.super_like.equals(true),
                DatingSwipeModel.created_at.greater_equals(since),
            ])
            .all()
            .await?;
        Ok(rows.len() as i64)
    }

    /// How the newest `count` likes ended, newest first
    #[instrument(name = "Swipe::recent_likes", skip(tx))]
    pub async fn recent_likes(
        tx: &mut Transaction,
        owner: AccountUuid,
        count: u64,
    ) -> Result<Vec<DateStatus>, rorm::Error> {
        rorm::query(&mut *tx, DatingSwipeModel.status)
            .condition(rorm::and![
                DatingSwipeModel.owner.equals(owner.into_inner()),
                DatingSwipeModel.status.not_equals(DateStatus::Passed),
            ])
            .order_desc(DatingSwipeModel.created_at)
            .limit(count)
            .all()
            .await
    }

    /// Every date that got past a pass, newest first
    #[instrument(name = "Swipe::dates", skip(tx))]
    pub async fn dates(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<Swipe>, rorm::Error> {
        let models = rorm::query(&mut *tx, DatingSwipeModel)
            .condition(rorm::and![
                DatingSwipeModel.owner.equals(owner.into_inner()),
                DatingSwipeModel.status.not_equals(DateStatus::Passed),
            ])
            .order_desc(DatingSwipeModel.created_at)
            .all()
            .await?;
        Ok(models.into_iter().map(Swipe::from).collect())
    }

    /// Move a date to `status`, `None` when there is no date with that Commander
    #[instrument(name = "Swipe::set_status", skip(tx))]
    pub async fn set_status(
        tx: &mut Transaction,
        owner: AccountUuid,
        commander: Uuid,
        status: DateStatus,
        came_back: bool,
    ) -> Result<Option<Swipe>, rorm::Error> {
        let condition = || {
            rorm::and![
                DatingSwipeModel.owner.equals(owner.into_inner()),
                DatingSwipeModel.commander.equals(commander),
                DatingSwipeModel.status.not_equals(DateStatus::Passed),
            ]
        };
        let updated = rorm::update(&mut *tx, DatingSwipeModel)
            .set(DatingSwipeModel.status, status)
            .set(DatingSwipeModel.came_back, came_back)
            .condition(condition())
            .await?;
        if updated == 0 {
            return Ok(None);
        }
        let model = rorm::query(&mut *tx, DatingSwipeModel)
            .condition(condition())
            .one()
            .await?;
        Ok(Some(Swipe::from(model)))
    }

    /// Forget every pass, so those Commanders come back into the stack
    #[instrument(name = "Swipe::reset_passes", skip(tx))]
    pub async fn reset_passes(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<u64, rorm::Error> {
        rorm::delete(&mut *tx, DatingSwipeModel)
            .condition(rorm::and![
                DatingSwipeModel.owner.equals(owner.into_inner()),
                DatingSwipeModel.status.equals(DateStatus::Passed),
            ])
            .await
    }
}

/// The printing a Commander is shown and added with
#[derive(Debug, Clone)]
pub struct CommanderPrinting {
    /// The Default printing's id
    pub printing: Uuid,
    /// Card name
    pub name: String,
    /// Color identity letters
    pub color_identity: String,
    /// Art crop url
    pub image_art_crop: Option<String>,
    /// Full card image url
    pub image_normal: Option<String>,
}

/// The Default printing per oracle id, for those the catalog knows
#[instrument(name = "CommanderPrinting::read", skip(tx, oracle_ids))]
pub async fn read_commander_printings(
    tx: &mut Transaction,
    oracle_ids: &[Uuid],
) -> Result<HashMap<Uuid, CommanderPrinting>, rorm::Error> {
    if oracle_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = (1..=oracle_ids.len())
        .map(|index| format!("${index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let rows = (&mut *tx)
        .execute::<All>(
            format!(
                "SELECT DISTINCT ON (p.oracle_id) p.oracle_id, p.id, p.name, p.color_identity, \
                    p.image_art_crop, p.image_normal \
             FROM printing p \
             WHERE p.oracle_id IN ({placeholders}) \
               AND (p.released_at IS NULL OR p.released_at <= CURRENT_DATE) \
             ORDER BY p.oracle_id, (p.lang = 'en') DESC, \
                      (p.legal_formats <> '' \
                       AND 'nonfoil' = ANY(string_to_array(p.finishes, ','))) DESC, \
                      (p.legal_formats <> '') DESC, \
                      ('nonfoil' = ANY(string_to_array(p.finishes, ','))) DESC, \
                      p.released_at DESC NULLS LAST, p.price_eur ASC NULLS LAST, \
                      p.collector_number_sort ASC, p.id ASC"
            ),
            oracle_ids.iter().map(|id| Value::Uuid(*id)).collect(),
        )
        .await?;

    let mut out = HashMap::new();
    for row in rows {
        let oracle_id: Uuid = row.get("oracle_id").map_err(decode)?;
        out.insert(
            oracle_id,
            CommanderPrinting {
                printing: row.get("id").map_err(decode)?,
                name: row.get("name").map_err(decode)?,
                color_identity: row.get("color_identity").map_err(decode)?,
                image_art_crop: row.get("image_art_crop").map_err(decode)?,
                image_normal: row.get("image_normal").map_err(decode)?,
            },
        );
    }
    Ok(out)
}
