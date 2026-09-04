//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::deck::db::DeckModel;
use crate::models::tournament::AuditAction;
use crate::models::tournament::DecklistPolicy;
use crate::models::tournament::OrganizerRole;
use crate::models::tournament::PairingSystem;
use crate::models::tournament::ParticipantAudience;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::SeatPolicy;
use crate::models::tournament::TournamentStatus;
use crate::models::visibility::Visibility;

/// A tournament: an event with a roster, rounds and standings
///
/// The first thing in this service several accounts work on together. The
/// `owner` stays the single account allowed to delete it or hand it over;
/// everything an organizer does day-to-day is granted through
/// [`TournamentOrganizerModel`] rows instead.
#[derive(Model, Debug)]
#[rorm(rename = "tournament")]
pub struct TournamentModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account that created the event
    ///
    /// Indexed because the "my tournaments" list filters on it, and a foreign
    /// key carries no index of its own.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// Name of the tournament
    pub name: MaxStr<128>,

    /// Optional description: what is played, what it costs, what there is to win
    pub description: Option<MaxStr<1024>>,

    /// The format being played
    ///
    /// The same free-form Scryfall slug as `deck.format`, and for the same
    /// reason: the backend never interprets it.
    pub format: MaxStr<32>,

    /// How many players sit at one table
    ///
    /// Two is classic 1v1 Swiss, three to five are Commander pods. Validated
    /// at the API boundary to 2..=5.
    pub pod_size: i16,

    /// Best-of how many games a 1v1 match is
    ///
    /// Odd, 1..=5; forced to one while [`Self::pod_size`] is above two — a pod
    /// plays one game.
    pub games_per_match: i16,

    /// How the next round's tables are put together
    pub pairing_system: PairingSystem,

    /// How the seats at a table are handed out
    pub seat_policy: SeatPolicy,

    /// Where the event stands in its lifecycle
    pub status: TournamentStatus,

    /// Match points for a win
    ///
    /// Points are data, not constants: 3/1/0 is the classic Swiss scoring, but
    /// cEDH events genuinely run other spreads.
    pub points_win: i16,

    /// Match points for a draw
    pub points_draw: i16,

    /// Match points for a loss
    pub points_loss: i16,

    /// Match points for a bye
    pub points_bye: i16,

    /// Default round length in minutes, copied onto each round when it starts
    pub round_minutes: i16,

    /// Whether players must check in before round one is paired
    #[rorm(default = false)]
    pub require_check_in: bool,

    /// Whether players may still register after the event started
    #[rorm(default = true)]
    pub allow_late_entry: bool,

    /// Whether a late entry's missed rounds count as match losses
    #[rorm(default = true)]
    pub late_entry_as_losses: bool,

    /// How the tournament requires its players to hand in a decklist
    ///
    /// Defaulted for the migration that adds this column to a table that
    /// already has rows — every tournament created before M1.5 becomes
    /// [`DecklistPolicy::Optional`], the least disruptive reading of "this
    /// event never asked".
    #[rorm(default = "Optional")]
    pub decklist_policy: DecklistPolicy,

    /// When decklists were locked tournament-wide, `None` while players may
    /// still write their own
    pub decklists_locked_at: Option<OffsetDateTime>,

    /// Who may see this tournament's roster at all
    ///
    /// Defaulted for the migration that adds this column to a table that
    /// already has rows — every tournament created before M1.7 becomes
    /// [`ParticipantAudience::Participants`], the setting closest to what
    /// this service always did before the audience was configurable.
    #[rorm(default = "Participants")]
    pub participant_audience: ParticipantAudience,

    /// Whether a guest's real name is shown to a reader who is neither staff
    /// nor a participant
    ///
    /// Defaulted to `false`, for the same migration reason as
    /// [`Self::participant_audience`] and as the conservative choice for a
    /// fresh tournament: an organizer opts into publishing a walk-in's real
    /// name rather than leaking it by not thinking about it.
    #[rorm(default = false)]
    pub guest_names_public: bool,

    /// Who may see the event at all
    ///
    /// Reused verbatim from decks and collections: `Public` is listed,
    /// `Unlisted` is reachable through [`Self::share_token`], `Private` is
    /// organizers and participants only.
    pub visibility: Visibility,

    /// Secret of the share link, `None` once the link is revoked
    #[rorm(unique)]
    pub share_token: Option<MaxStr<64>>,

    /// The short code players join by, `None` while none is handed out
    ///
    /// Unique among live codes only: it is nulled when the event finishes or
    /// is cancelled, which is what reclaims the code space.
    #[rorm(unique)]
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
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentModel`]
#[derive(Patch)]
#[rorm(model = "TournamentModel")]
pub struct TournamentInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account that created the event
    pub owner: ForeignModel<AccountModel>,
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
    /// Whether players must check in before round one
    pub require_check_in: bool,
    /// Whether players may still register after the start
    pub allow_late_entry: bool,
    /// Whether a late entry's missed rounds count as losses
    pub late_entry_as_losses: bool,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// Who may see the roster
    pub participant_audience: ParticipantAudience,
    /// Whether a guest's real name is public
    pub guest_names_public: bool,
    /// Who may see the event
    pub visibility: Visibility,
    /// Secret of the share link
    pub share_token: Option<MaxStr<64>>,
    /// The short code players join by
    pub join_code: Option<MaxStr<8>>,
    /// When the join code stops resolving
    pub join_code_expires_at: Option<OffsetDateTime>,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// When the event is announced to start
    pub starts_at: Option<OffsetDateTime>,
}

/// An account helping to run a tournament
///
/// The owner does not get a row here — "may this account run this event" has
/// one source of truth per account: being the owner, or having exactly one of
/// these rows. The uniqueness of (tournament, account) is a raw-SQL index in
/// the migration, because rorm has no composite unique annotation.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_organizer")]
pub struct TournamentOrganizerModel {
    /// Primary key
    ///
    /// The second half of the `tournament_organizer_tournament` index.
    #[rorm(
        primary_key,
        index(name = "tournament_organizer_tournament", priority = 2)
    )]
    pub uuid: Uuid,

    /// The tournament being helped with
    #[rorm(
        index(name = "tournament_organizer_tournament", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub tournament: ForeignModel<TournamentModel>,

    /// The helping account
    ///
    /// Indexed on its own for "events I help run".
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<AccountModel>,

    /// What the helper may do
    pub role: OrganizerRole,

    /// The point in time the helper was added
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentOrganizerModel`]
#[derive(Patch)]
#[rorm(model = "TournamentOrganizerModel")]
pub struct TournamentOrganizerInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament being helped with
    pub tournament: ForeignModel<TournamentModel>,
    /// The helping account
    pub account: ForeignModel<AccountModel>,
    /// What the helper may do
    pub role: OrganizerRole,
}

