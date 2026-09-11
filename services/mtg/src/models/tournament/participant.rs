//! Participants: the people playing in a tournament, guests included
//!
//! A participant is a name that *may* link to an [`Account`](crate::models::account::Account): an organizer's
//! walk-in and a phone that joined by code and never signed up are both rows
//! with `account = None`. [`TournamentParticipant`] never carries a claim
//! token — that secret leaves this module in exactly two places: the second
//! field of [`RegistrationOutcome::Registered`] returned by
//! [`register_guest`], and [`claim_token`]'s own return value, handed to
//! staff to show a player as a QR code — nowhere else. It also never carries
//! a username: an organizer recognises
//! staff by [`super::TournamentOrganizer::username`], but a roster is read by
//! [`TournamentParticipant::display_name`] only, guest and account alike —
//! see the module docs on [`super`] for why.

use std::collections::HashSet;

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use rand::RngExt;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::tournament::AuditAction;
use crate::models::tournament::DecklistPolicy;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAccess;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentParticipantInsertPatch;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::decklist;
use crate::models::tournament::decklist::SelfServe;
use crate::models::tournament::is_unique_violation;

/// Somebody playing in a tournament
///
/// Mirrors [`TournamentParticipantModel`] minus `claim_token` (see the module
/// docs) plus [`Self::is_guest`], a convenience derived from
/// [`Self::account`] so callers never have to spell out `.is_none()`
/// themselves.
#[derive(Debug, Clone)]
pub struct TournamentParticipant {
    /// Primary key
    pub uuid: TournamentParticipantUuid,
    /// The tournament being played in
    pub tournament: TournamentUuid,
    /// The account behind the player, `None` for a guest
    pub account: Option<AccountUuid>,
    /// Whether this row has no account behind it yet
    pub is_guest: bool,
    /// The name the player appears under
    pub display_name: MaxStr<64>,
    /// [`Self::display_name`] lowercased, the league resolver's lookup key
    pub name_normalized: MaxStr<64>,
    /// Where the player stands in the event
    pub status: ParticipantStatus,
    /// The first round the player was part of
    pub entered_round: i16,
    /// The last round the player was paired into, `None` while active
    pub dropped_after_round: Option<i16>,
    /// Random tiebreak seed, minted at registration
    pub seed: i32,
    /// The organizer's manual tiebreak value, zero unless touched
    pub manual_tiebreak: i32,
    /// When the player checked in, `None` until they did
    pub checked_in_at: Option<OffsetDateTime>,
    /// Organizer-only notes on the player
    pub notes: Option<MaxStr<512>>,
    /// The point in time the player registered
    pub registered_at: OffsetDateTime,
}

/// Outcome of [`register_account`] and [`register_guest`]
///
/// One enum for both: the second field of [`Self::Registered`] is the
/// freshly minted claim token, `Some` only when [`register_guest`] produced
/// one — an account row is never claimable, so [`register_account`] always
/// answers `None` there.
#[derive(Debug, Clone)]
pub enum RegistrationOutcome {
    /// A row was written, carrying the participant and — for a guest only —
    /// its one-time claim token
    Registered(TournamentParticipant, Option<MaxStr<64>>),
    /// Registration is not open right now; nothing was written
    Closed,
    /// This account already has a row in this tournament; nothing was written
    AlreadyRegistered,
    /// Every seat the event offers is taken; nothing was written
    Full,
}

/// Outcome of [`claim`]
#[derive(Debug, Clone)]
pub enum ClaimOutcome {
    /// The row now belongs to `account`
    Claimed(TournamentParticipant),
    /// No unclaimed row carries this token
    InvalidToken,
    /// This account already has a row in that guest row's tournament
    AlreadyRegistered,
}

/// Mint a fresh guest claim token
///
/// Same minting as [`crate::models::account::RegistrationToken::create`]: 43
/// alphanumeric characters, which cannot overflow the 64-character column, so
/// the fallible constructor can never actually fail.
fn generate_claim_token() -> MaxStr<64> {
    MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 43))
        .unwrap_or_else(|_| unreachable!("43 alphanumeric chars fit into 64"))
}

