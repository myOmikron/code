//! Tournaments: an event with organizers, a roster, and — starting in M2 — rounds
//!
//! Milestone 1 is the roster slice: a tournament exists, has organizers and
//! participants (accounts and guests), and people can join it by a typed
//! short code. No rounds, no pairing, no results yet.
//!
//! # The guard discipline
//!
//! Every other model in this service folds its owner check into the
//! statement it guards (`owned_by` in [`crate::models::deck`] and
//! [`crate::models::watch_list`]): "is this account allowed" is a column on
//! the row itself, so a `WHERE owner = $1` says it in one breath. A
//! tournament cannot do that in general — "is this account an organizer" is a
//! row in [`db::TournamentOrganizerModel`], a different table, and rorm's
//! conditions cannot walk into another table to answer that. So tournaments
//! use an explicit guard query instead ([`Tournament::role_of`],
//! [`Tournament::get_as_organizer`]), and the discipline with teeth is: **there
//! is no `Tournament::get_by_uuid`.** [`Tournament::fetch`] is the only raw
//! read, it is private to this module, and every function that hands out a
//! [`Tournament`] takes an actor or an account and answers a
//! [`TournamentAccess`] or an `Option` instead — a handler that forgets the
//! guard cannot be written, because there is nothing ungated to reach for.
//!
//! The owner column *is* a plain column, though, so the handful of
//! owner-only mutations ([`Tournament::delete`], organizer management) fold
//! it into their statement via `owned_by` exactly like a deck would.

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
pub mod extractor;
pub mod listing;
pub mod participant;

/// How long a freshly minted join code stays live when the tournament names
/// no start time
const DEFAULT_JOIN_CODE_LIFETIME: Duration = Duration::days(7);

/// How long a join code outlives the tournament's announced start
///
/// Long enough that a table running behind schedule does not have its
/// latecomers locked out.
const JOIN_CODE_GRACE_AFTER_START: Duration = Duration::hours(12);

/// How many times [`Tournament::rotate_join_code`] retries a colliding code
const JOIN_CODE_MINT_ATTEMPTS: u32 = 5;

/// Where a tournament stands in its lifecycle
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum TournamentStatus {
    /// Being set up by its organizers; nobody outside the staff can join yet
    Draft,
    /// Open for players to register or join by code
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
    variants: [Draft, Registration, Running, Finished, Cancelled],
    decoder: TournamentStatusDecoder,
}

