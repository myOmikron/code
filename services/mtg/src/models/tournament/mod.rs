//! Tournaments: events with organizers, a roster and rounds

use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use service_bootstrap::utils::rorm::truncate_string;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::share::generate_share_token;
use crate::models::tournament::db::TournamentAuditInsertPatch;
use crate::models::tournament::db::TournamentAuditModel;
use crate::models::tournament::db::TournamentInsertPatch;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentOrganizerInsertPatch;
use crate::models::tournament::db::TournamentOrganizerModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::visibility::Visibility;
use crate::tournament::code::generate_join_code;

pub(in crate::models) mod db;
pub mod decklist;
pub mod extractor;
pub mod listing;
pub mod pairing;
pub mod participant;
pub mod public;
pub mod reporting;
pub mod round;
pub mod standings;
pub mod venue;

/// How long a fresh join code lives when the tournament names no start time
const DEFAULT_JOIN_CODE_LIFETIME: Duration = Duration::days(7);

/// How long a join code outlives the tournament's announced start
const JOIN_CODE_GRACE_AFTER_START: Duration = Duration::hours(12);

/// How many times [`Tournament::rotate_join_code`] retries a colliding code
const JOIN_CODE_MINT_ATTEMPTS: u32 = 5;

/// When a join code minted or refreshed now should expire
fn join_code_expiry(starts_at: Option<OffsetDateTime>) -> OffsetDateTime {
    match starts_at {
        Some(starts_at) => starts_at + JOIN_CODE_GRACE_AFTER_START,
        None => OffsetDateTime::now_utc() + DEFAULT_JOIN_CODE_LIFETIME,
    }
}

/// Roll a join code no other tournament currently holds
async fn mint_join_code(tx: &mut Transaction) -> Result<MaxStr<8>, rorm::Error> {
    let mut code = generate_join_code();
    for _ in 0..JOIN_CODE_MINT_ATTEMPTS {
        // Probe rather than catch the unique violation: Postgres aborts the transaction on one.
        let taken = rorm::query(&mut *tx, TournamentModel.uuid)
            .condition(TournamentModel.join_code.equals(Some(&code)))
            .optional()
            .await?
            .is_some();
        if !taken {
            break;
        }
        code = generate_join_code();
    }
    Ok(code)
}

/// Where a tournament stands in its lifecycle
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum TournamentStatus {
    /// Open for registration and joining by code; the initial status
    Registration,
    /// Under way
    Running,
    /// Over; standings are frozen
    Finished,
    /// Called off before it finished
    Cancelled,
}
custom_db_enum! {
    enum: TournamentStatus,
    variants: [Registration, Running, Finished, Cancelled],
    decoder: TournamentStatusDecoder,
}

impl TournamentStatus {
    /// Whether the event may move from this status to `to`
    pub fn may_transition(self, to: Self) -> bool {
        use TournamentStatus::*;
        matches!(
            (self, to),
            (Registration, Running) | (Running, Finished) | (Registration | Running, Cancelled)
        )
    }
}

/// How the next round's tables are put together
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum PairingSystem {
    /// Standard Swiss pairing by running score
    Swiss,
    /// The organizer sets every table by hand
    Manual,
}
custom_db_enum! {
    enum: PairingSystem,
    variants: [Swiss, Manual],
    decoder: PairingSystemDecoder,
}

/// What a round is for; only Swiss rounds are numbered and scored
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum RoundKind {
    /// A scored round of matches
    Swiss,
    /// Players sit in pods and draft; no results
    Draft,
    /// Everybody builds alone against one clock; no pairings at all
    Deckbuilding,
}
custom_db_enum! {
    enum: RoundKind,
    variants: [Swiss, Draft, Deckbuilding],
    decoder: RoundKindDecoder,
}

/// Where a round stands
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum RoundStatus {
    /// Paired, not yet handed to the room
    Pairing,
    /// Being played
    Running,
    /// Every table reported, or the organizer closed it anyway
    Complete,
}
custom_db_enum! {
    enum: RoundStatus,
    variants: [Pairing, Running, Complete],
    decoder: RoundStatusDecoder,
}

/// How far a table's result has got; derived from the report rows on every write
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum MatchStatus {
    /// Nobody has said anything
    Unreported,
    /// Somebody reported; not enough agreement yet
    Pending,
    /// Agreed, or ruled on by the desk
    Confirmed,
    /// Two seats disagree; the desk has to rule
    Disputed,
}
custom_db_enum! {
    enum: MatchStatus,
    variants: [Unreported, Pending, Confirmed, Disputed],
    decoder: MatchStatusDecoder,
}

/// Where a participant stands in the event
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ParticipantStatus {
    /// Signed up, not yet checked in
    Registered,
    /// Confirmed present
    CheckedIn,
    /// Left of their own accord
    Dropped,
    /// Removed by the organizer for a rules violation
    Disqualified,
}
custom_db_enum! {
    enum: ParticipantStatus,
    variants: [Registered, CheckedIn, Dropped, Disqualified],
    decoder: ParticipantStatusDecoder,
}

/// What an organizer row may do, short of what the owner alone may do
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum OrganizerRole {
    /// Everything the owner may do except hand the event to somebody else
    CoOrganizer,
    /// Runs the roster and results, not settings or the staff list
    Scorekeeper,
}
custom_db_enum! {
    enum: OrganizerRole,
    variants: [CoOrganizer, Scorekeeper],
    decoder: OrganizerRoleDecoder,
}

/// How a tournament requires its players to hand in a decklist; editable at any time
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum DecklistPolicy {
    /// A decklist is welcome but a player may register, check in and play without one
    Optional,
    /// Registration without a decklist is fine, but check-in is refused until one is on file
    RequiredToCheckIn,
    /// A player may not complete registration at all without a decklist
    RequiredToRegister,
}
custom_db_enum! {
    enum: DecklistPolicy,
    variants: [Optional, RequiredToCheckIn, RequiredToRegister],
    decoder: DecklistPolicyDecoder,
}

