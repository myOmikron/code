use std::sync::LazyLock;
use std::time::Duration;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::decks::collaborators::schema::CollaboratorCandidateResponse;
use crate::http::handler_frontend::decks::collaborators::schema::CollaboratorCandidatesResponse;
use crate::http::handler_frontend::decks::collaborators::schema::DeckCollaboratorResponse;
use crate::http::handler_frontend::decks::collaborators::schema::DeckOwnerResponse;
use crate::http::handler_frontend::decks::collaborators::schema::ListDeckCollaboratorsResponse;
use crate::http::handler_frontend::decks::collaborators::schema::ListSharedWithMeResponse;
use crate::http::handler_frontend::decks::collaborators::schema::PutDeckCollaboratorErrors;
use crate::http::handler_frontend::decks::collaborators::schema::PutDeckCollaboratorRequest;
use crate::http::handler_frontend::decks::collaborators::schema::SearchCollaboratorCandidatesQuery;
use crate::http::handler_frontend::decks::collaborators::schema::SharedWithMeDeckResponse;
use crate::http::handler_frontend::decks::handler::denied;
use crate::http::handler_frontend::decks::handler::granted;
use crate::http::handler_frontend::decks::schema::DeckOverviewResponse;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::deck::Deck;
use crate::models::deck::DeckUuid;
use crate::models::deck::access::DeckOperation;
use crate::models::deck::access::DeckRole;
use crate::models::deck::collaborator::DeckCollaborator;
use crate::models::deck::listing::DeckSummary;
use crate::utils::budget::Budget;

/// Unknown usernames a caller may try to name per hour
///
/// Only failed names count: role changes and Undo name known Accounts.
static UNKNOWN_USERNAMES: LazyLock<Budget<AccountUuid>> =
    LazyLock::new(|| Budget::new(20, Duration::from_secs(60 * 60)));

/// Username searches a caller may run per hour, about one per typed letter
static CANDIDATE_SEARCHES: LazyLock<Budget<AccountUuid>> =
    LazyLock::new(|| Budget::new(120, Duration::from_secs(60 * 60)));

/// How many Accounts a username search answers with at most
const CANDIDATE_LIMIT: u64 = 10;

/// How many characters a username search needs before it searches
const CANDIDATE_MIN_CHARS: usize = 2;

/// The decks other Accounts named the caller on, alphabetically by name
///
/// "Shared with me": never filed into the caller's folders, which hold only
/// the caller's own decks.
#[get("/shared-with-me")]
pub async fn get_decks_shared_with_me(
    account: Account,
) -> ApiResult<ApiJson<ListSharedWithMeResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let shared = DeckCollaborator::shared_with(&mut tx, account.uuid).await?;
    let mut summaries = DeckSummary::read_shared_with(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListSharedWithMeResponse {
        decks: shared
            .into_iter()
            .map(|shared| {
                let summary = summaries.remove(&shared.deck.uuid);
                let overview = DeckOverviewResponse::new(shared.deck, summary);
                SharedWithMeDeckResponse {
                    overview: DeckOverviewResponse {
                        deck: overview.deck.seen_as(Some(shared.level.role())),
                        ..overview
                    },
                    owner_username: shared.owner_username.as_str().to_string(),
                    level: shared.level,
                }
            })
            .collect(),
    }))
}

/// The owner and the Collaborators of a deck, the latter alphabetically by username
///
/// The owner and every Collaborator read it.
#[get("/{deck}/collaborators")]
pub async fn list_deck_collaborators(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<ListDeckCollaboratorsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let grant = granted(
        Deck::authorize(
            &mut tx,
            deck_uuid,
            account.uuid,
            DeckOperation::ListCollaborators,
        )
        .await?,
    )?;
    let collaborators = DeckCollaborator::get_all(&mut tx, &grant).await?;
    let owner = Account::get_by_uuid(&mut tx, grant.owner())
        .await?
        .ok_or_else(|| ApiError::server_error("Deck owner vanished"))?;

    tx.commit().await?;

    Ok(ApiJson(ListDeckCollaboratorsResponse {
        owner: DeckOwnerResponse {
            account: owner.uuid,
            username: owner.username.as_str().to_string(),
        },
        collaborators: collaborators
            .into_iter()
            .map(DeckCollaboratorResponse::from)
            .collect(),
    }))
}

