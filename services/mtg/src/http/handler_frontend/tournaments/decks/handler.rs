use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::put;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;

use crate::http::handler_frontend::decks::schema::DeckCardResponse;
use crate::http::handler_frontend::shared::schema::redact_slot;
use crate::http::handler_frontend::tournaments::decks::schema::ListParticipantDecksResponse;
use crate::http::handler_frontend::tournaments::decks::schema::ListRegisteredDecksResponse;
use crate::http::handler_frontend::tournaments::decks::schema::MyRegisteredDeckResponse;
use crate::http::handler_frontend::tournaments::decks::schema::ParticipantDeckResponse;
use crate::http::handler_frontend::tournaments::decks::schema::RegisterDeckErrors;
use crate::http::handler_frontend::tournaments::decks::schema::RegisterDeckRequest;
use crate::http::handler_frontend::tournaments::decks::schema::RegisteredDeckResponse;
use crate::http::handler_frontend::tournaments::decks::schema::RegisteredListResponse;
use crate::http::handler_frontend::tournaments::decks::schema::RegisteredListsResponse;
use crate::http::handler_frontend::tournaments::decks::schema::SetListSharingErrors;
use crate::http::handler_frontend::tournaments::decks::schema::SetListSharingRequest;
use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::live::TournamentEvent;
use crate::http::handler_frontend::tournaments::live::emit;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::registered_deck::DeckRegistrar;
use crate::models::tournament::registered_deck::ListReader;
use crate::models::tournament::registered_deck::ListSharingRefusal;
use crate::models::tournament::registered_deck::RegisterDeckRefusal;
use crate::models::tournament::registered_deck::list_visible;

/// The logged-in Account's own Registered deck in a Tournament it plays in
///
/// Says whether it may still change it itself, which ends when the first Round
/// starts; a late Participant registers its own until it is pinned.
#[get("/{tournament}/deck")]
pub async fn get_my_tournament_deck(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<MyRegisteredDeckResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(participant) = grant.participant else {
        tx.rollback().await?;
        return Err(denied());
    };
    let tournament = grant.tournament;
    let deck = tournament.registered_deck(&mut tx, participant).await?;
    let changeable = tournament
        .changes_own_deck(&mut tx, tournament.state, participant)
        .await?;

    tx.commit().await?;

    Ok(ApiJson(MyRegisteredDeckResponse {
        deck: deck.map(RegisteredDeckResponse::from),
        changeable,
    }))
}

/// Register one of the logged-in Account's decks for a Tournament it plays in,
/// or swap the one registered
///
/// While the Tournament is in Registration, where the Registered deck follows
/// the deck until the first Round starts; a late Participant registers its own
/// afterwards, pinned at once, and can no longer swap it then.
#[put("/{tournament}/deck")]
pub async fn register_my_tournament_deck(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
    ApiJson(RegisterDeckRequest { deck, shared }): ApiJson<RegisterDeckRequest>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(participant) = grant.participant else {
        tx.rollback().await?;
        return Err(denied());
    };
    let tournament = grant.tournament;
    if let Err(refusal) = tournament
        .register_deck(
            &mut tx,
            participant,
            deck,
            shared,
            DeckRegistrar::Participant,
        )
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;
    emit(tournament.uuid, TournamentEvent::DecksChanged);

    Ok(ApiJson(()))
}

/// Remove the logged-in Account's own Registered deck, to play without one
///
/// Only while the Tournament is in Registration.
#[delete("/{tournament}/deck")]
pub async fn remove_my_tournament_deck(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(participant) = grant.participant else {
        tx.rollback().await?;
        return Err(denied());
    };
    let tournament = grant.tournament;
    if let Err(refusal) = tournament
        .remove_registered_deck(&mut tx, participant, DeckRegistrar::Participant)
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;
    emit(tournament.uuid, TournamentEvent::DecksChanged);

    Ok(ApiJson(()))
}

