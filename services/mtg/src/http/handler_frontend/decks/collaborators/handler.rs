use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::decks::collaborators::schema::DeckCollaboratorResponse;
use crate::http::handler_frontend::decks::collaborators::schema::ListDeckCollaboratorsResponse;
use crate::http::handler_frontend::decks::collaborators::schema::ListSharedWithMeResponse;
use crate::http::handler_frontend::decks::collaborators::schema::PutDeckCollaboratorErrors;
use crate::http::handler_frontend::decks::collaborators::schema::PutDeckCollaboratorRequest;
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

/// The Collaborators of a deck, alphabetically by username
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

    tx.commit().await?;

    Ok(ApiJson(ListDeckCollaboratorsResponse {
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
        errors.unknown_username = true;
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