/// Lowercase, trim and collapse a display name into the league resolver's
/// lookup key
///
/// Built word by word rather than truncated after the fact: lowercasing can
/// grow a handful of Unicode characters by a byte or two, and truncating the
/// result afterwards risks landing mid-character. Stopping before a word
/// would push past 64 bytes side-steps that entirely, at the cost of
/// (silently) dropping the tail of a name pathological enough to hit it.
fn normalize_name(name: &str) -> MaxStr<64> {
    let mut normalized = String::with_capacity(name.len());
    for word in name.split_whitespace() {
        let word = word.to_lowercase();
        let extra = if normalized.is_empty() { 0 } else { 1 };
        if normalized.len() + extra + word.len() > 64 {
            break;
        }
        if !normalized.is_empty() {
            normalized.push(' ');
        }
        normalized.push_str(&word);
    }
    MaxStr::new(normalized)
        .unwrap_or_else(|_| unreachable!("kept under the maximum length by construction"))
}

/// How many seats the roster currently occupies
///
/// A dropped or disqualified player frees their seat again: the row stays for
/// the standings, but the chair is available to the next person through the
/// door.
async fn seats_taken(tx: &mut Transaction, tournament: &Tournament) -> Result<i64, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentParticipantModel.status)
        .condition(
            TournamentParticipantModel
                .tournament
                .equals(tournament.uuid.into_inner()),
        )
        .all()
        .await?;
    Ok(rows
        .into_iter()
        .filter(|status| {
            matches!(
                status,
                ParticipantStatus::Registered | ParticipantStatus::CheckedIn
            )
        })
        .count() as i64)
}

/// Whether the event still has room for one more self-service registration
///
/// Only asked on the self-service paths. An organizer at the desk is trusted
/// to know their own room and may seat one past the limit, the same call
/// `allow_late_entry` already leaves to them. Read-then-write is good enough
/// here: two phones racing the last seat is not a correctness problem worth a
/// lock — the roster simply ends up one over, which an organizer can fix.
async fn has_room(tx: &mut Transaction, tournament: &Tournament) -> Result<bool, rorm::Error> {
    let Some(max) = tournament.max_participants else {
        return Ok(true);
    };
    Ok(seats_taken(&mut *tx, tournament).await? < i64::from(max))
}

/// Whether a player may register *themselves* right now
///
/// Shared by [`register_account`] and [`register_guest`]; the latter widens
/// it for an organizer typing in a walk-in before calling this. A late entry
/// is that organizer's to make: `allow_late_entry` only ever opens the
/// self-service door while the event runs, and the client no longer offers
/// it, so in practice a player who turns up late is added at the desk.
fn registration_open(tournament: &Tournament) -> bool {
    matches!(tournament.status, TournamentStatus::Registration)
        || (tournament.status == TournamentStatus::Running && tournament.allow_late_entry)
}