impl TournamentStatus {
    /// Whether the event may move from this status to `to`
    ///
    /// The lifecycle runs forward through `Draft -> Registration -> Running ->
    /// Finished` one step at a time; [`Self::Cancelled`] is reachable from
    /// any of the three non-terminal statuses, since calling an event off is
    /// never scheduled in advance. Nothing leaves [`Self::Finished`] or
    /// [`Self::Cancelled`] — both are where a tournament's history stops
    /// changing.
    pub fn may_transition(self, to: Self) -> bool {
        use TournamentStatus::*;
        matches!(
            (self, to),
            (Draft, Registration)
                | (Registration, Running)
                | (Running, Finished)
                | (Draft | Registration | Running, Cancelled)
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

/// How the seats at a table are handed out
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum SeatPolicy {
    /// Shuffled
    Random,
    /// Chosen to even out who has already played whom
    Balanced,
    /// The organizer sets every seat by hand
    Organizer,
}
custom_db_enum! {
    enum: SeatPolicy,
    variants: [Random, Balanced, Organizer],
    decoder: SeatPolicyDecoder,
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
    /// Runs the roster and, from M2 on, results — not settings or the staff list
    Scorekeeper,
}
custom_db_enum! {
    enum: OrganizerRole,
    variants: [CoOrganizer, Scorekeeper],
    decoder: OrganizerRoleDecoder,
}

/// What happened, as recorded in a tournament's audit log
///
/// Stored by its variant name, so new variants in M2/M3 need no migration —
/// they are just another string an old client has never seen.
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
    /// A participant was removed outright
    ParticipantRemoved,
}
custom_db_enum! {
    enum: AuditAction,
    variants: [
        TournamentCreated, SettingsChanged, StatusChanged, VisibilityChanged,
        JoinCodeRotated, JoinCodeRevoked, OrganizerAdded, OrganizerRemoved,
        ParticipantAdded, ParticipantUpdated, ParticipantCheckedIn,
        ParticipantDropped, ParticipantDisqualified, ParticipantClaimed,
        ParticipantRemoved,
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

/// Wrapper for the primary key of the [`participant::TournamentParticipant`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct TournamentParticipantUuid(Uuid);

impl TournamentParticipantUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Wrap a uuid read back from a hand-written query
    ///
    /// Nothing in M1 holds this as a foreign key, so unlike [`TournamentUuid`]
    /// there is no `new_from_field` — nothing would ever call it.
    pub(in crate::models) fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// Outcome of an operation gated on holding some role in a tournament
///
/// One [`Self::Denied`] for "does not exist" and "not yours to touch" alike,
/// the same reasoning as [`crate::models::deck::DeckAccess`].
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
    /// Whether this role may change settings, status, visibility, the join
    /// code or who else is staff
    ///
    /// Everything a [`OrganizerRole::Scorekeeper`] is *not* trusted with —
    /// running the roster and, from M2 on, results, is what is left over.
    pub fn may_manage(self) -> bool {
        !matches!(self, Self::Organizer(OrganizerRole::Scorekeeper))
    }
}

/// Who is acting: a logged-in account, or a guest carrying participant rows
/// in their session
///
/// A guest is never anonymous once they have joined something — they are the
/// holder of one or more [`TournamentParticipantUuid`]s, remembered by
/// [`extractor::TournamentActor::remember_guest`]. Nothing here says an
/// account and a guest are mutually exclusive over time: a claimed guest row
/// becomes an ordinary participant with an account, and the old participant
/// uuid simply stops being useful to present.
#[derive(Debug, Clone)]
pub enum TournamentActor {
    /// A logged-in account
    Account(Account),
    /// A guest, identified by the participant rows their session holds
    Guest(Vec<TournamentParticipantUuid>),
}

/// A tournament: an event with a roster and, from M2 on, rounds
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
    /// How the seats at a table are handed out
    pub seat_policy: SeatPolicy,
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
    /// Whether players must check in before round one is paired
    pub require_check_in: bool,
    /// Whether players may still register after the event started
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    pub late_entry_as_losses: bool,
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

/// One line of the organizer-only staff list
///
/// Carries the account's username, unlike every participant-facing surface —
/// see the module docs on why a display name and a username are never the
/// same field here.
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
    /// How the seats at a table are handed out
    pub seat_policy: SeatPolicy,
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
    /// Whether players must check in before round one is paired
    pub require_check_in: bool,
    /// Whether players may still register after the event started
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    pub late_entry_as_losses: bool,
    /// Who may see the event at all
    pub visibility: Visibility,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,
}

/// What an organizer may change about a [`Tournament`]'s settings in one PUT
///
/// The same fields [`TournamentInsert`] takes minus [`Visibility`], which has
/// its own setter and its own audit action.
#[derive(Debug, Clone)]
pub struct TournamentUpdate {
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,
    /// Default round length in minutes
    pub round_minutes: i16,
    /// The format being played
    pub format: MaxStr<32>,
    /// How many players sit at one table
    pub pod_size: i16,
    /// Best-of how many games a 1v1 match is
    pub games_per_match: i16,
    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,
    /// How the seats at a table are handed out
    pub seat_policy: SeatPolicy,
    /// Match points for a win
    pub points_win: i16,
    /// Match points for a draw
    pub points_draw: i16,
    /// Match points for a loss
    pub points_loss: i16,
    /// Match points for a bye
    pub points_bye: i16,
    /// Whether players must check in before round one is paired
    pub require_check_in: bool,
    /// Whether players may still register after the event started
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as match losses
    pub late_entry_as_losses: bool,
}

/// Outcome of [`Tournament::update_settings`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsChange {
    /// The settings were written
    Changed,
    /// The always-editable fields were written; the structural ones were not
    /// — see [`Tournament::update_settings`]
    Locked,
}

/// Outcome of [`Tournament::set_status`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusChange {
    /// The status was written
    Changed,
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
    /// The only raw fetch — see the module docs on why every other accessor
    /// answers through a guard instead of calling this directly
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
    ///
    /// The owner column is checked first: it is cheaper than the join and it
    /// is the common case for the account that is looking at its own event.
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

    /// The read for the actor group: owner, organizer and participant see
    /// everything; everyone else sees it only while [`Visibility::Public`]
    ///
    /// A guest matches when one of the participant uuids their session holds
    /// belongs to this tournament.
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

