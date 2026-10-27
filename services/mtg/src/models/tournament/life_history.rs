//! Typed durable Match Life history, private recording ownership and retry receipts.

use std::collections::HashMap;
use std::collections::HashSet;

use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::schemars::{self};
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use sha2::Digest;
use sha2::Sha256;
use uuid::Uuid;

use super::db::MatchLifeHistoryInsertPatch;
use super::db::MatchLifeHistoryModel;
use super::db::MatchLifeReceiptInsertPatch;
use super::db::MatchLifeReceiptModel;
use super::play::MatchPlay;
use crate::models::account::AccountUuid;

/// One Participant in original Seat order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MatchLifePlayer {
    /// The Participant identity.
    pub id: Uuid,
    /// Display name retained with the Game.
    pub name: MaxStr<128>,
}

/// The kind of a retained Life operation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum MatchLifeEventKind {
    /// Initial Game setup.
    Start,
    /// Life adjustment.
    Life,
    /// Commander damage and corresponding life adjustment.
    Commander,
    /// Classification of already deducted life as commander damage.
    Reclassify,
    /// Compensation retaining the original operation.
    Correction,
    /// Explicit Game completion.
    End,
}

/// One immutable operation in a Game's Life history.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchLifeEvent {
    /// Stable operation identity across retries.
    pub id: Uuid,
    /// Operation category.
    pub kind: MatchLifeEventKind,
    /// Device-recorded operation time, independent of server receipt time.
    pub at: SchemaDateTime,
    /// Affected Participant.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub player: Option<Uuid>,
    /// Commander damage source.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commander: Option<Uuid>,
    /// Signed life adjustment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<i32>,
    /// Signed commander damage adjustment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub damage_amount: Option<i32>,
    /// Earlier operation being corrected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corrects: Option<Uuid>,
    /// Earlier life operations being classified without deducting life again.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reclassifies: Option<Vec<Uuid>>,
}

/// An explicit Game outcome; never a submitted Tournament Result.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum MatchLifeOutcome {
    /// A Participant recorded as winner.
    Winner {
        /// The winning Participant.
        winner: Uuid,
    },
    /// A recorded draw.
    Draw,
}

/// A Game's original setup, current totals and retained operations.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchLifeGame {
    /// Match Participants in Seat order.
    pub players: Vec<MatchLifePlayer>,
    /// Original life totals.
    pub starting_life: Vec<i32>,
    /// Current life totals.
    pub life: Vec<i32>,
    /// Commander damage matrix, affected Participant first.
    pub damage: Vec<Vec<i32>>,
    /// Original, ungrouped operations.
    pub events: Vec<MatchLifeEvent>,
    /// Explicit winner or draw, if completed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<MatchLifeOutcome>,
}

/// The complete, append-preserved history of a Match.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct MatchLifeHistory {
    /// Serialization version, currently one.
    pub version: u8,
    /// All Games in play order.
    pub games: Vec<MatchLifeGame>,
}

/// Public durable state; intentionally contains no recording credential.
#[derive(Clone, Debug, Serialize, JsonSchema)]
pub struct MatchLifeHistoryResponse {
    /// Uploaded history, absent until its first save.
    pub history: Option<MatchLifeHistory>,
    /// Ownership epoch, incremented by every ownership change.
    pub generation: i64,
    /// Accepted upload sequence number.
    pub revision: i64,
    /// Public recording-device identity, never an authorization credential.
    pub writer: Option<Uuid>,
    /// Server receipt time of the latest accepted operation.
    pub updated_at: Option<SchemaDateTime>,
    /// Stable request acknowledged by a write, absent on reads.
    pub accepted_request: Option<Uuid>,
    /// Revision originally accepted for that request, even on a late retry.
    pub accepted_revision: Option<i64>,
}

/// An explicit claim using a private credential saved locally before the request.
#[derive(Clone, Deserialize, Serialize, JsonSchema)]
pub struct ClaimMatchLifeRequest {
    /// Public device identity.
    pub device: Uuid,
    /// Private random capability, never returned to observers or logged.
    pub writer_token: Uuid,
    /// Stable identity of this exact request.
    pub request_id: Uuid,
    /// Ownership epoch observed before claiming.
    pub generation: i64,
    /// Saved revision observed before claiming.
    pub expected_revision: i64,
}