/// Register an account as a participant
///
/// `added_by` says who is asking, exactly as in [`register_guest`]: `None`
/// for a player registering themselves, `Some` for an organizer adding a
/// known account at the desk — the phone-died case. The organizer path widens
/// the window the same way and skips the capacity check; the caller must have
/// checked that account holds a role before calling this.
///
/// Whether a self-service request is open follows [`registration_open`]. The partial
/// unique index on `(tournament, account)` — not a pre-query — is what
/// decides [`RegistrationOutcome::AlreadyRegistered`]: a pre-query would race
/// a second tab submitting the same form. Because Postgres aborts the whole
/// transaction on that violation, the audit row is written only in the
/// success arm, *after* the insert; logging `ParticipantAdded` on the
/// violation path is both impossible (nothing may write into an aborted
/// transaction) and wrong (nothing was added).
#[instrument(name = "register_account", skip(tx, tournament))]
pub async fn register_account(
    tx: &mut Transaction,
    tournament: &Tournament,
    account: AccountUuid,
    display_name: MaxStr<64>,
    added_by: Option<AccountUuid>,
) -> Result<RegistrationOutcome, rorm::Error> {
    let by_organizer = added_by.is_some();
    let open = registration_open(tournament)
        || (by_organizer && tournament.status == TournamentStatus::Running);
    if !open {
        return Ok(RegistrationOutcome::Closed);
    }
    if !by_organizer && !has_room(&mut *tx, tournament).await? {
        return Ok(RegistrationOutcome::Full);
    }

    let name_normalized = normalize_name(&display_name);
    // Bound to a `let` rather than called inline: a `ThreadRng` temporary
    // reaching into the same statement as the trailing `.await` stays alive
    // until the statement ends (Rust drops statement temporaries last, not
    // sub-expression-first), which would hold the `!Send` rng across the
    // await and poison every handler's future that ever calls this.
    let seed = rand::rng().random();
    let result = rorm::insert(&mut *tx, TournamentParticipantModel)
        .single(&TournamentParticipantInsertPatch {
            uuid: Uuid::now_v7(),
            tournament: ForeignModelByField(tournament.uuid.into_inner()),
            account: Some(ForeignModelByField(account.into_inner())),
            display_name,
            name_normalized,
            status: ParticipantStatus::Registered,
            entered_round: 1,
            seed,
            claim_token: None,
        })
        .await;

    let model = match result {
        Ok(model) => model,
        Err(error) if is_unique_violation(&error) => {
            return Ok(RegistrationOutcome::AlreadyRegistered);
        }
        Err(error) => return Err(error),
    };
    let participant = TournamentParticipant::from(model);

    Tournament::audit(
        &mut *tx,
        tournament.uuid,
        Some(added_by.unwrap_or(account)),
        AuditAction::ParticipantAdded,
        Some(participant.uuid.into_inner()),
        None,
    )
    .await?;

    Ok(RegistrationOutcome::Registered(participant, None))
}

/// Register a guest — a walk-in typed in by an organizer, or a phone that
/// joined by code without signing in
///
/// `added_by` distinguishes the two: `None` for a self-service join, `Some`
/// for an organizer typing in a walk-in — the caller must already have
/// checked that account holds a role before calling this, the same
/// discipline as everywhere else in this module tree. An organizer may add
/// walk-ins in [`TournamentStatus::Draft`] and — as the one route for a late
/// entry — while [`TournamentStatus::Running`], whatever `allow_late_entry`
/// says; that is the one way [`registration_open`]'s rule is widened here.
///
/// A guest row can never collide with the partial unique index — that index
/// is `WHERE account IS NOT NULL`, and this insert always sets `account` to
/// `None` — so [`RegistrationOutcome::AlreadyRegistered`] is unreachable
/// through this function; it stays in the shared enum only because
/// [`register_account`] needs it.
#[instrument(name = "register_guest", skip(tx, tournament))]
pub async fn register_guest(
    tx: &mut Transaction,
    tournament: &Tournament,
    display_name: MaxStr<64>,
    added_by: Option<AccountUuid>,
) -> Result<RegistrationOutcome, rorm::Error> {
    let open = registration_open(tournament)
        || (added_by.is_some()
            && matches!(
                tournament.status,
                TournamentStatus::Draft | TournamentStatus::Running
            ));
    if !open {
        return Ok(RegistrationOutcome::Closed);
    }
    if added_by.is_none() && !has_room(&mut *tx, tournament).await? {
        return Ok(RegistrationOutcome::Full);
    }

    let claim_token = generate_claim_token();
    let name_normalized = normalize_name(&display_name);
    // See the matching comment in `register_account`: bound to a `let` so
    // the `!Send` `ThreadRng` temporary does not span the trailing `.await`.
    let seed = rand::rng().random();
    let model = rorm::insert(&mut *tx, TournamentParticipantModel)
        .single(&TournamentParticipantInsertPatch {
            uuid: Uuid::now_v7(),
            tournament: ForeignModelByField(tournament.uuid.into_inner()),
            account: None,
            display_name,
            name_normalized,
            status: ParticipantStatus::Registered,
            entered_round: 1,
            seed,
            claim_token: Some(claim_token.clone()),
        })
        .await?;
    let participant = TournamentParticipant::from(model);

    Tournament::audit(
        &mut *tx,
        tournament.uuid,
        added_by,
        AuditAction::ParticipantAdded,
        Some(participant.uuid.into_inner()),
        None,
    )
    .await?;

    Ok(RegistrationOutcome::Registered(
        participant,
        Some(claim_token),
    ))
}