    /// Create a new tournament, owned by `owner`
    ///
    /// Visibility handling copied from [`crate::models::deck::Deck::create`]:
    /// [`Visibility::Unlisted`] mints a share token, the other two get none.
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
                seat_policy: insert.seat_policy,
                status: TournamentStatus::Draft,
                points_win: insert.points_win,
                points_draw: insert.points_draw,
                points_loss: insert.points_loss,
                points_bye: insert.points_bye,
                round_minutes: insert.round_minutes,
                require_check_in: insert.require_check_in,
                allow_late_entry: insert.allow_late_entry,
                late_entry_as_losses: insert.late_entry_as_losses,
                visibility: insert.visibility,
                share_token,
                join_code: None,
                join_code_expires_at: None,
                venue: insert.venue,
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

    /// Update a tournament's settings
    ///
    /// `name`, `description`, `venue`, `starts_at` and `round_minutes` are
    /// always editable — an organizer must be able to fix a typo or move the
    /// venue while the event is running. Everything structural (format,
    /// `pod_size`, `games_per_match`, `pairing_system`, `seat_policy`, the
    /// point values, `require_check_in`, `allow_late_entry`,
    /// `late_entry_as_losses`) only takes while [`TournamentStatus::Draft`] or
    /// [`TournamentStatus::Registration`]: reshaping the bracket or the
    /// scoring table mid-event would invalidate rounds already played. While
    /// locked, the always-editable fields still write and the structural ones
    /// are left untouched — [`SettingsChange::Locked`] tells the caller that
    /// happened, it does not mean nothing did.
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

        let unlocked = matches!(
            tournament.status,
            TournamentStatus::Draft | TournamentStatus::Registration
        );

        let builder = rorm::update(&mut *tx, TournamentModel)
            .begin_dyn_set()
            .set_if(TournamentModel.name, Some(update.name))
            .set_if(TournamentModel.description, Some(update.description))
            .set_if(TournamentModel.venue, Some(update.venue))
            .set_if(TournamentModel.starts_at, Some(update.starts_at))
            .set_if(TournamentModel.round_minutes, Some(update.round_minutes))
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
                TournamentModel.seat_policy,
                unlocked.then_some(update.seat_policy),
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
                TournamentModel.require_check_in,
                unlocked.then_some(update.require_check_in),
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