/// An immutable upload intent, retried with the same identity and content.
#[derive(Clone, Deserialize, Serialize, JsonSchema)]
pub struct SaveMatchLifeRequest {
    /// Public recording-device identity.
    pub device: Uuid,
    /// Private capability bound to the recording Account and device.
    pub writer_token: Uuid,
    /// Stable identity of this exact upload.
    pub request_id: Uuid,
    /// Recording ownership epoch.
    pub generation: i64,
    /// Previously acknowledged revision.
    pub expected_revision: i64,
    /// Complete append-preserving history.
    pub history: MatchLifeHistory,
}

/// Why a claim or upload could not be accepted.
#[derive(Default, Debug, Clone, Serialize, JsonSchema)]
pub struct MatchLifeErrors {
    /// Another device owns recording, or the capability no longer matches.
    pub writer_conflict: bool,
    /// The saved state changed since this request was prepared.
    pub revision_conflict: bool,
    /// A request identity was reused for different content.
    pub request_conflict: bool,
    /// History has invalid Participants, totals, references or retained prefix.
    pub invalid_history: bool,
}

/// The durable state of one authorized Match, without claiming ownership.
pub async fn read(
    tx: &mut Transaction,
    played: Uuid,
) -> Result<MatchLifeHistoryResponse, rorm::Error> {
    let row = rorm::query(&mut *tx, MatchLifeHistoryModel)
        .condition(MatchLifeHistoryModel.tournament_match.equals(played))
        .optional()
        .await?;
    Ok(response(row, None))
}

fn response(
    row: Option<MatchLifeHistoryModel>,
    receipt: Option<(Uuid, i64)>,
) -> MatchLifeHistoryResponse {
    MatchLifeHistoryResponse {
        history: row
            .as_ref()
            .and_then(|r| r.history.as_ref().map(|h| h.0.clone())),
        generation: row.as_ref().map_or(0, |r| r.generation),
        revision: row.as_ref().map_or(0, |r| r.revision),
        writer: row.as_ref().and_then(|r| r.writer),
        updated_at: row.map(|r| SchemaDateTime(r.updated_at)),
        accepted_request: receipt.map(|r| r.0),
        accepted_revision: receipt.map(|r| r.1),
    }
}

/// A deterministic digest for a private capability or typed request.
pub fn digest(bytes: &[u8]) -> MaxStr<64> {
    MaxStr::new(
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>(),
    )
    .expect("SHA-256 hex fits 64 bytes")
}

async fn receipt(
    tx: &mut Transaction,
    played: Uuid,
    request: Uuid,
    hash: &MaxStr<64>,
    account: AccountUuid,
) -> Result<Option<Result<i64, MatchLifeErrors>>, rorm::Error> {
    let stored = rorm::query(&mut *tx, MatchLifeReceiptModel)
        .condition(
            MatchLifeReceiptModel
                .uuid
                .equals(Uuid::new_v3(&played, request.as_bytes())),
        )
        .optional()
        .await?;
    Ok(stored.map(|r| {
        if r.request_hash == *hash && r.account.0 == account.into_inner() {
            Ok(r.accepted_revision)
        } else {
            Err(MatchLifeErrors {
                request_conflict: true,
                ..Default::default()
            })
        }
    }))
}

async fn remember(
    tx: &mut Transaction,
    played: Uuid,
    request: Uuid,
    hash: MaxStr<64>,
    account: AccountUuid,
    revision: i64,
) -> Result<(), rorm::Error> {
    rorm::insert(&mut *tx, MatchLifeReceiptModel)
        .return_nothing()
        .single(&MatchLifeReceiptInsertPatch {
            uuid: Uuid::new_v3(&played, request.as_bytes()),
            tournament_match: ForeignModelByField(played),
            request_hash: hash,
            account: ForeignModelByField(account.into_inner()),
            accepted_revision: revision,
        })
        .await
}

/// Claim an unowned Match while its Tournament is locked by the caller.
pub async fn claim(
    tx: &mut Transaction,
    played: Uuid,
    account: AccountUuid,
    request: ClaimMatchLifeRequest,
) -> Result<Result<MatchLifeHistoryResponse, MatchLifeErrors>, rorm::Error> {
    let hash = digest(&serde_json::to_vec(&("claim", &request)).expect("typed claim serializes"));
    if let Some(retried) = receipt(tx, played, request.request_id, &hash, account).await? {
        return match retried {
            Ok(revision) => {
                let mut state = read(tx, played).await?;
                state.accepted_request = Some(request.request_id);
                state.accepted_revision = Some(revision);
                Ok(Ok(state))
            }
            Err(e) => Ok(Err(e)),
        };
    }
    let state = read(tx, played).await?;
    if state.writer.is_some() {
        return Ok(Err(MatchLifeErrors {
            writer_conflict: true,
            ..Default::default()
        }));
    }
    if state.generation != request.generation || state.revision != request.expected_revision {
        return Ok(Err(MatchLifeErrors {
            revision_conflict: true,
            ..Default::default()
        }));
    }
    rorm::insert(&mut *tx, MatchLifeHistoryModel)
        .return_nothing()
        .single(&MatchLifeHistoryInsertPatch {
            tournament_match: ForeignModelByField(played),
            history: None,
            generation: 1,
            revision: 0,
            writer: Some(request.device),
            writer_account: Some(ForeignModelByField(account.into_inner())),
            writer_token_hash: Some(digest(request.writer_token.as_bytes())),
            updated_at: OffsetDateTime::now_utc(),
        })
        .await?;
    remember(tx, played, request.request_id, hash, account, 0).await?;
    let mut state = read(tx, played).await?;
    state.accepted_request = Some(request.request_id);
    state.accepted_revision = Some(0);
    Ok(Ok(state))
}