/// Somebody playing in a tournament
///
/// A participant is a name that *may* link to an account: walk-ins typed in
/// by the organizer and players who joined by code without signing up are
/// rows with `account = None`. The display name is denormalized on purpose —
/// a standings sheet printed in March must still read the same in December,
/// through renames and account deletions alike.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_participant")]
pub struct TournamentParticipantModel {
    /// Primary key
    ///
    /// The second half of the `tournament_participant_tournament` index.
    #[rorm(
        primary_key,
        index(name = "tournament_participant_tournament", priority = 2)
    )]
    pub uuid: Uuid,

    /// The tournament being played in
    #[rorm(
        index(name = "tournament_participant_tournament", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub tournament: ForeignModel<TournamentModel>,

    /// The account behind the player, `None` for a guest
    ///
    /// `SetNull`, not `Cascade`: an account deleting itself must not delete
    /// rounds three other people played in. Indexed for "tournaments I played
    /// in". One account registers at most once per tournament — a raw-SQL
    /// partial unique index in the migration, since guests share the null.
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub account: Option<ForeignModel<AccountModel>>,

    /// The name the player appears under
    pub display_name: MaxStr<64>,

    /// [`Self::display_name`] lowercased, the league resolver's lookup key
    pub name_normalized: MaxStr<64>,

    /// Where the player stands in the event
    pub status: ParticipantStatus,

    /// The first round the player was part of, one for everyone on time
    #[rorm(default = 1)]
    pub entered_round: i16,

    /// The last round the player was paired into, `None` while active
    pub dropped_after_round: Option<i16>,

    /// Random tiebreak seed, minted at registration
    ///
    /// The deterministic last tiebreaker, the seat-shuffle key and the source
    /// of a guest's public pseudonym, so all three stay stable per player.
    pub seed: i32,

    /// The organizer's manual tiebreak value, zero unless touched
    #[rorm(default = 0)]
    pub manual_tiebreak: i32,

    /// The secret a guest attaches or claims this row with
    ///
    /// A bearer credential scoped to this one participant: it re-attaches a
    /// guest session that lost its cookie, and it is what an account presents
    /// to claim the row. Nulled once claimed.
    #[rorm(unique)]
    pub claim_token: Option<MaxStr<64>>,

    /// When the player checked in, `None` until they did
    pub checked_in_at: Option<OffsetDateTime>,

    /// Organizer-only notes on the player
    pub notes: Option<MaxStr<512>>,

    /// The point in time the player registered
    #[rorm(auto_create_time)]
    pub registered_at: OffsetDateTime,
}