        Ok(TournamentAccess::Granted(if unlocked {
            SettingsChange::Changed
        } else {
            SettingsChange::Locked
        }))
    }

    /// Move a tournament to a new lifecycle status
    ///
    /// Entering [`TournamentStatus::Finished`] stamps `finished_at` and nulls
    /// the join code and its expiry; entering [`TournamentStatus::Cancelled`]
    /// nulls the code and its expiry without stamping `finished_at` — a
    /// cancelled event never finished. Nulling the expiry alongside the code
    /// is not spelled out by name anywhere else, but leaving a stale expiry
    /// on a `None` code is a dangling value nothing would ever read
    /// correctly again.
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

        let enters_finished = matches!(status, TournamentStatus::Finished);
        let clears_join_code = matches!(
            status,
            TournamentStatus::Finished | TournamentStatus::Cancelled
        );

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
            .set_if(
                TournamentModel.join_code_expires_at,
                clears_join_code.then_some(None::<OffsetDateTime>),
            );

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

        Ok(TournamentAccess::Granted(StatusChange::Changed))
    }

    /// Set a tournament's visibility
    ///
    /// [`crate::models::deck::Deck::set_visibility`], verbatim semantics:
    /// switching to [`Visibility::Unlisted`] mints a share token, switching
    /// away revokes it.
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

    /// Mint a fresh join code, invalidating whatever one was live before
    ///
    /// Retries on a unique-constraint collision — the alphabet is wide enough
    /// (29^6) that this is a belt, not a plan — up to
    /// [`JOIN_CODE_MINT_ATTEMPTS`] times before giving up and surfacing the
    /// last collision as a real error. The expiry is the event's announced
    /// start plus [`JOIN_CODE_GRACE_AFTER_START`] when it named one, else
    /// [`DEFAULT_JOIN_CODE_LIFETIME`] from now.
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

        let expires_at = match tournament.starts_at {
            Some(starts_at) => starts_at + JOIN_CODE_GRACE_AFTER_START,
            None => OffsetDateTime::now_utc() + DEFAULT_JOIN_CODE_LIFETIME,
        };

        let mut last_collision = None;
        for _ in 0..JOIN_CODE_MINT_ATTEMPTS {
            let code = generate_join_code();
            match rorm::update(&mut *tx, TournamentModel)
                .set(TournamentModel.join_code, Some(code.clone()))
                .set(TournamentModel.join_code_expires_at, Some(expires_at))
                .condition(TournamentModel.uuid.equals(uuid.0))
                .await
            {
                Ok(_) => {
                    Self::audit(
                        &mut *tx,
                        uuid,
                        Some(account),
                        AuditAction::JoinCodeRotated,
                        None,
                        None,
                    )
                    .await?;
                    return Ok(TournamentAccess::Granted(code));
                }
                Err(error) if is_unique_violation(&error) => last_collision = Some(error),
                Err(error) => return Err(error),
            }
        }

        Err(last_collision.unwrap_or_else(|| unreachable!("the loop above runs at least once")))
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

    /// The unauthenticated lookup by join code
    ///
    /// This is the ONLY code-resolving path, so the liveness rules live here
    /// and nowhere else: an expired code, a tournament that is
    /// [`TournamentStatus::Finished`], [`TournamentStatus::Cancelled`] or
    /// still [`TournamentStatus::Draft`], or no code at all, all read as
    /// `None`. `set_status` already nulls the code on the two terminal
    /// statuses, so the status check here is a second, cheaper line of
    /// defence rather than the only one.
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

    /// Delete a tournament and, through the cascade, its organizers,
    /// participants and audit log
    ///
    /// Owner only — the owner column is a plain field on the row, so unlike
    /// the rest of this module's mutators, `owned_by` folds straight into the
    /// statement.
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

    /// Add an account as staff
    ///
    /// Owner only.
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

    /// Remove an account from staff
    ///
    /// Owner only.
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

    /// Write one line to a tournament's audit log
    ///
    /// `detail` is truncated to 1024 characters rather than refused — the log
    /// is for reading, not for replay, so a clipped sentence beats a failed
    /// mutation. Every other mutator in this module and in
    /// [`participant`](crate::models::tournament::participant) calls this
    /// last, once its own write has gone through.
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

    /// Read a tournament's audit log, newest first
    ///
    /// Visible to any role holder. Ordered by uuid rather than `created_at`:
    /// a v7 uuid already orders by creation, and it breaks ties that two
    /// entries written in the same millisecond would leave ambiguous.
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

        // Caches the username lookup across rows: one organizer doing every
        // action is the common case, and this keeps that case at one query.
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
            seat_policy: value.seat_policy,
            status: value.status,
            points_win: value.points_win,
            points_draw: value.points_draw,
            points_loss: value.points_loss,
            points_bye: value.points_bye,
            round_minutes: value.round_minutes,
            require_check_in: value.require_check_in,
            allow_late_entry: value.allow_late_entry,
            late_entry_as_losses: value.late_entry_as_losses,
            visibility: value.visibility,
            share_token: value.share_token,
            join_code: value.join_code,
            join_code_expires_at: value.join_code_expires_at,
            venue: value.venue,
            starts_at: value.starts_at,
            finished_at: value.finished_at,
            created_at: value.created_at,
        }
    }
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
///
/// Organizer- and audit-facing surfaces read the raw string rather than
/// [`Username`] itself, so a response type does not have to pull the account
/// module's newtype in just to carry four bytes back out.
fn bounded_username(username: Username) -> MaxStr<32> {
    MaxStr::new(username.as_str().to_owned())
        .unwrap_or_else(|_| unreachable!("Username::MAX_LEN is {}", Username::MAX_LEN))
}

/// Whether a write failed on a unique-constraint violation
///
/// The one distinction [`Tournament::rotate_join_code`] and
/// [`participant`](crate::models::tournament::participant)'s registration
/// paths ever need to make: every other failure is a database that is down
/// or a bug, and is propagated untouched. Matching the `DatabaseError` this
/// way — instead of pre-querying for the row that would collide — is
/// deliberate: a pre-query races a concurrent insert, the constraint itself
/// never does.
pub(in crate::models::tournament) fn is_unique_violation(error: &rorm::Error) -> bool {
    matches!(
        error,
        rorm::Error::SqlxError(sqlx::Error::Database(inner)) if inner.is_unique_violation()
    )
}