/// Save append-preserving history only for its current private recording capability.
pub async fn save(
    tx: &mut Transaction,
    context: &MatchPlay,
    account: AccountUuid,
    request: SaveMatchLifeRequest,
) -> Result<Result<MatchLifeHistoryResponse, MatchLifeErrors>, rorm::Error> {
    let played = context.played.uuid.into_inner();
    let hash = digest(&serde_json::to_vec(&("save", &request)).expect("typed history serializes"));
    if let Some(retried) = receipt(tx, played, request.request_id, &hash, account).await? {
        return match retried {
            Ok(revision) => {
                let mut state = read(tx, played).await?;
                state.accepted_request = Some(request.request_id);
                state.accepted_revision = Some(revision);
                Ok(Ok(state))
            }
            Err(e) => Ok(Err(e)),
        };
    }
    let row = rorm::query(&mut *tx, MatchLifeHistoryModel)
        .condition(MatchLifeHistoryModel.tournament_match.equals(played))
        .optional()
        .await?;
    let Some(row) = row else {
        return Ok(Err(MatchLifeErrors {
            writer_conflict: true,
            ..Default::default()
        }));
    };
    if row.writer != Some(request.device)
        || row.writer_account.as_ref().map(|a| a.0) != Some(account.into_inner())
        || row.writer_token_hash.as_ref() != Some(&digest(request.writer_token.as_bytes()))
        || row.generation != request.generation
    {
        return Ok(Err(MatchLifeErrors {
            writer_conflict: true,
            ..Default::default()
        }));
    }
    if row.revision != request.expected_revision {
        return Ok(Err(MatchLifeErrors {
            revision_conflict: true,
            ..Default::default()
        }));
    }
    if !valid_history(
        &request.history,
        row.history.as_ref().map(|h| &h.0),
        context,
    ) {
        return Ok(Err(MatchLifeErrors {
            invalid_history: true,
            ..Default::default()
        }));
    }
    let revision = row.revision + 1;
    rorm::update(&mut *tx, MatchLifeHistoryModel)
        .set(MatchLifeHistoryModel.history, Some(Json(request.history)))
        .set(MatchLifeHistoryModel.revision, revision)
        .set(MatchLifeHistoryModel.updated_at, OffsetDateTime::now_utc())
        .condition(MatchLifeHistoryModel.tournament_match.equals(played))
        .await?;
    remember(tx, played, request.request_id, hash, account, revision).await?;
    let mut state = read(tx, played).await?;
    state.accepted_request = Some(request.request_id);
    state.accepted_revision = Some(revision);
    Ok(Ok(state))
}