/// Attach an account to a guest row using its claim token
///
/// The lookup by token already excludes claimed rows — `claim_token` is
/// nulled the instant a row is claimed (see [`TournamentParticipantModel`]),
/// so a token that still resolves always names an unclaimed guest. The
/// update repeats the token in its `WHERE` to close the same race a
/// find-then-write always has: if two requests race the same token, only the
/// one whose `UPDATE` still sees it live affects a row. Losing that race
/// reads as [`ClaimOutcome::InvalidToken`] — indistinguishable from a token
/// that was never valid, which is the point.
///
/// [`ClaimOutcome::AlreadyRegistered`] is the partial unique index again, not
/// a pre-query, for the same reason as [`register_account`]: the audit row is
/// written only after the update has actually gone through.
#[instrument(name = "claim", skip(tx, claim_token))]
pub async fn claim(
    tx: &mut Transaction,
    account: AccountUuid,
    claim_token: &str,
) -> Result<ClaimOutcome, rorm::Error> {
    let Some(row) = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(
            TournamentParticipantModel
                .claim_token
                .equals(Some(claim_token)),
        )
        .optional()
        .await?
    else {
        return Ok(ClaimOutcome::InvalidToken);
    };

    let result = rorm::update(&mut *tx, TournamentParticipantModel)
        .set(
            TournamentParticipantModel.account,
            Some(ForeignModelByField(account.into_inner())),
        )
        .set(TournamentParticipantModel.claim_token, None)
        .condition(rorm::and![
            TournamentParticipantModel.uuid.equals(row.uuid),
            TournamentParticipantModel
                .claim_token
                .equals(Some(claim_token)),
        ])
        .await;

    let affected = match result {
        Ok(affected) => affected,
        Err(error) if is_unique_violation(&error) => return Ok(ClaimOutcome::AlreadyRegistered),
        Err(error) => return Err(error),
    };
    if affected == 0 {
        // Somebody else claimed this token in the gap between the lookup and
        // the write above — single-use, so it is now exactly as invalid as a
        // token that never existed.
        return Ok(ClaimOutcome::InvalidToken);
    }

    let updated = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(TournamentParticipantModel.uuid.equals(row.uuid))
        .optional()
        .await?
        .unwrap_or_else(|| unreachable!("the row this function just updated must still exist"));
    let tournament = TournamentUuid::new_from_field(updated.tournament);
    let participant = TournamentParticipant::from(updated);

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::ParticipantClaimed,
        Some(participant.uuid.into_inner()),
        None,
    )
    .await?;

    Ok(ClaimOutcome::Claimed(participant))
}