/// Name an Account on a deck by its username, or change the level it is named at
///
/// Naming an Account that is already on the deck changes its level, so it is
/// on the deck once. The owner and the Tombstone cannot be named.
///
/// Unknown usernames are capped per caller, see [`UNKNOWN_USERNAMES`].
#[put("/{deck}/collaborators")]
pub async fn put_deck_collaborator(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(PutDeckCollaboratorRequest { username, level }): ApiJson<PutDeckCollaboratorRequest>,
) -> ApiResult<ApiJson<DeckCollaboratorResponse>, PutDeckCollaboratorErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let grant = granted(
        Deck::authorize(
            &mut tx,
            deck_uuid,
            account.uuid,
            DeckOperation::ManageCollaborators,
        )
        .await?,
    )?;

    let named = match Username::new(username.to_string()) {
        Ok(username) => Account::get_by_username(&mut tx, &username).await?,
        Err(_) => None,
    };
    let Some(named) = named else {
        tx.rollback().await?;
        let mut errors = FormErrors::<PutDeckCollaboratorErrors>::new();
        if UNKNOWN_USERNAMES.take(account.uuid) {
            errors.unknown_username = true;
        } else {
            errors.too_many_unknown_usernames = true;
        }
        return errors.fail();
    };
    if named.uuid == grant.owner() {
        tx.rollback().await?;
        let mut errors = FormErrors::<PutDeckCollaboratorErrors>::new();
        errors.own_account = true;
        return errors.fail();
    }

    DeckCollaborator::put(&mut tx, &grant, named.uuid, level).await?;

    tx.commit().await?;

    Ok(ApiJson(DeckCollaboratorResponse {
        account: named.uuid,
        username: named.username.as_str().to_string(),
        level,
    }))
}

/// Accounts whose username starts with what the owner typed, to name on a deck
///
/// Answers with up to ten Accounts, the caller among them if it matches,
/// alphabetically by username. Fewer than two characters search nothing.
/// Searches are capped per caller, see [`CANDIDATE_SEARCHES`]; past the cap
/// the answer is empty and says so.
#[get("/{deck}/collaborators/candidates")]
pub async fn search_collaborator_candidates(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    Query(SearchCollaboratorCandidatesQuery { query }): Query<SearchCollaboratorCandidatesQuery>,
) -> ApiResult<ApiJson<CollaboratorCandidatesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(
        Deck::authorize(
            &mut tx,
            deck_uuid,
            account.uuid,
            DeckOperation::ManageCollaborators,
        )
        .await?,
    )?;

    let prefix = query.trim();
    if prefix.chars().count() < CANDIDATE_MIN_CHARS {
        tx.commit().await?;
        return Ok(ApiJson(CollaboratorCandidatesResponse {
            accounts: Vec::new(),
            too_many_searches: false,
        }));
    }
    if !CANDIDATE_SEARCHES.take(account.uuid) {
        tx.commit().await?;
        return Ok(ApiJson(CollaboratorCandidatesResponse {
            accounts: Vec::new(),
            too_many_searches: true,
        }));
    }
    let found = Account::search_by_username_prefix(&mut tx, prefix, CANDIDATE_LIMIT).await?;

    tx.commit().await?;

    Ok(ApiJson(CollaboratorCandidatesResponse {
        accounts: found
            .into_iter()
            .map(|(account, username)| CollaboratorCandidateResponse {
                account,
                username: username.as_str().to_string(),
            })
            .collect(),
        too_many_searches: false,
    }))
}

/// Take an Account off a deck
///
/// It loses its access with the next request it makes.
#[delete("/{deck}/collaborators/{account}")]
pub async fn remove_deck_collaborator(
    account: Account,
    Path((deck_uuid, collaborator)): Path<(DeckUuid, AccountUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let grant = granted(
        Deck::authorize(
            &mut tx,
            deck_uuid,
            account.uuid,
            DeckOperation::ManageCollaborators,
        )
        .await?,
    )?;
    DeckCollaborator::remove(&mut tx, &grant, collaborator).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Take oneself off a deck another Account named one on
///
/// The deck leaves "Shared with me" and its access ends with the next request.
/// Its owner cannot leave it.
#[post("/{deck}/leave")]
pub async fn leave_deck(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let grant = granted(
        Deck::authorize(&mut tx, deck_uuid, account.uuid, DeckOperation::LeaveDeck).await?,
    )?;
    if grant.role() == DeckRole::Owner {
        tx.rollback().await?;
        return Err(denied().into());
    }
    DeckCollaborator::remove(&mut tx, &grant, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}