/// Who may see a tournament's roster; staff always see it in full
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ParticipantAudience {
    /// Only staff see the roster; a participant sees just their own row
    Organizers,
    /// Staff and every participant see the whole roster
    Participants,
    /// Everyone who may see the event sees the roster; guest names per `guest_names_public`
    Anyone,
}
custom_db_enum! {
    enum: ParticipantAudience,
    variants: [Organizers, Participants, Anyone],
    decoder: ParticipantAudienceDecoder,
}

/// What happened, as recorded in a tournament's audit log; stored by variant name
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum AuditAction {
    /// The tournament was created
    TournamentCreated,
    /// Editable settings changed
    SettingsChanged,
    /// The lifecycle status changed
    StatusChanged,
    /// Visibility changed
    VisibilityChanged,
    /// A fresh join code was minted
    JoinCodeRotated,
    /// The join code was withdrawn
    JoinCodeRevoked,
    /// An organizer was added
    OrganizerAdded,
    /// An organizer was removed
    OrganizerRemoved,
    /// A participant was registered
    ParticipantAdded,
    /// A participant's editable fields changed
    ParticipantUpdated,
    /// A participant checked in
    ParticipantCheckedIn,
    /// A participant dropped
    ParticipantDropped,
    /// A participant was disqualified
    ParticipantDisqualified,
    /// A guest row was claimed by an account
    ParticipantClaimed,
    /// A guest's claim token was shown to staff, e.g. rendered as a QR code
    ClaimTokenIssued,
    /// A guest session re-attached to its row using a still-live claim token
    ParticipantReattached,
    /// A participant was removed outright
    ParticipantRemoved,
    /// A participant's decklist was written or cleared
    DecklistChanged,
    /// Every decklist in the tournament was locked
    DecklistsLocked,
    /// Every decklist in the tournament was unlocked
    DecklistsUnlocked,
    /// A round was paired
    RoundPaired,
    /// A round's pairings were thrown away and rebuilt
    RoundRepaired,
    /// A round was handed to the room
    RoundStarted,
    /// A round was closed
    RoundCompleted,
    /// A round was deleted before it was played
    RoundDeleted,
    /// A round's clock was started, paused, adjusted or reset
    RoundTimerChanged,
    /// The desk wrote a table's result itself
    MatchResultOverridden,
    /// The desk took a result back off a table
    MatchResultCleared,
    /// A table was renumbered
    MatchTableChanged,
    /// Two players changed places
    SeatsSwapped,
    /// A player's fixed table was set or cleared
    ParticipantFixedTableChanged,
}
custom_db_enum! {
    enum: AuditAction,
    variants: [
        TournamentCreated, SettingsChanged, StatusChanged, VisibilityChanged,
        JoinCodeRotated, JoinCodeRevoked, OrganizerAdded, OrganizerRemoved,
        ParticipantAdded, ParticipantUpdated, ParticipantCheckedIn,
        ParticipantDropped, ParticipantDisqualified, ParticipantClaimed,
        ClaimTokenIssued, ParticipantReattached,
        ParticipantRemoved, DecklistChanged, DecklistsLocked, DecklistsUnlocked,
        RoundPaired, RoundRepaired, RoundStarted, RoundCompleted, RoundDeleted,
        RoundTimerChanged, MatchResultOverridden, MatchResultCleared,
        MatchTableChanged, SeatsSwapped, ParticipantFixedTableChanged,
    ],
    decoder: AuditActionDecoder,
}

/// Wrapper for the primary key of the [`Tournament`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct TournamentUuid(Uuid);