/// Hand a guest row's live claim token to staff, e.g. to render it as a QR
/// code for a walk-in to scan
///
/// Guard: [`Tournament::role_of`] — **any** role, deliberately not
/// [`super::TournamentRole::may_manage`]. Walking a guest through claiming
/// their own row with a shown QR is exactly what a
/// [`super::OrganizerRole::Scorekeeper`] is for, the same reasoning as
/// [`update`]'s guard. `Ok(Granted(None))` covers both "this row already
/// belongs to an account" and "somebody already claimed it" alike — either
/// way there is no live token to hand out, and the caller has no reason to
/// tell the two apart. Only actually audits when a token comes back: handing
/// out `None` is not a bearer credential leaving the building, so it is not
/// what [`AuditAction::ClaimTokenIssued`] is for.
#[instrument(name = "claim_token", skip(tx))]
pub async fn claim_token(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<Option<MaxStr<64>>>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }

    let Some(claim_token) = rorm::query(&mut *tx, TournamentParticipantModel.claim_token)
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        ])
        .optional()
        .await?
    else {
        return Ok(TournamentAccess::Denied);
    };

    if claim_token.is_some() {
        Tournament::audit(
            &mut *tx,
            tournament,
            Some(account),
            AuditAction::ClaimTokenIssued,
            Some(participant.into_inner()),
            None,
        )
        .await?;
    }

    Ok(TournamentAccess::Granted(claim_token))
}

/// What a claim token names, for the screen a scanned QR lands on before the
/// player has committed to anything
#[derive(Debug, Clone)]
pub struct ClaimTarget {
    /// The tournament the row belongs to
    pub tournament: TournamentUuid,
    /// The participant row the token names
    pub participant: TournamentParticipantUuid,
    /// The tournament's name, to greet the player with
    pub tournament_name: MaxStr<128>,
    /// The row's current display name
    pub display_name: MaxStr<64>,
}

/// Look up a live claim token without acting on it
///
/// A pure read: [`reattach`] is this exact lookup plus an audit row. See
/// [`resolve_claim_token`] for why a token that still resolves always names
/// an unclaimed guest.
#[instrument(name = "look_up_claim_token", skip(tx, claim_token))]
pub async fn look_up_claim_token(
    tx: &mut Transaction,
    claim_token: &str,
) -> Result<Option<ClaimTarget>, rorm::Error> {
    resolve_claim_token(&mut *tx, claim_token).await
}

/// Re-attach a guest session to its row using a still-live claim token
///
/// Deliberately does **not** clear the token, unlike [`claim`]: this only
/// proves a device already holds the secret and wants its guest session
/// pointed at the row again, not that an account is taking permanent
/// ownership of it. The same device may lose its cookie and need the token a
/// second, third, ... time — only an account's [`claim`] is the one-time
/// event that retires it. `actor: None` on the audit row, the same reasoning
/// as [`audit_actor`] for a guest's own [`check_in`]/[`drop`]: a guest
/// re-attaching is nobody accountable.
#[instrument(name = "reattach", skip(tx, claim_token))]
pub async fn reattach(
    tx: &mut Transaction,
    claim_token: &str,
) -> Result<Option<ClaimTarget>, rorm::Error> {
    let Some(target) = resolve_claim_token(&mut *tx, claim_token).await? else {
        return Ok(None);
    };

    Tournament::audit(
        &mut *tx,
        target.tournament,
        None,
        AuditAction::ParticipantReattached,
        Some(target.participant.into_inner()),
        None,
    )
    .await?;

    Ok(Some(target))
}

/// The lookup [`look_up_claim_token`] and [`reattach`] share
///
/// `claim_token` is nulled the instant an account claims a row (see
/// [`claim`]), so — exactly like [`claim`]'s own lookup — a token that still
/// resolves here always names an unclaimed guest. Two queries rather than a
/// join: this runs behind an unauthenticated, rate-limited endpoint reachable
/// straight from a scanned QR, so simplicity beats saving one round trip most
/// of these requests will never repeat.
async fn resolve_claim_token(
    tx: &mut Transaction,
    claim_token: &str,
) -> Result<Option<ClaimTarget>, rorm::Error> {
    let Some((participant, tournament, display_name)) = rorm::query(
        &mut *tx,
        (
            TournamentParticipantModel.uuid,
            TournamentParticipantModel.tournament,
            TournamentParticipantModel.display_name,
        ),
    )
    .condition(
        TournamentParticipantModel
            .claim_token
            .equals(Some(claim_token)),
    )
    .optional()
    .await?
    else {
        return Ok(None);
    };
    let participant = TournamentParticipantUuid::from_uuid(participant);
    let tournament = TournamentUuid::new_from_field(tournament);

    let Some(tournament_name) = rorm::query(&mut *tx, TournamentModel.name)
        .condition(TournamentModel.uuid.equals(tournament.into_inner()))
        .optional()
        .await?
    else {
        // The participant row outlived its tournament, which the schema's
        // cascading delete should make impossible — read as "no such token"
        // rather than unwrap into a panic over it.
        return Ok(None);
    };

    Ok(Some(ClaimTarget {
        tournament,
        participant,
        tournament_name,
        display_name,
    }))
}