/// Insert patch for [`TournamentParticipantModel`]
#[derive(Patch)]
#[rorm(model = "TournamentParticipantModel")]
pub struct TournamentParticipantInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament being played in
    pub tournament: ForeignModel<TournamentModel>,
    /// The account behind the player, `None` for a guest
    pub account: Option<ForeignModel<AccountModel>>,
    /// The name the player appears under
    pub display_name: MaxStr<64>,
    /// The display name lowercased
    pub name_normalized: MaxStr<64>,
    /// Where the player stands in the event
    pub status: ParticipantStatus,
    /// The first round the player was part of
    pub entered_round: i16,
    /// Random tiebreak seed
    pub seed: i32,
    /// The secret a guest attaches or claims this row with
    pub claim_token: Option<MaxStr<64>>,
}

/// One organizer-visible line in a tournament's history
///
/// Append-only; deleted only with the tournament. Written next to every edit
/// an organizer makes and every registration, so a disputed decision can be
/// reconstructed after the event.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_audit")]
pub struct TournamentAuditModel {
    /// Primary key
    ///
    /// The second half of the `tournament_audit_tournament` index; a v7 uuid
    /// orders by creation, so the composite answers "this event's log, newest
    /// first" on its own.
    #[rorm(primary_key, index(name = "tournament_audit_tournament", priority = 2))]
    pub uuid: Uuid,

    /// The tournament the entry belongs to
    #[rorm(
        index(name = "tournament_audit_tournament", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub tournament: ForeignModel<TournamentModel>,

    /// The account that acted, `None` once it is deleted or for the system
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub actor_account: Option<ForeignModel<AccountModel>>,

    /// What happened
    pub action: AuditAction,

    /// What it happened to
    ///
    /// A bare uuid, not a foreign key, for the same reason
    /// `deckcard.printing` is not one: a cascade must never be able to delete
    /// the audit trail out from under the event.
    pub subject: Option<Uuid>,

    /// A short rendered account of the change, for reading, not for replay
    pub detail: Option<MaxStr<1024>>,

    /// The point in time the entry was written
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`TournamentAuditModel`]
#[derive(Patch)]
#[rorm(model = "TournamentAuditModel")]
pub struct TournamentAuditInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament the entry belongs to
    pub tournament: ForeignModel<TournamentModel>,
    /// The account that acted
    pub actor_account: Option<ForeignModel<AccountModel>>,
    /// What happened
    pub action: AuditAction,
    /// What it happened to
    pub subject: Option<Uuid>,
    /// A short rendered account of the change
    pub detail: Option<MaxStr<1024>>,
}

/// A participant's decklist — the text an organizer or the player reads,
/// nothing else
///
/// Split out of [`TournamentParticipantModel`] rather than a column on it:
/// the roster is read on every poll from M2 on, and `rorm::query(Model)`
/// loads every column of whatever it is given — dragging up to 16 KB of text
/// along on a query that runs constantly for everyone would make the poll
/// cost what a search page costs. Reading one player's list is rare next to
/// reading the roster, so the split pays for itself the moment M2 starts
/// polling.
#[derive(Model, Debug)]
#[rorm(rename = "tournament_decklist")]
pub struct TournamentDecklistModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The tournament this list belongs to
    ///
    /// Denormalized so every read and write is scoped without a join through
    /// [`TournamentParticipantModel`] — the same house pattern as
    /// `tournament_organizer.tournament` and `tournament_participant.tournament`.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tournament: ForeignModel<TournamentModel>,

    /// The player this list belongs to
    ///
    /// Unique, not merely indexed: one list per player.
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub participant: ForeignModel<TournamentParticipantModel>,

    /// The Planarium deck the text was rendered from, if any — provenance only
    ///
    /// `SetNull`, not `Cascade`: a player deleting the source deck later must
    /// not take their already-submitted list down with it, the same
    /// reasoning as `tournament_participant.account`.
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub deck: Option<ForeignModel<DeckModel>>,

    /// The list itself — the only thing anybody ever reads
    pub text: MaxStr<16384>,

    /// The point in time the list was first written
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time the list was last written
    ///
    /// Also `auto_create_time`: rorm requires a `NOT NULL` `auto_update_time`
    /// column to carry a value from the moment of insertion too, not only
    /// from its first update — which is exactly what is wanted here, since a
    /// freshly written list has no earlier "updated" moment to fall back to.
    #[rorm(auto_create_time, auto_update_time)]
    pub updated_at: OffsetDateTime,
}

/// Insert patch for [`TournamentDecklistModel`]
#[derive(Patch)]
#[rorm(model = "TournamentDecklistModel")]
pub struct TournamentDecklistInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The tournament this list belongs to
    pub tournament: ForeignModel<TournamentModel>,
    /// The player this list belongs to
    pub participant: ForeignModel<TournamentParticipantModel>,
    /// The Planarium deck the text was rendered from, if any
    pub deck: Option<ForeignModel<DeckModel>>,
    /// The list itself
    pub text: MaxStr<16384>,
}