impl TournamentUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `TournamentUuid` from a `ForeignModel<TournamentModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<TournamentModel>) -> Self {
        Self(field.0)
    }

    /// Wrap a uuid read back from a hand-written query
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// Wrapper for the primary key of the [`round::Round`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct TournamentRoundUuid(Uuid);

impl TournamentRoundUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Wrapper for the primary key of the [`round::RoundMatch`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct TournamentMatchUuid(Uuid);

impl TournamentMatchUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Wrapper for the primary key of the [`participant::TournamentParticipant`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct TournamentParticipantUuid(Uuid);

impl TournamentParticipantUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `TournamentParticipantUuid` from a `ForeignModel<TournamentParticipantModel>`
    pub(in crate::models) fn new_from_field(
        field: ForeignModel<TournamentParticipantModel>,
    ) -> Self {
        Self(field.0)
    }

    /// Wrap a uuid read back from a hand-written query
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// Wrapper for the primary key of the [`venue::Venue`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct TournamentVenueUuid(Uuid);

impl TournamentVenueUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Wrap a uuid read back from a hand-written query
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// Outcome of a role-gated operation; missing and forbidden both read as [`Self::Denied`]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TournamentAccess<T = ()> {
    /// The actor holds the required role; carries whatever the operation produced
    Granted(T),
    /// The tournament is gone, or this actor holds no role on it
    Denied,
}

impl<T> TournamentAccess<T> {
    /// Whether the operation was allowed
    pub fn is_granted(&self) -> bool {
        matches!(self, Self::Granted(_))
    }

    /// The operation's result, or `None` when it was denied
    pub fn granted(self) -> Option<T> {
        match self {
            Self::Granted(value) => Some(value),
            Self::Denied => None,
        }
    }
}

/// What an account may do on a tournament
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TournamentRole {
    /// Created the event; the only role that may hand out other roles or delete it
    Owner,
    /// Was added as staff, with the given [`OrganizerRole`]
    Organizer(OrganizerRole),
}

impl TournamentRole {
    /// Whether this role may change settings, status, visibility, the join code or staff
    pub fn may_manage(self) -> bool {
        !matches!(self, Self::Organizer(OrganizerRole::Scorekeeper))
    }
}

/// Who is acting: a logged-in account, or a guest holding participant rows in their session
#[derive(Debug, Clone)]
pub enum TournamentActor {
    /// A logged-in account
    Account(Account),
    /// A guest, identified by the participant rows their session holds
    Guest(Vec<TournamentParticipantUuid>),
}

/// A tournament: an event with a roster and rounds
#[derive(Debug, Clone)]
pub struct Tournament {
    /// Primary key
    pub uuid: TournamentUuid,
    /// The account that created the event
    pub owner: AccountUuid,
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// Optional description: what is played, what it costs, what there is to win
    pub description: Option<MaxStr<1024>>,
    /// The format being played
    pub format: MaxStr<32>,
    /// How many players sit at one table
    pub pod_size: i16,
    /// Best-of how many games a 1v1 match is
    pub games_per_match: i16,
    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,
    /// Where the event stands in its lifecycle
    pub status: TournamentStatus,
    /// Match points for a win
    pub points_win: i16,
    /// Match points for a draw
    pub points_draw: i16,
    /// Match points for a loss
    pub points_loss: i16,
    /// Match points for a bye
    pub points_bye: i16,
    /// Default round length in minutes
    pub round_minutes: i16,

    /// How many players fit, `None` for an event that never turns anyone away
    pub max_participants: Option<i16>,
    /// How many scoring rounds the event means to play, `None` while undecided
    pub planned_rounds: Option<i16>,
    /// Whether players may still register after the event started
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    pub late_entry_as_losses: bool,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// When decklists were locked tournament-wide, `None` while players may edit them
    pub decklists_locked_at: Option<OffsetDateTime>,
    /// Who may see this tournament's roster at all
    pub participant_audience: ParticipantAudience,
    /// Whether a guest's real name is shown to readers who are neither staff nor participants
    pub guest_names_public: bool,
    /// Who may see the event at all
    pub visibility: Visibility,
    /// Secret of the share link, `None` once the link is revoked
    pub share_token: Option<MaxStr<64>>,
    /// The short code players join by, `None` while none is handed out
    pub join_code: Option<MaxStr<8>>,
    /// When the join code stops resolving
    pub join_code_expires_at: Option<OffsetDateTime>,
    /// Where the event takes place, in the organizer's words
    pub venue: Option<MaxStr<255>>,
    /// The venue's address, meaningful only alongside [`Self::venue`]
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in, meaningful only alongside [`Self::venue`]
    pub venue_instructions: Option<MaxStr<1024>>,
    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,
    /// When the event finished and its standings were frozen
    pub finished_at: Option<OffsetDateTime>,
    /// The point in time the tournament was created
    pub created_at: OffsetDateTime,
}

/// A [`Tournament`] together with what the viewer who asked for it may do with it
pub struct TournamentWithViewer {
    /// The tournament itself
    pub tournament: Tournament,
    /// The viewer's role, `None` for a participant or an outside viewer
    pub role: Option<TournamentRole>,
    /// The viewer's own participant row, if they have one
    pub participant: Option<TournamentParticipantUuid>,
}

/// One line of the organizer-only staff list, carrying the account's username
#[derive(Debug, Clone)]
pub struct TournamentOrganizer {
    /// The helping account
    pub account: AccountUuid,
    /// The account's username, for the people running the event to recognise it by
    pub username: MaxStr<32>,
    /// What the helper may do
    pub role: OrganizerRole,
    /// The point in time the helper was added
    pub created_at: OffsetDateTime,
}

/// One organizer-visible line in a tournament's history
#[derive(Debug, Clone)]
pub struct TournamentAuditEntry {
    /// Primary key
    pub uuid: Uuid,
    /// What happened
    pub action: AuditAction,
    /// Who did it, by username; `None` for the system or a deleted account
    pub actor: Option<MaxStr<32>>,
    /// What it happened to
    pub subject: Option<Uuid>,
    /// A short rendered account of the change
    pub detail: Option<MaxStr<1024>>,
    /// The point in time the entry was written
    pub created_at: OffsetDateTime,
}

/// What it takes to create a [`Tournament`]
#[derive(Debug, Clone)]
pub struct TournamentInsert {
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The format being played
    pub format: MaxStr<32>,
    /// How many players sit at one table
    pub pod_size: i16,
    /// Best-of how many games a 1v1 match is
    pub games_per_match: i16,
    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,
    /// Match points for a win
    pub points_win: i16,
    /// Match points for a draw
    pub points_draw: i16,
    /// Match points for a loss
    pub points_loss: i16,
    /// Match points for a bye
    pub points_bye: i16,
    /// Default round length in minutes
    pub round_minutes: i16,

    /// How many players fit, `None` for an event that never turns anyone away
    pub max_participants: Option<i16>,
    /// How many scoring rounds the event means to play, `None` while undecided
    pub planned_rounds: Option<i16>,
    /// Whether players may still register after the event started
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    pub late_entry_as_losses: bool,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// Who may see this tournament's roster at all
    pub participant_audience: ParticipantAudience,
    /// Whether a guest's real name is shown to readers who are neither staff nor participants
    pub guest_names_public: bool,
    /// Who may see the event at all
    pub visibility: Visibility,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// The venue's address, meaningful only alongside [`Self::venue`]
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in, meaningful only alongside [`Self::venue`]
    pub venue_instructions: Option<MaxStr<1024>>,
    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,
}

/// What an organizer may change about a [`Tournament`]; visibility has its own setter
#[derive(Debug, Clone)]
pub struct TournamentUpdate {
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// The venue's address, meaningful only alongside [`Self::venue`]
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in, meaningful only alongside [`Self::venue`]
    pub venue_instructions: Option<MaxStr<1024>>,
    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,
    /// Default round length in minutes
    pub round_minutes: i16,

    /// How many players fit, `None` for an event that never turns anyone away
    pub max_participants: Option<i16>,
    /// The format being played
    pub format: MaxStr<32>,
    /// How many players sit at one table
    pub pod_size: i16,
    /// Best-of how many games a 1v1 match is
    pub games_per_match: i16,
    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,
    /// Match points for a win
    pub points_win: i16,
    /// Match points for a draw
    pub points_draw: i16,
    /// Match points for a loss
    pub points_loss: i16,
    /// Match points for a bye
    pub points_bye: i16,
    /// How many scoring rounds the event means to play, `None` while undecided
    pub planned_rounds: Option<i16>,
    /// Whether players may still register after the event started
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    pub late_entry_as_losses: bool,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// Who may see this tournament's roster at all
    pub participant_audience: ParticipantAudience,
    /// Whether a guest's real name is shown to readers who are neither staff nor participants
    pub guest_names_public: bool,
}

/// Outcome of [`Tournament::update_settings`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsChange {
    /// Everything the request asked for was written
    Changed,
    /// The request changed structural fields after registration closed; nothing was written
    Locked,
}

/// Outcome of [`Tournament::set_status`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusChange {
    /// The status was written
    Changed {
        /// How many players were dropped for never checking in (only on the move to Running)
        dropped_awaiting_check_in: u64,
    },
    /// [`TournamentStatus::may_transition`] refused the move; nothing changed
    InvalidTransition,
}

/// Outcome of [`Tournament::add_organizer`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrganizerChange {
    /// The organizer row was written
    Changed,
    /// No account has that username
    UnknownAccount,
    /// That account already holds an organizer row on this tournament
    AlreadyOrganizer,
    /// That account is the tournament's owner, who needs no organizer row
    IsOwner,
}

impl Tournament {
    /// The only raw fetch; every public accessor goes through a role or visibility guard
    #[instrument(name = "Tournament::fetch", skip(tx))]
    pub(in crate::models::tournament) async fn fetch(
        tx: &mut Transaction,
        uuid: TournamentUuid,
    ) -> Result<Option<TournamentModel>, rorm::Error> {
        rorm::query(&mut *tx, TournamentModel)
            .condition(TournamentModel.uuid.equals(uuid.0))
            .optional()
            .await
    }

    /// What role, if any, `account` holds on `tournament`
    #[instrument(name = "Tournament::role_of", skip(tx))]
    pub async fn role_of(
        tx: &mut Transaction,
        tournament: TournamentUuid,
        account: AccountUuid,
    ) -> Result<Option<TournamentRole>, rorm::Error> {
        let is_owner = rorm::query(&mut *tx, TournamentModel.uuid)
            .condition(owned_by(tournament, account))
            .optional()
            .await?
            .is_some();
        if is_owner {
            return Ok(Some(TournamentRole::Owner));
        }

        let organizer = rorm::query(&mut *tx, TournamentOrganizerModel.role)
            .condition(rorm::and![
                TournamentOrganizerModel.tournament.equals(tournament.0),
                TournamentOrganizerModel
                    .account
                    .equals(account.into_inner()),
            ])
            .optional()
            .await?;
        Ok(organizer.map(TournamentRole::Organizer))
    }

    /// The guard every management handler starts with
    #[instrument(name = "Tournament::get_as_organizer", skip(tx))]
    pub async fn get_as_organizer(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
    ) -> Result<TournamentAccess<(TournamentRole, Tournament)>, rorm::Error> {
        let Some(role) = Self::role_of(&mut *tx, uuid, account).await? else {
            return Ok(TournamentAccess::Denied);
        };
        let Some(model) = Self::fetch(&mut *tx, uuid).await? else {
            return Ok(TournamentAccess::Denied);
        };
        Ok(TournamentAccess::Granted((role, Tournament::from(model))))
    }

    /// The read for an actor: role holders and participants always, others only while public
    #[instrument(name = "Tournament::get_for_viewer", skip(tx))]
    pub async fn get_for_viewer(
        tx: &mut Transaction,
        actor: &TournamentActor,
        uuid: TournamentUuid,
    ) -> Result<Option<TournamentWithViewer>, rorm::Error> {
        let Some(model) = Self::fetch(&mut *tx, uuid).await? else {
            return Ok(None);
        };
        let tournament = Tournament::from(model);

        let (role, participant) = match actor {
            TournamentActor::Account(account) => {
                let role = Self::role_of(&mut *tx, uuid, account.uuid).await?;
                let participant = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                    .condition(rorm::and![
                        TournamentParticipantModel.tournament.equals(uuid.0),
                        TournamentParticipantModel
                            .account
                            .equals(Some(account.uuid.into_inner())),
                    ])
                    .optional()
                    .await?
                    .map(TournamentParticipantUuid::from_uuid);
                (role, participant)
            }
            TournamentActor::Guest(participants) => {
                if participants.is_empty() {
                    (None, None)
                } else {
                    let matches = participants
                        .iter()
                        .map(|participant| {
                            TournamentParticipantModel
                                .uuid
                                .equals(participant.into_inner())
                                .boxed()
                        })
                        .collect();
                    let participant = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                        .condition(rorm::and![
                            TournamentParticipantModel.tournament.equals(uuid.0),
                            DynamicCollection::or_unchecked(matches),
                        ])
                        .optional()
                        .await?
                        .map(TournamentParticipantUuid::from_uuid);
                    (None, participant)
                }
            }
        };

        if role.is_some() || participant.is_some() || tournament.visibility == Visibility::Public {
            Ok(Some(TournamentWithViewer {
                tournament,
                role,
                participant,
            }))
        } else {
            Ok(None)
        }
    }

    /// Create a new tournament owned by `owner`, with a join code already minted
    #[instrument(name = "Tournament::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        insert: TournamentInsert,
    ) -> Result<Tournament, rorm::Error> {
        let share_token = match insert.visibility {
            Visibility::Unlisted => Some(generate_share_token()),
            Visibility::Private | Visibility::Public => None,
        };

        let join_code = mint_join_code(&mut *tx).await?;

        let model = rorm::insert(&mut *tx, TournamentModel)
            .single(&TournamentInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                name: insert.name,
                description: insert.description,
                format: insert.format,
                pod_size: insert.pod_size,
                games_per_match: insert.games_per_match,
                pairing_system: insert.pairing_system,
                status: TournamentStatus::Registration,
                points_win: insert.points_win,
                points_draw: insert.points_draw,
                points_loss: insert.points_loss,
                points_bye: insert.points_bye,
                round_minutes: insert.round_minutes,
                max_participants: insert.max_participants,
                planned_rounds: insert.planned_rounds,
                allow_late_entry: insert.allow_late_entry,
                late_entry_as_losses: insert.late_entry_as_losses,
                decklist_policy: insert.decklist_policy,
                participant_audience: insert.participant_audience,
                guest_names_public: insert.guest_names_public,
                visibility: insert.visibility,
                share_token,
                join_code: Some(join_code),
                join_code_expires_at: Some(join_code_expiry(insert.starts_at)),
                venue: insert.venue,
                venue_address: insert.venue_address,
                venue_instructions: insert.venue_instructions,
                starts_at: insert.starts_at,
            })
            .await?;
        let tournament = Tournament::from(model);

        Self::audit(
            &mut *tx,
            tournament.uuid,
            Some(owner),
            AuditAction::TournamentCreated,
            None,
            None,
        )
        .await?;

        Ok(tournament)
    }

    /// Update a tournament's settings; structural fields are locked once registration closes
    #[instrument(name = "Tournament::update_settings", skip(tx))]
    pub async fn update_settings(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
        update: TournamentUpdate,
    ) -> Result<TournamentAccess<SettingsChange>, rorm::Error> {
        let Some((role, tournament)) = Self::get_as_organizer(&mut *tx, account, uuid)
            .await?
            .granted()
        else {
            return Ok(TournamentAccess::Denied);
        };
        if !role.may_manage() {
            return Ok(TournamentAccess::Denied);
        }

        let unlocked = matches!(tournament.status, TournamentStatus::Registration);
        // Postponing the event must move the code's expiry too, or it dies before the doors open.
        let moves_start =
            update.starts_at != tournament.starts_at && tournament.join_code.is_some();
        let changes_structure = update.format != tournament.format
            || update.pod_size != tournament.pod_size
            || update.games_per_match != tournament.games_per_match
            || update.pairing_system != tournament.pairing_system
            || update.points_win != tournament.points_win
            || update.points_draw != tournament.points_draw
            || update.points_loss != tournament.points_loss
            || update.points_bye != tournament.points_bye
            || update.allow_late_entry != tournament.allow_late_entry
            || update.late_entry_as_losses != tournament.late_entry_as_losses;
        if !unlocked && changes_structure {
            return Ok(TournamentAccess::Granted(SettingsChange::Locked));
        }

        let builder = rorm::update(&mut *tx, TournamentModel)
            .begin_dyn_set()
            .set_if(TournamentModel.name, Some(update.name))
            .set_if(TournamentModel.description, Some(update.description))
            .set_if(TournamentModel.venue, Some(update.venue))
            .set_if(TournamentModel.venue_address, Some(update.venue_address))
            .set_if(
                TournamentModel.venue_instructions,
                Some(update.venue_instructions),
            )
            .set_if(TournamentModel.starts_at, Some(update.starts_at))
            .set_if(
                TournamentModel.join_code_expires_at,
                moves_start.then(|| Some(join_code_expiry(update.starts_at))),
            )
            .set_if(TournamentModel.round_minutes, Some(update.round_minutes))
            .set_if(TournamentModel.planned_rounds, Some(update.planned_rounds))
            .set_if(
                TournamentModel.max_participants,
                Some(update.max_participants),
            )
            .set_if(
                TournamentModel.decklist_policy,
                Some(update.decklist_policy),
            )
            .set_if(
                TournamentModel.participant_audience,
                Some(update.participant_audience),
            )
            .set_if(
                TournamentModel.guest_names_public,
                Some(update.guest_names_public),
            )
            .set_if(TournamentModel.format, unlocked.then_some(update.format))
            .set_if(
                TournamentModel.pod_size,
                unlocked.then_some(update.pod_size),
            )
            .set_if(
                TournamentModel.games_per_match,
                unlocked.then_some(update.games_per_match),
            )
            .set_if(
                TournamentModel.pairing_system,
                unlocked.then_some(update.pairing_system),
            )
            .set_if(
                TournamentModel.points_win,
                unlocked.then_some(update.points_win),
            )
            .set_if(
                TournamentModel.points_draw,
                unlocked.then_some(update.points_draw),
            )
            .set_if(
                TournamentModel.points_loss,
                unlocked.then_some(update.points_loss),
            )
            .set_if(
                TournamentModel.points_bye,
                unlocked.then_some(update.points_bye),
            )
            .set_if(
                TournamentModel.allow_late_entry,
                unlocked.then_some(update.allow_late_entry),
            )
            .set_if(
                TournamentModel.late_entry_as_losses,
                unlocked.then_some(update.late_entry_as_losses),
            );

        let Ok(builder) = builder.finish_dyn_set() else {
            unreachable!("the always-editable fields are set unconditionally above")
        };
        builder
            .condition(TournamentModel.uuid.equals(uuid.0))
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::SettingsChanged,
            None,
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(SettingsChange::Changed))
    }

    /// Move a tournament to a new lifecycle status; terminal statuses clear the join code
    #[instrument(name = "Tournament::set_status", skip(tx))]
    pub async fn set_status(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
        status: TournamentStatus,
    ) -> Result<TournamentAccess<StatusChange>, rorm::Error> {
        let Some((role, tournament)) = Self::get_as_organizer(&mut *tx, account, uuid)
            .await?
            .granted()
        else {
            return Ok(TournamentAccess::Denied);
        };
        if !role.may_manage() {
            return Ok(TournamentAccess::Denied);
        }

        if !tournament.status.may_transition(status) {
            return Ok(TournamentAccess::Granted(StatusChange::InvalidTransition));
        }

        // Starting drops everyone not checked in, so no table is paired with an empty chair.
        let dropped_awaiting_check_in = if matches!(status, TournamentStatus::Running) {
            drop_awaiting_check_in(&mut *tx, account, uuid).await?
        } else {
            0
        };

        let enters_finished = matches!(status, TournamentStatus::Finished);
        let clears_join_code = matches!(
            status,
            TournamentStatus::Finished | TournamentStatus::Cancelled
        );
        // A tournament drafted weeks ahead carries a code minted at creation,
        // which may well have run out before anyone could use it. Opening
        // registration is the moment that code starts mattering, so its expiry
        // is recomputed from the start time the event has by now. The code
        // itself is untouched: an organizer may already have printed it.
        let expires_at = if clears_join_code {
            Some(None)
        } else if matches!(status, TournamentStatus::Registration) && tournament.join_code.is_some()
        {
            Some(Some(join_code_expiry(tournament.starts_at)))
        } else {
            None
        };

        let builder = rorm::update(&mut *tx, TournamentModel)
            .begin_dyn_set()
            .set_if(TournamentModel.status, Some(status))
            .set_if(
                TournamentModel.finished_at,
                enters_finished.then_some(Some(OffsetDateTime::now_utc())),
            )
            .set_if(
                TournamentModel.join_code,
                clears_join_code.then_some(None::<MaxStr<8>>),
            )
            .set_if(TournamentModel.join_code_expires_at, expires_at);

        let Ok(builder) = builder.finish_dyn_set() else {
            unreachable!("the status itself is always set above")
        };
        builder
            .condition(TournamentModel.uuid.equals(uuid.0))
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::StatusChanged,
            None,
            Some(format!("{status:?}")),
        )
        .await?;

        Ok(TournamentAccess::Granted(StatusChange::Changed {
            dropped_awaiting_check_in,
        }))
    }

    /// Set a tournament's visibility; only [`Visibility::Unlisted`] keeps a share token
    #[instrument(name = "Tournament::set_visibility", skip(tx))]
    pub async fn set_visibility(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
        visibility: Visibility,
    ) -> Result<TournamentAccess<Option<MaxStr<64>>>, rorm::Error> {
        let Some((role, _)) = Self::get_as_organizer(&mut *tx, account, uuid)
            .await?
            .granted()
        else {
            return Ok(TournamentAccess::Denied);
        };
        if !role.may_manage() {
            return Ok(TournamentAccess::Denied);
        }

        let share_token = match visibility {
            Visibility::Unlisted => Some(generate_share_token()),
            Visibility::Private | Visibility::Public => None,
        };

        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.visibility, visibility)
            .set(TournamentModel.share_token, share_token.clone())
            .condition(TournamentModel.uuid.equals(uuid.0))
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::VisibilityChanged,
            None,
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(share_token))
    }

    /// Whether decklists are currently locked tournament-wide
    pub fn decklists_locked(&self) -> bool {
        self.decklists_locked_at.is_some()
    }

    /// Whether a decklist is required to complete registration
    pub fn needs_decklist_to_register(&self) -> bool {
        self.decklist_policy == DecklistPolicy::RequiredToRegister
    }

    /// Lock every decklist so only staff may write them; re-locking refreshes the timestamp
    #[instrument(name = "Tournament::lock_decklists", skip(tx))]
    pub async fn lock_decklists(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
    ) -> Result<TournamentAccess<()>, rorm::Error> {
        let Some((role, _)) = Self::get_as_organizer(&mut *tx, account, uuid)
            .await?
            .granted()
        else {
            return Ok(TournamentAccess::Denied);
        };
        if !role.may_manage() {
            return Ok(TournamentAccess::Denied);
        }

        rorm::update(&mut *tx, TournamentModel)
            .set(
                TournamentModel.decklists_locked_at,
                Some(OffsetDateTime::now_utc()),
            )
            .condition(TournamentModel.uuid.equals(uuid.0))
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::DecklistsLocked,
            None,
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(()))
    }

    /// Unlock every decklist in the tournament, letting players write their own again
    #[instrument(name = "Tournament::unlock_decklists", skip(tx))]
    pub async fn unlock_decklists(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
    ) -> Result<TournamentAccess<()>, rorm::Error> {
        let Some((role, _)) = Self::get_as_organizer(&mut *tx, account, uuid)
            .await?
            .granted()
        else {
            return Ok(TournamentAccess::Denied);
        };
        if !role.may_manage() {
            return Ok(TournamentAccess::Denied);
        }

        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.decklists_locked_at, None)
            .condition(TournamentModel.uuid.equals(uuid.0))
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::DecklistsUnlocked,
            None,
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(()))
    }

    /// Mint a fresh join code, invalidating the previous one
    #[instrument(name = "Tournament::rotate_join_code", skip(tx))]
    pub async fn rotate_join_code(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
    ) -> Result<TournamentAccess<MaxStr<8>>, rorm::Error> {
        let Some((role, tournament)) = Self::get_as_organizer(&mut *tx, account, uuid)
            .await?
            .granted()
        else {
            return Ok(TournamentAccess::Denied);
        };
        if !role.may_manage() {
            return Ok(TournamentAccess::Denied);
        }

        let expires_at = join_code_expiry(tournament.starts_at);
        let code = mint_join_code(&mut *tx).await?;

        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.join_code, Some(code.clone()))
            .set(TournamentModel.join_code_expires_at, Some(expires_at))
            .condition(TournamentModel.uuid.equals(uuid.0))
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::JoinCodeRotated,
            None,
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(code))
    }

    /// Withdraw a tournament's join code without minting a new one
    #[instrument(name = "Tournament::revoke_join_code", skip(tx))]
    pub async fn revoke_join_code(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
    ) -> Result<TournamentAccess<()>, rorm::Error> {
        let Some((role, _)) = Self::get_as_organizer(&mut *tx, account, uuid)
            .await?
            .granted()
        else {
            return Ok(TournamentAccess::Denied);
        };
        if !role.may_manage() {
            return Ok(TournamentAccess::Denied);
        }

        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.join_code, None)
            .set(TournamentModel.join_code_expires_at, None)
            .condition(TournamentModel.uuid.equals(uuid.0))
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::JoinCodeRevoked,
            None,
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(()))
    }

    /// The unauthenticated lookup by join code; the only place join-code liveness is checked
    #[instrument(name = "Tournament::get_by_join_code", skip(tx, code))]
    pub async fn get_by_join_code(
        tx: &mut Transaction,
        code: &MaxStr<8>,
    ) -> Result<Option<Tournament>, rorm::Error> {
        let Some(model) = rorm::query(&mut *tx, TournamentModel)
            .condition(TournamentModel.join_code.equals(Some(code)))
            .optional()
            .await?
        else {
            return Ok(None);
        };
        let tournament = Tournament::from(model);

        let live = matches!(
            tournament.status,
            TournamentStatus::Registration | TournamentStatus::Running
        ) && tournament
            .join_code_expires_at
            .is_some_and(|expires_at| expires_at > OffsetDateTime::now_utc());

        Ok(live.then_some(tournament))
    }

    /// Delete a tournament (owner only); organizers, participants and audit log cascade
    #[instrument(name = "Tournament::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: TournamentUuid,
    ) -> Result<TournamentAccess<()>, rorm::Error> {
        let affected = rorm::delete(&mut *tx, TournamentModel)
            .condition(owned_by(uuid, owner))
            .await?;
        Ok(access(affected, ()))
    }

    /// The staff list, visible to any role holder
    #[instrument(name = "Tournament::list_organizers", skip(tx))]
    pub async fn list_organizers(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
    ) -> Result<TournamentAccess<Vec<TournamentOrganizer>>, rorm::Error> {
        if Self::role_of(&mut *tx, uuid, account).await?.is_none() {
            return Ok(TournamentAccess::Denied);
        }

        let rows = rorm::query(&mut *tx, TournamentOrganizerModel)
            .condition(TournamentOrganizerModel.tournament.equals(uuid.0))
            .order_asc(TournamentOrganizerModel.created_at)
            .all()
            .await?;

        let mut organizers = Vec::with_capacity(rows.len());
        for row in rows {
            let account = AccountUuid::new_from_field(row.account);
            let username = Account::get_by_uuid(&mut *tx, account)
                .await?
                .unwrap_or_else(|| unreachable!("an organizer row cascades away with its account"))
                .username;
            organizers.push(TournamentOrganizer {
                account,
                username: bounded_username(username),
                role: row.role,
                created_at: row.created_at,
            });
        }

        Ok(TournamentAccess::Granted(organizers))
    }

    /// Add an account as staff (owner only)
    #[instrument(name = "Tournament::add_organizer", skip(tx))]
    pub async fn add_organizer(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: TournamentUuid,
        username: &Username,
        role: OrganizerRole,
    ) -> Result<TournamentAccess<OrganizerChange>, rorm::Error> {
        if !Self::owns(&mut *tx, uuid, owner).await? {
            return Ok(TournamentAccess::Denied);
        }

        let Some(target) = Account::get_by_username(&mut *tx, username).await? else {
            return Ok(TournamentAccess::Granted(OrganizerChange::UnknownAccount));
        };
        if target.uuid == owner {
            return Ok(TournamentAccess::Granted(OrganizerChange::IsOwner));
        }

        let already_organizer = rorm::query(&mut *tx, TournamentOrganizerModel.uuid)
            .condition(rorm::and![
                TournamentOrganizerModel.tournament.equals(uuid.0),
                TournamentOrganizerModel
                    .account
                    .equals(target.uuid.into_inner()),
            ])
            .optional()
            .await?
            .is_some();
        if already_organizer {
            return Ok(TournamentAccess::Granted(OrganizerChange::AlreadyOrganizer));
        }

        rorm::insert(&mut *tx, TournamentOrganizerModel)
            .single(&TournamentOrganizerInsertPatch {
                uuid: Uuid::now_v7(),
                tournament: ForeignModelByField(uuid.0),
                account: ForeignModelByField(target.uuid.into_inner()),
                role,
            })
            .await?;

        Self::audit(
            &mut *tx,
            uuid,
            Some(owner),
            AuditAction::OrganizerAdded,
            Some(target.uuid.into_inner()),
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(OrganizerChange::Changed))
    }

    /// Remove an account from staff (owner only)
    #[instrument(name = "Tournament::remove_organizer", skip(tx))]
    pub async fn remove_organizer(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: TournamentUuid,
        account: AccountUuid,
    ) -> Result<TournamentAccess<()>, rorm::Error> {
        if !Self::owns(&mut *tx, uuid, owner).await? {
            return Ok(TournamentAccess::Denied);
        }

        let affected = rorm::delete(&mut *tx, TournamentOrganizerModel)
            .condition(rorm::and![
                TournamentOrganizerModel.tournament.equals(uuid.0),
                TournamentOrganizerModel
                    .account
                    .equals(account.into_inner()),
            ])
            .await?;
        if affected == 0 {
            return Ok(TournamentAccess::Denied);
        }

        Self::audit(
            &mut *tx,
            uuid,
            Some(owner),
            AuditAction::OrganizerRemoved,
            Some(account.into_inner()),
            None,
        )
        .await?;

        Ok(TournamentAccess::Granted(()))
    }

    /// Write one line to a tournament's audit log; `detail` is truncated to 1024 chars
    #[instrument(name = "Tournament::audit", skip(tx, detail))]
    pub(in crate::models::tournament) async fn audit(
        tx: &mut Transaction,
        tournament: TournamentUuid,
        actor: Option<AccountUuid>,
        action: AuditAction,
        subject: Option<Uuid>,
        detail: Option<String>,
    ) -> Result<(), rorm::Error> {
        let detail =
            detail.map(|detail| truncate_string::<1024>(detail, "tournament audit detail"));

        rorm::insert(&mut *tx, TournamentAuditModel)
            .single(&TournamentAuditInsertPatch {
                uuid: Uuid::now_v7(),
                tournament: ForeignModelByField(tournament.0),
                actor_account: actor.map(|account| ForeignModelByField(account.into_inner())),
                action,
                subject,
                detail,
            })
            .await?;
        Ok(())
    }

    /// Read a tournament's audit log, newest first (v7 uuid order breaks same-ms ties)
    #[instrument(name = "Tournament::list_audit", skip(tx))]
    pub async fn list_audit(
        tx: &mut Transaction,
        account: AccountUuid,
        uuid: TournamentUuid,
        limit: u64,
    ) -> Result<TournamentAccess<Vec<TournamentAuditEntry>>, rorm::Error> {
        if Self::role_of(&mut *tx, uuid, account).await?.is_none() {
            return Ok(TournamentAccess::Denied);
        }

        let rows = rorm::query(&mut *tx, TournamentAuditModel)
            .condition(TournamentAuditModel.tournament.equals(uuid.0))
            .order_desc(TournamentAuditModel.uuid)
            .limit(limit)
            .all()
            .await?;

        let mut usernames: HashMap<Uuid, MaxStr<32>> = HashMap::new();
        let mut entries = Vec::with_capacity(rows.len());
        for row in rows {
            let actor = match row.actor_account {
                None => None,
                Some(field) => {
                    let actor_uuid = field.0;
                    let username = match usernames.get(&actor_uuid) {
                        Some(cached) => cached.clone(),
                        None => {
                            let account = Account::get_by_uuid(
                                &mut *tx,
                                AccountUuid::new_from_field(field),
                            )
                            .await?
                            .unwrap_or_else(|| {
                                unreachable!(
                                    "actor_account is nulled, not left dangling, when an account is deleted"
                                )
                            });
                            let username = bounded_username(account.username);
                            usernames.insert(actor_uuid, username.clone());
                            username
                        }
                    };
                    Some(username)
                }
            };

            entries.push(TournamentAuditEntry {
                uuid: row.uuid,
                action: row.action,
                actor,
                subject: row.subject,
                detail: row.detail,
                created_at: row.created_at,
            });
        }

        Ok(TournamentAccess::Granted(entries))
    }

    /// Whether `account` is the tournament's owner
    #[instrument(name = "Tournament::owns", skip(tx))]
    async fn owns(
        tx: &mut Transaction,
        uuid: TournamentUuid,
        account: AccountUuid,
    ) -> Result<bool, rorm::Error> {
        Ok(rorm::query(&mut *tx, TournamentModel.uuid)
            .condition(owned_by(uuid, account))
            .optional()
            .await?
            .is_some())
    }
}

impl From<TournamentModel> for Tournament {
    fn from(value: TournamentModel) -> Self {
        Self {
            uuid: TournamentUuid(value.uuid),
            owner: AccountUuid::new_from_field(value.owner),
            name: value.name,
            description: value.description,
            format: value.format,
            pod_size: value.pod_size,
            games_per_match: value.games_per_match,
            pairing_system: value.pairing_system,
            status: value.status,
            points_win: value.points_win,
            points_draw: value.points_draw,
            points_loss: value.points_loss,
            points_bye: value.points_bye,
            round_minutes: value.round_minutes,
            max_participants: value.max_participants,
            planned_rounds: value.planned_rounds,
            allow_late_entry: value.allow_late_entry,
            late_entry_as_losses: value.late_entry_as_losses,
            decklist_policy: value.decklist_policy,
            decklists_locked_at: value.decklists_locked_at,
            participant_audience: value.participant_audience,
            guest_names_public: value.guest_names_public,
            visibility: value.visibility,
            share_token: value.share_token,
            join_code: value.join_code,
            join_code_expires_at: value.join_code_expires_at,
            venue: value.venue,
            venue_address: value.venue_address,
            venue_instructions: value.venue_instructions,
            starts_at: value.starts_at,
            finished_at: value.finished_at,
            created_at: value.created_at,
        }
    }
}

/// Drop everybody still waiting to be checked in, one audit row each; returns the count
#[instrument(name = "drop_awaiting_check_in", skip(tx))]
async fn drop_awaiting_check_in(
    tx: &mut Transaction,
    account: AccountUuid,
    uuid: TournamentUuid,
) -> Result<u64, rorm::Error> {
    let waiting: Vec<Uuid> = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
        .condition(rorm::and![
            TournamentParticipantModel.tournament.equals(uuid.0),
            TournamentParticipantModel
                .status
                .equals(ParticipantStatus::Registered),
        ])
        .all()
        .await?;
    if waiting.is_empty() {
        return Ok(0);
    }

    rorm::update(&mut *tx, TournamentParticipantModel)
        .set(
            TournamentParticipantModel.status,
            ParticipantStatus::Dropped,
        )
        .set(TournamentParticipantModel.dropped_after_round, Some(0))
        .condition(rorm::and![
            TournamentParticipantModel.tournament.equals(uuid.0),
            TournamentParticipantModel
                .status
                .equals(ParticipantStatus::Registered),
        ])
        .await?;

    for participant in &waiting {
        Tournament::audit(
            &mut *tx,
            uuid,
            Some(account),
            AuditAction::ParticipantDropped,
            Some(*participant),
            Some("Never checked in".to_owned()),
        )
        .await?;
    }

    Ok(waiting.len() as u64)
}

/// Turn a statement's affected-row count into a [`TournamentAccess`]
fn access<T>(affected: u64, value: T) -> TournamentAccess<T> {
    if affected > 0 {
        TournamentAccess::Granted(value)
    } else {
        TournamentAccess::Denied
    }
}

/// Condition matching a tournament only when `account` owns it
fn owned_by(uuid: TournamentUuid, account: AccountUuid) -> impl Condition<'static> {
    rorm::and![
        TournamentModel.uuid.equals(uuid.0),
        TournamentModel.owner.equals(account.into_inner()),
    ]
}

/// Converts a stored [`Username`] into the bounded string a listing hands out
fn bounded_username(username: Username) -> MaxStr<32> {
    MaxStr::new(username.as_str().to_owned())
        .unwrap_or_else(|_| unreachable!("Username::MAX_LEN is {}", Username::MAX_LEN))
}

/// Whether a write failed on a unique violation; Postgres aborts the tx, so nothing may follow
pub(in crate::models::tournament) fn is_unique_violation(error: &rorm::Error) -> bool {
    matches!(
        error,
        rorm::Error::SqlxError(sqlx::Error::Database(inner)) if inner.is_unique_violation()
    )
}