/// Every participant of a tournament, oldest registration first
///
/// No guard: the caller already holds a [`super::TournamentWithViewer`] or
/// equivalent proof that it may see this tournament at all before asking for
/// its roster.
#[instrument(name = "list", skip(tx))]
pub async fn list(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<Vec<TournamentParticipant>, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        )
        .order_asc(TournamentParticipantModel.registered_at)
        .all()
        .await?;
    Ok(rows.into_iter().map(TournamentParticipant::from).collect())
}

/// Change a participant's display name and/or organizer notes
///
/// Guard: `organizer_account` must hold *some* role — unlike the
/// settings/status/visibility mutators in [`super`], this does not require
/// [`super::TournamentRole::may_manage`], since running the roster is
/// specifically what [`super::OrganizerRole::Scorekeeper`] is for.
/// `tournament` is folded into the `WHERE` alongside `participant`, so a
/// valid organizer of one tournament cannot touch another's row by uuid.
#[instrument(name = "update", skip(tx, display_name, notes))]
pub async fn update(
    tx: &mut Transaction,
    organizer_account: AccountUuid,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
    display_name: Option<MaxStr<64>>,
    notes: Option<Option<MaxStr<512>>>,
) -> Result<TournamentAccess<()>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, organizer_account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }

    let name_normalized = display_name.as_deref().map(normalize_name);
    let builder = rorm::update(&mut *tx, TournamentParticipantModel)
        .begin_dyn_set()
        .set_if(TournamentParticipantModel.display_name, display_name)
        .set_if(TournamentParticipantModel.name_normalized, name_normalized)
        .set_if(TournamentParticipantModel.notes, notes);

    let affected = match builder.finish_dyn_set() {
        Ok(builder) => {
            builder
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                ])
                .await?
        }
        // Nothing to change — still confirm the row is this tournament's
        // before answering `Granted`.
        Err(_) => u64::from(
            rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                ])
                .optional()
                .await?
                .is_some(),
        ),
    };
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(organizer_account),
        AuditAction::ParticipantUpdated,
        Some(participant.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(()))
}

/// Which accounts already hold a row in this tournament
///
/// Read by the organizer's player search so a hit already on the roster can be
/// shown as such instead of failing on submit. Guest rows have no account and
/// simply do not appear.
#[instrument(name = "accounts_on_roster", skip(tx))]
pub async fn accounts_on_roster(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<HashSet<AccountUuid>, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentParticipantModel.account)
        .condition(
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        )
        .all()
        .await?;
    Ok(rows
        .into_iter()
        .flatten()
        .map(AccountUuid::new_from_field)
        .collect())
}

