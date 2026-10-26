use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::tournaments::decks::schema::ListParticipantDecksResponse;
use crate::http::handler_frontend::tournaments::decks::schema::ListRegisteredDecksResponse;
use crate::http::handler_frontend::tournaments::decks::schema::MyRegisteredDeckResponse;
use crate::http::handler_frontend::tournaments::decks::schema::ParticipantDeckResponse;
use crate::http::handler_frontend::tournaments::decks::schema::RegisterDeckErrors;
use crate::http::handler_frontend::tournaments::decks::schema::RegisterDeckRequest;
use crate::http::handler_frontend::tournaments::decks::schema::RegisteredDeckResponse;
use crate::http::handler_frontend::tournaments::handler::denied;
use crate::models::account::Account;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::registered_deck::DeckRegistrar;
use crate::models::tournament::registered_deck::RegisterDeckRefusal;

/// The logged-in Account's own Registered deck in a Tournament it plays in
///
/// Says whether it may still change it itself, which ends when the first Round starts.
#[get("/{tournament}/deck")]
pub async fn get_my_tournament_deck(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<MyRegisteredDeckResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, Some(account.uuid)).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(participant) = tournament.participant_of(&mut tx, account.uuid).await? else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Not a participant"));
    };
    let deck = tournament.registered_deck(&mut tx, participant).await?;

    tx.commit().await?;

    Ok(ApiJson(MyRegisteredDeckResponse {
        deck: deck.map(RegisteredDeckResponse::from),
        changeable: tournament.roster_open(),
    }))
}

/// Register one of the logged-in Account's decks for a Tournament it plays in,
/// or swap the one registered
///
/// Only while the Tournament is in Registration; until the first Round starts
/// the Registered deck follows the deck.
#[put("/{tournament}/deck")]
pub async fn register_my_tournament_deck(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(RegisterDeckRequest { deck }): ApiJson<RegisterDeckRequest>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, Some(account.uuid)).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(participant) = tournament.participant_of(&mut tx, account.uuid).await? else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Not a participant"));
    };
    if let Err(refusal) = tournament
        .register_deck(&mut tx, participant, deck, DeckRegistrar::Participant)
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Remove the logged-in Account's own Registered deck, to play without one
///
/// Only while the Tournament is in Registration.
#[delete("/{tournament}/deck")]
pub async fn remove_my_tournament_deck(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, Some(account.uuid)).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(participant) = tournament.participant_of(&mut tx, account.uuid).await? else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Not a participant"));
    };
    if let Err(refusal) = tournament
        .remove_registered_deck(&mut tx, participant, DeckRegistrar::Participant)
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Every Registered deck of a Tournament, as an Organizer
#[get("/{tournament}/registered-decks")]
pub async fn list_tournament_registered_decks(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListRegisteredDecksResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let decks = tournament.registered_decks(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(ListRegisteredDecksResponse {
        decks: decks
            .into_iter()
            .map(RegisteredDeckResponse::from)
            .collect(),
    }))
}

/// The decks a Participant's Account owns, as an Organizer about to register one
#[get("/{tournament}/participants/{participant}/decks")]
pub async fn list_tournament_participant_decks(
    account: Account,
    Path((tournament, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<ListParticipantDecksResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let decks = tournament.participant_decks(&mut tx, participant).await?;

    tx.commit().await?;

    Ok(ApiJson(ListParticipantDecksResponse {
        decks: decks
            .into_iter()
            .map(|(uuid, name, format)| ParticipantDeckResponse {
                uuid,
                name: name.to_string(),
                format: format.to_string(),
            })
            .collect(),
    }))
}

/// Register or swap a Participant's Registered deck, as an Organizer
///
/// At any time; after the first Round started the new Registered deck is
/// pinned at once and sets its own Deck checkpoint.
#[put("/{tournament}/participants/{participant}/deck")]
pub async fn register_tournament_participant_deck(
    account: Account,
    Path((tournament, participant)): Path<(TournamentUuid, ParticipantUuid)>,
    ApiJson(RegisterDeckRequest { deck }): ApiJson<RegisterDeckRequest>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if let Err(refusal) = tournament
        .register_deck(&mut tx, participant, deck, DeckRegistrar::Organizer)
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Remove a Participant's Registered deck, as an Organizer, at any time
#[delete("/{tournament}/participants/{participant}/deck")]
pub async fn remove_tournament_participant_deck(
    account: Account,
    Path((tournament, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if let Err(refusal) = tournament
        .remove_registered_deck(&mut tx, participant, DeckRegistrar::Organizer)
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The answer to a refused Registered deck write
fn refused(refusal: RegisterDeckRefusal) -> ApiError<RegisterDeckErrors> {
    match RegisterDeckErrors::from_refusal(refusal) {
        Some(errors) => ApiError::FormError(errors),
        None => ApiError::bad_request("No such participant"),
    }
}
