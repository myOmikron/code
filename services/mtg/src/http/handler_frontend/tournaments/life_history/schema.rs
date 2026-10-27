//! HTTP contracts for authorized Match Life history and recording ownership.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::tournament::life_history as domain;
use crate::models::tournament::life_history::MatchLifeHistory;

/// Public durable state; intentionally contains no recording credential.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
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
#[derive(Default, Debug, Clone, Serialize, Deserialize, JsonSchema)]
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

/// Exact retained ownership intent, including its private capability.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "request", rename_all = "lowercase")]
pub enum MatchLifeOwnershipProof {
    /// Original acknowledged claim.
    Claim(ClaimMatchLifeRequest),
    /// Original acknowledged takeover.
    Takeover(ClaimMatchLifeRequest),
}

/// Immutable request preserving all unsent old-device history.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
pub struct CaptureMatchLifeConflictRequest {
    /// Stable exact capture identity.
    pub request_id: Uuid,
    /// Account-bound proof of former recording ownership, never returned publicly.
    pub ownership: MatchLifeOwnershipProof,
    /// Last server revision known before the branch diverged.
    pub base_revision: i64,
    /// Full frozen local branch, including changes newer than an in-flight upload.
    pub history: MatchLifeHistory,
}

/// Recoverable branch metadata, without credentials or the potentially large snapshot.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
pub struct MatchLifeConflictSummary {
    /// Authorized artifact identity.
    pub id: Uuid,
    /// Recording device.
    pub device: Uuid,
    /// Former recording epoch.
    pub generation: i64,
    /// Last known server revision.
    pub base_revision: i64,
    /// Server capture time.
    pub captured_at: SchemaDateTime,
}

/// Complete recovered history, separate from the current timeline and Result.
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
pub struct MatchLifeConflict {
    /// Origin and capture metadata.
    pub summary: MatchLifeConflictSummary,
    /// Complete original branch.
    pub history: MatchLifeHistory,
}

/// Authorized recovered branches of a Match.
#[derive(Serialize, Deserialize, JsonSchema)]
pub struct MatchLifeConflicts {
    /// Metadata, newest capture first.
    pub conflicts: Vec<MatchLifeConflictSummary>,
}

/// Stable acknowledgement of a captured branch.
#[derive(Serialize, Deserialize, JsonSchema)]
pub struct CapturedMatchLifeConflict {
    /// Exact accepted capture request.
    pub accepted_request: Uuid,
    /// Durable artifact identity and origin.
    pub conflict: MatchLifeConflictSummary,
}

impl From<domain::RecordingState> for MatchLifeHistoryResponse {
    fn from(value: domain::RecordingState) -> Self {
        Self {
            history: value.history,
            generation: value.generation,
            revision: value.revision,
            writer: value.writer,
            updated_at: value.updated_at,
            accepted_request: value.accepted_request,
            accepted_revision: value.accepted_revision,
        }
    }
}

impl From<ClaimMatchLifeRequest> for domain::RecordingClaim {
    fn from(value: ClaimMatchLifeRequest) -> Self {
        Self {
            device: value.device,
            writer_token: value.writer_token,
            request_id: value.request_id,
            generation: value.generation,
            expected_revision: value.expected_revision,
        }
    }
}

impl From<SaveMatchLifeRequest> for domain::RecordingUpload {
    fn from(value: SaveMatchLifeRequest) -> Self {
        Self {
            device: value.device,
            writer_token: value.writer_token,
            request_id: value.request_id,
            generation: value.generation,
            expected_revision: value.expected_revision,
            history: value.history,
        }
    }
}

impl From<domain::RecordingRefusal> for MatchLifeErrors {
    fn from(value: domain::RecordingRefusal) -> Self {
        Self {
            writer_conflict: value.writer_conflict,
            revision_conflict: value.revision_conflict,
            request_conflict: value.request_conflict,
            invalid_history: value.invalid_history,
        }
    }
}

impl From<MatchLifeOwnershipProof> for domain::RecordingOwnership {
    fn from(value: MatchLifeOwnershipProof) -> Self {
        match value {
            MatchLifeOwnershipProof::Claim(request) => Self::Claim(request.into()),
            MatchLifeOwnershipProof::Takeover(request) => Self::Takeover(request.into()),
        }
    }
}

impl From<CaptureMatchLifeConflictRequest> for domain::RecoveredBranch {
    fn from(value: CaptureMatchLifeConflictRequest) -> Self {
        Self {
            request_id: value.request_id,
            ownership: value.ownership.into(),
            base_revision: value.base_revision,
            history: value.history,
        }
    }
}

impl From<domain::RecoveredBranchSummary> for MatchLifeConflictSummary {
    fn from(value: domain::RecoveredBranchSummary) -> Self {
        Self {
            id: value.id,
            device: value.device,
            generation: value.generation,
            base_revision: value.base_revision,
            captured_at: value.captured_at,
        }
    }
}

impl From<domain::RecoveredHistory> for MatchLifeConflict {
    fn from(value: domain::RecoveredHistory) -> Self {
        Self {
            summary: value.summary.into(),
            history: value.history,
        }
    }
}

impl From<domain::RecoveredBranches> for MatchLifeConflicts {
    fn from(value: domain::RecoveredBranches) -> Self {
        Self {
            conflicts: value.conflicts.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<domain::CapturedBranch> for CapturedMatchLifeConflict {
    fn from(value: domain::CapturedBranch) -> Self {
        Self {
            accepted_request: value.accepted_request,
            conflict: value.conflict.into(),
        }
    }
}