/// Whether `actor` may act as staff or as the participant themself on
/// `participant`, and if so which
///
/// The guard every self-serve mutator on a participant row starts with —
/// [`check_in`]/[`drop`] through the thin [`may_self_serve`] wrapper, and
/// [`decklist::get`]/[`decklist::set`] directly, since they have to tell
/// [`SelfServe::Staff`] apart from [`SelfServe::Own`] to decide whether the
/// decklist lock applies. `Staff` when the actor holds any role on the
/// tournament; `Own` when the actor *is* that participant: an
/// [`TournamentActor::Account`] whose own row this is, or a
/// [`TournamentActor::Guest`] carrying that exact uuid in its session — in
/// both cases re-checked against the database, since a session cannot prove
/// which tournament a uuid belongs to on its own. `None` otherwise.
pub(super) async fn self_serve(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<Option<SelfServe>, rorm::Error> {
    match actor {
        TournamentActor::Account(account) => {
            if Tournament::role_of(&mut *tx, tournament, account.uuid)
                .await?
                .is_some()
            {
                return Ok(Some(SelfServe::Staff));
            }
            let is_self = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                    TournamentParticipantModel
                        .account
                        .equals(Some(account.uuid.into_inner())),
                ])
                .optional()
                .await?
                .is_some();
            Ok(is_self.then_some(SelfServe::Own))
        }
        TournamentActor::Guest(participants) => {
            if !participants.contains(&participant) {
                return Ok(None);
            }
            let belongs = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                ])
                .optional()
                .await?
                .is_some();
            Ok(belongs.then_some(SelfServe::Own))
        }
    }
}

/// Whether `actor` may check in, drop or otherwise self-serve `participant`
///
/// Thin wrapper over [`self_serve`] for callers that only need to know
/// *whether* access is granted, not which kind — [`check_in`] and [`drop`]
/// have never had to tell staff and the participant themself apart.
async fn may_self_serve(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<bool, rorm::Error> {
    Ok(self_serve(tx, actor, tournament, participant)
        .await?
        .is_some())
}

/// The account behind `actor`, for the audit log — `None` for a guest, since
/// nothing accountable identifies one
fn audit_actor(actor: &TournamentActor) -> Option<AccountUuid> {
    match actor {
        TournamentActor::Account(account) => Some(account.uuid),
        TournamentActor::Guest(_) => None,
    }
}

/// Outcome of [`check_in`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CheckInOutcome {
    /// The player is checked in
    CheckedIn,
    /// The tournament's [`DecklistPolicy::RequiredToCheckIn`] is set and this
    /// player has no decklist on file; nothing was written
    DecklistMissing,
}

/// Check a participant in, self-service or by staff
///
/// Only takes from [`ParticipantStatus::Registered`] — folded into the
/// `WHERE` rather than checked separately, so a stale double-click answers
/// [`TournamentAccess::Denied`] instead of stamping `checked_in_at` twice.
/// Under [`DecklistPolicy::RequiredToCheckIn`], a player with no decklist on
/// file is refused *before* that `UPDATE` runs at all — [`CheckInOutcome::DecklistMissing`],
/// not [`TournamentAccess::Denied`], since the actor is allowed here, just not
/// ready yet.
#[instrument(name = "check_in", skip(tx, actor))]
pub async fn check_in(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<CheckInOutcome>, rorm::Error> {
    if !may_self_serve(&mut *tx, actor, tournament, participant).await? {
        return Ok(TournamentAccess::Denied);
    }

    let policy = rorm::query(&mut *tx, TournamentModel.decklist_policy)
        .condition(TournamentModel.uuid.equals(tournament.into_inner()))
        .optional()
        .await?
        .unwrap_or_else(|| unreachable!("self_serve already confirmed this tournament exists"));
    if policy == DecklistPolicy::RequiredToCheckIn
        && !decklist::exists(&mut *tx, participant).await?
    {
        return Ok(TournamentAccess::Granted(CheckInOutcome::DecklistMissing));
    }

    let affected = rorm::update(&mut *tx, TournamentParticipantModel)
        .set(
            TournamentParticipantModel.status,
            ParticipantStatus::CheckedIn,
        )
        .set(
            TournamentParticipantModel.checked_in_at,
            Some(OffsetDateTime::now_utc()),
        )
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
            TournamentParticipantModel
                .status
                .equals(ParticipantStatus::Registered),
        ])
        .await?;
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        audit_actor(actor),
        AuditAction::ParticipantCheckedIn,
        Some(participant.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(CheckInOutcome::CheckedIn))
}