/// Every Registered deck of a Tournament, as an Organizer
#[get("/{tournament}/registered-decks")]
pub async fn list_tournament_registered_decks(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListRegisteredDecksResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
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
///
/// Private decks are left out: an Organizer registers none of them.
#[get("/{tournament}/participants/{participant}/decks")]
pub async fn list_tournament_participant_decks(
    grant: TournamentGrant,
    Path((_, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<ListParticipantDecksResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
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
/// At any time, with any of the Participant's decks that is not private;
/// after the first Round started the new Registered deck is pinned at once
/// and sets its own Deck checkpoint.
#[put("/{tournament}/participants/{participant}/deck")]
pub async fn register_tournament_participant_deck(
    grant: TournamentGrant,
    Path((_, participant)): Path<(TournamentUuid, ParticipantUuid)>,
    ApiJson(RegisterDeckRequest { deck, shared }): ApiJson<RegisterDeckRequest>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
    if let Err(refusal) = tournament
        .register_deck(&mut tx, participant, deck, shared, DeckRegistrar::Organizer)
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;
    emit(tournament.uuid, TournamentEvent::DecksChanged);

    Ok(ApiJson(()))
}

/// Remove a Participant's Registered deck, as an Organizer, at any time
#[delete("/{tournament}/participants/{participant}/deck")]
pub async fn remove_tournament_participant_deck(
    grant: TournamentGrant,
    Path((_, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<()>, RegisterDeckErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
    if let Err(refusal) = tournament
        .remove_registered_deck(&mut tx, participant, DeckRegistrar::Organizer)
        .await?
    {
        tx.rollback().await?;
        return Err(refused(refusal));
    }

    tx.commit().await?;
    emit(tournament.uuid, TournamentEvent::DecksChanged);

    Ok(ApiJson(()))
}

/// Choose whether others may see the logged-in Account's list once the
/// Tournament is Finished
///
/// The Participant's own choice, open until the Tournament is Finished or
/// Cancelled; from then on it is refused.
#[put("/{tournament}/deck/sharing")]
pub async fn set_my_tournament_list_sharing(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
    ApiJson(SetListSharingRequest { shared }): ApiJson<SetListSharingRequest>,
) -> ApiResult<ApiJson<()>, SetListSharingErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(participant) = grant.participant else {
        tx.rollback().await?;
        return Err(denied());
    };
    let tournament = grant.tournament;
    match tournament
        .set_list_sharing(&mut tx, participant, shared)
        .await?
    {
        Ok(()) => {}
        Err(ListSharingRefusal::NoRegisteredDeck) => {
            tx.rollback().await?;
            return Err(ApiError::bad_request("No registered deck"));
        }
        Err(ListSharingRefusal::TournamentOver) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<SetListSharingErrors>::new();
            errors.tournament_over = true;
            return errors.fail();
        }
    }

    tx.commit().await?;
    emit(tournament.uuid, TournamentEvent::DecksChanged);

    Ok(ApiJson(()))
}

/// The Registered decks' lists the reader may see
///
/// Organizers read every list at any time, to check them against the format.
/// Everybody else reads none before the Tournament is Finished and the shared
/// ones afterwards, also once their deck was deleted.
#[get("/{tournament}/registered-lists")]
pub async fn list_tournament_registered_lists(
    viewer: Viewer,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<RegisteredListsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
    let reader = match viewer.account() {
        Some(account) if tournament.organizer_role(&mut tx, account).await?.is_some() => {
            ListReader::Organizer
        }
        _ => ListReader::Other,
    };
    let response = registered_lists_view(&mut tx, &tournament, reader).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// The lists of `tournament`'s Registered decks `reader` may see
///
/// Somebody else's proxies stay out of the lists an Organizer does not read.
pub async fn registered_lists_view(
    tx: &mut Transaction,
    tournament: &Tournament,
    reader: ListReader,
) -> Result<RegisteredListsResponse, rorm::Error> {
    let mut decks = Vec::new();
    for deck in tournament.registered_decks(tx).await? {
        if !list_visible(tournament.state, deck.shared, reader) {
            continue;
        }
        let cards = tournament
            .registered_list(tx, &deck)
            .await?
            .into_iter()
            .map(DeckCardResponse::from)
            .map(|slot| match reader {
                ListReader::Organizer => slot,
                ListReader::Other => redact_slot(slot),
            })
            .collect();
        decks.push(RegisteredListResponse::new(deck, cards));
    }
    Ok(RegisteredListsResponse { decks })
}

/// The answer to a refused Registered deck write
fn refused(refusal: RegisterDeckRefusal) -> ApiError<RegisterDeckErrors> {
    match RegisterDeckErrors::from_refusal(refusal) {
        Some(errors) => ApiError::FormError(errors),
        None => ApiError::bad_request("No such participant"),
    }
}