fn valid_history(
    history: &MatchLifeHistory,
    previous: Option<&MatchLifeHistory>,
    context: &MatchPlay,
) -> bool {
    if history.version != 1
        || history.games.is_empty()
        || history.games.len() > 64
        || history.games.iter().map(|g| g.events.len()).sum::<usize>() > 20_000
    {
        return false;
    }
    let seats: Vec<_> = context
        .played
        .seats
        .iter()
        .map(|s| s.participant.into_inner())
        .collect();
    let n = seats.len();
    let mut event_ids = HashSet::new();
    for (index, game) in history.games.iter().enumerate() {
        if game.players.iter().map(|p| p.id).collect::<Vec<_>>() != seats
            || game.starting_life.len() != n
            || game.life.len() != n
            || game.damage.len() != n
            || game.damage.iter().any(|r| r.len() != n)
            || game.events.is_empty()
            || game.events[0].kind != MatchLifeEventKind::Start
            || (index + 1 < history.games.len() && game.outcome.is_none())
        {
            return false;
        }
        if let Some(MatchLifeOutcome::Winner { winner }) = &game.outcome
            && !seats.contains(winner)
        {
            return false;
        }
        let mut life: Vec<i64> = game.starting_life.iter().map(|v| i64::from(*v)).collect();
        let mut damage = vec![vec![0i64; n]; n];
        let mut corrected = HashSet::new();
        let mut prior: HashMap<Uuid, &MatchLifeEvent> = HashMap::new();
        let mut classified_ids = HashSet::new();
        for (position, event) in game.events.iter().enumerate() {
            if !event_ids.insert(event.id) {
                return false;
            }
            let player = event
                .player
                .and_then(|id| seats.iter().position(|p| *p == id));
            let commander = event
                .commander
                .and_then(|id| seats.iter().position(|p| *p == id));
            if event.player.is_some() && player.is_none()
                || event.commander.is_some() && commander.is_none()
            {
                return false;
            }
            if event.kind != MatchLifeEventKind::Correction && event.corrects.is_some()
                || event.kind != MatchLifeEventKind::Reclassify && event.reclassifies.is_some()
            {
                return false;
            }
            let amount = i64::from(event.amount.unwrap_or(0));
            let change = i64::from(event.damage_amount.unwrap_or(0));
            match event.kind {
                MatchLifeEventKind::Start => {
                    if position != 0
                        || event.player.is_some()
                        || event.commander.is_some()
                        || amount != 0
                        || change != 0
                    {
                        return false;
                    }
                }
                MatchLifeEventKind::End => {
                    if position + 1 != game.events.len()
                        || game.outcome.is_none()
                        || event.player.is_some()
                        || event.commander.is_some()
                        || amount != 0
                        || change != 0
                    {
                        return false;
                    }
                }
                MatchLifeEventKind::Life => {
                    if player.is_none() || commander.is_some() || change != 0 || amount == 0 {
                        return false;
                    }
                }
                MatchLifeEventKind::Commander => {
                    if player.is_none() || commander.is_none() || amount != -change || change == 0 {
                        return false;
                    }
                }
                MatchLifeEventKind::Reclassify => {
                    let Some(refs) = event.reclassifies.as_ref() else {
                        return false;
                    };
                    if player.is_none()
                        || commander.is_none()
                        || amount != 0
                        || change <= 0
                        || refs.is_empty()
                        || refs.iter().collect::<HashSet<_>>().len() != refs.len()
                    {
                        return false;
                    }
                    let mut classified = 0i64;
                    for id in refs {
                        let Some(source) = prior.get(id) else {
                            return false;
                        };
                        if source.kind != MatchLifeEventKind::Life
                            || source.player != event.player
                            || source.amount.unwrap_or(0) >= 0
                            || !classified_ids.insert(*id)
                        {
                            return false;
                        }
                        classified -= i64::from(source.amount.unwrap_or(0));
                    }
                    if classified != change {
                        return false;
                    }
                }
                MatchLifeEventKind::Correction => {
                    let Some(id) = event.corrects else {
                        return false;
                    };
                    let Some(source) = prior.get(&id) else {
                        return false;
                    };
                    if player.is_none()
                        || source.player != event.player
                        || !corrected.insert(id)
                        || matches!(
                            source.kind,
                            MatchLifeEventKind::Start
                                | MatchLifeEventKind::End
                                | MatchLifeEventKind::Correction
                        )
                        || amount != -i64::from(source.amount.unwrap_or(0))
                    {
                        return false;
                    }
                }
            }
            prior.insert(event.id, event);
            if let Some(p) = player {
                life[p] += amount;
                if let Some(c) = commander {
                    damage[p][c] += change;
                    if damage[p][c] < 0 {
                        return false;
                    }
                }
            }
        }
        if game.outcome.is_some()
            != (game.events.last().map(|e| e.kind) == Some(MatchLifeEventKind::End))
            || game.life.iter().map(|v| i64::from(*v)).collect::<Vec<_>>() != life
            || game
                .damage
                .iter()
                .map(|r| r.iter().map(|v| i64::from(*v)).collect::<Vec<_>>())
                .collect::<Vec<_>>()
                != damage
        {
            return false;
        }
    }
    if let Some(old) = previous {
        if old.games.len() > history.games.len() {
            return false;
        }
        for (index, original) in old.games.iter().enumerate() {
            let next = &history.games[index];
            if original.outcome.is_some() {
                if original != next {
                    return false;
                }
            } else if original.players != next.players
                || original.starting_life != next.starting_life
                || !next.events.starts_with(&original.events)
            {
                return false;
            }
        }
    }
    true
}