/// Drop a participant, self-service or by staff
///
/// Takes from [`ParticipantStatus::Registered`] or
/// [`ParticipantStatus::CheckedIn`] — the two "still active" statuses; a row
/// already [`ParticipantStatus::Dropped`] or
/// [`ParticipantStatus::Disqualified`] answers [`TournamentAccess::Denied`]
/// rather than being dropped again. `dropped_after_round` is always `0` in
/// M1: no round has been played yet for it to name.
#[instrument(name = "drop", skip(tx, actor))]
pub async fn drop(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<()>, rorm::Error> {
    if !may_self_serve(&mut *tx, actor, tournament, participant).await? {
        return Ok(TournamentAccess::Denied);
    }

    let affected = rorm::update(&mut *tx, TournamentParticipantModel)
        .set(
            TournamentParticipantModel.status,
            ParticipantStatus::Dropped,
        )
        .set(TournamentParticipantModel.dropped_after_round, Some(0))
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
            rorm::or![
                TournamentParticipantModel
                    .status
                    .equals(ParticipantStatus::Registered),
                TournamentParticipantModel
                    .status
                    .equals(ParticipantStatus::CheckedIn),
            ],
        ])
        .await?;
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        audit_actor(actor),
        AuditAction::ParticipantDropped,
        Some(participant.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(()))
}

/// Remove a participant outright
///
/// A hard delete — allowed in M1 because nobody has played a round yet; M2
/// adds the "owns a seat in a pairing" refusal. Reads the display name before
/// deleting so the audit entry still names who was removed after the row is
/// gone.
#[instrument(name = "remove", skip(tx))]
pub async fn remove(
    tx: &mut Transaction,
    organizer_account: AccountUuid,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<()>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, organizer_account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }

    let Some(row) = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        ])
        .optional()
        .await?
    else {
        return Ok(TournamentAccess::Denied);
    };
    let display_name = row.display_name.into_inner();

    let affected = rorm::delete(&mut *tx, TournamentParticipantModel)
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        ])
        .await?;
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(organizer_account),
        AuditAction::ParticipantRemoved,
        Some(participant.into_inner()),
        Some(display_name),
    )
    .await?;

    Ok(TournamentAccess::Granted(()))
}

impl From<TournamentParticipantModel> for TournamentParticipant {
    fn from(value: TournamentParticipantModel) -> Self {
        let account = value.account.map(AccountUuid::new_from_field);
        Self {
            uuid: TournamentParticipantUuid::from_uuid(value.uuid),
            tournament: TournamentUuid::new_from_field(value.tournament),
            is_guest: account.is_none(),
            account,
            display_name: value.display_name,
            name_normalized: value.name_normalized,
            status: value.status,
            entered_round: value.entered_round,
            dropped_after_round: value.dropped_after_round,
            seed: value.seed,
            manual_tiebreak: value.manual_tiebreak,
            checked_in_at: value.checked_in_at,
            notes: value.notes,
            registered_at: value.registered_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_name;

    #[test]
    fn trims_and_lowercases() {
        assert_eq!(&*normalize_name("  Alice Smith  "), "alice smith");
    }

    #[test]
    fn collapses_inner_whitespace() {
        assert_eq!(&*normalize_name("Alice   \t Smith"), "alice smith");
    }

    #[test]
    fn reads_an_empty_name_as_empty() {
        assert_eq!(&*normalize_name(""), "");
        assert_eq!(&*normalize_name("   "), "");
    }

    #[test]
    fn lowercases_beyond_ascii() {
        assert_eq!(&*normalize_name("MÜLLER Ångström"), "müller ångström");
    }

    #[test]
    fn a_name_at_the_boundary_survives() {
        let name = "a".repeat(64);
        assert_eq!(normalize_name(&name).len(), 64);
    }

    #[test]
    fn is_idempotent() {
        let once = normalize_name("Jane   Doe");
        let twice = normalize_name(&once);
        assert_eq!(&*once, &*twice);
    }
}
