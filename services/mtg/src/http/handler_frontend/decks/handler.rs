use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::patch;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::decks::schema::AddDeckCardRequest;
use crate::http::handler_frontend::decks::schema::BracketRulesResponse;
use crate::http::handler_frontend::decks::schema::CreateDeckRequest;
use crate::http::handler_frontend::decks::schema::CreateDeckTagRequest;
use crate::http::handler_frontend::decks::schema::DeckCardResponse;
use crate::http::handler_frontend::decks::schema::DeckResponse;
use crate::http::handler_frontend::decks::schema::DeckTagResponse;
use crate::http::handler_frontend::decks::schema::FormatRulesResponse;
use crate::http::handler_frontend::decks::schema::ImportDeckCardsRequest;
use crate::http::handler_frontend::decks::schema::ImportDeckCardsResponse;
use crate::http::handler_frontend::decks::schema::ListDeckCardsResponse;
use crate::http::handler_frontend::decks::schema::ListFormatsResponse;
use crate::http::handler_frontend::decks::schema::ReadDeckCardResponse;
use crate::http::handler_frontend::decks::schema::ReadDeckUrlRequest;
use crate::http::handler_frontend::decks::schema::ReadDeckUrlResponse;
use crate::http::handler_frontend::decks::schema::RotateDeckShareTokenResponse;
use crate::http::handler_frontend::decks::schema::SetDeckBracketRequest;
use crate::http::handler_frontend::decks::schema::SetDeckColorsRequest;
use crate::http::handler_frontend::decks::schema::SetDeckVisibilityRequest;
use crate::http::handler_frontend::decks::schema::UpdateDeckCardRequest;
use crate::http::handler_frontend::decks::schema::UpdateDeckRequest;
use crate::http::handler_frontend::decks::schema::UpdateDeckTagRequest;
use crate::models::account::Account;
use crate::models::deck::Deck;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckCard;
use crate::models::deck::DeckCardInsert;
use crate::models::deck::DeckCardPatch;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckInsert;
use crate::models::deck::DeckUuid;
use crate::models::deck::listing::ListedSlot;
use crate::models::deck::tag::DeckTag;
use crate::models::deck::tag::DeckTagInsert;
use crate::models::deck::tag::DeckTagUuid;
use crate::models::format::BRACKETS;
use crate::models::format::FORMAT_RULES;
use crate::utils::deck_source::DeckSourceError;
use crate::utils::deck_source::fetch;
use crate::utils::deck_source::parse_deck_url;

/// The decks an account owns
#[get("/")]
pub async fn get_all_decks(account: Account) -> ApiResult<ApiJson<Vec<DeckResponse>>> {
    let mut tx = Database::global().start_transaction().await?;

    let decks = Deck::get_all_for_account(&mut tx, account.uuid)
        .await?
        .into_iter()
        .map(DeckResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(decks))
}

/// What the offered formats ask of a deck
///
/// Construction rules only: size, copies, commander, sideboard. Whether a card
/// is legal is answered per card by the catalog.
#[get("/formats")]
pub async fn get_deck_formats() -> ApiResult<ApiJson<ListFormatsResponse>> {
    Ok(ApiJson(ListFormatsResponse {
        formats: FORMAT_RULES.iter().map(FormatRulesResponse::from).collect(),
        brackets: BRACKETS.iter().map(BracketRulesResponse::from).collect(),
    }))
}

/// Create a deck
#[post("/")]
pub async fn create_deck(
    account: Account,
    ApiJson(CreateDeckRequest {
        name,
        description,
        format,
        visibility,
    }): ApiJson<CreateDeckRequest>,
) -> ApiResult<ApiJson<DeckResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let deck = Deck::create(
        &mut tx,
        account.uuid,
        DeckInsert {
            name,
            description,
            format,
            visibility,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckResponse::from(deck)))
}

/// Fetch a single deck
#[get("/{deck}")]
pub async fn get_deck(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<DeckResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let deck = Deck::get_visible(&mut tx, deck_uuid, Some(account.uuid))
        .await?
        .ok_or_else(denied)?;

    tx.commit().await?;

    Ok(ApiJson(DeckResponse::from(deck)))
}

/// Rename a deck, change its description or the format it is built for
#[put("/{deck}")]
pub async fn update_deck(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(UpdateDeckRequest {
        name,
        description,
        format,
    }): ApiJson<UpdateDeckRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::update(&mut tx, account.uuid, deck_uuid, name, description, format).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Change who may see a deck
#[post("/{deck}")]
pub async fn set_visibility_deck(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(SetDeckVisibilityRequest { visibility }): ApiJson<SetDeckVisibilityRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::set_visibility(&mut tx, account.uuid, deck_uuid, visibility).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Overrule which colours the deck may play
///
/// `null` hands the decision back to the commander zone. This exists because
/// there are commanders that grant the deck a colour outside their own
/// identity, and the service has no business knowing which ones.
#[put("/{deck}/colors")]
pub async fn set_deck_colors(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(SetDeckColorsRequest { colors }): ApiJson<SetDeckColorsRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::set_allowed_color_identity(&mut tx, account.uuid, deck_uuid, colors).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Say which Commander bracket the deck is built to
///
/// Nothing is checked: the bracket is a claim its builder makes, and the client
/// says where the claim and the cards disagree.
#[put("/{deck}/bracket")]
pub async fn set_deck_bracket(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(SetDeckBracketRequest { bracket }): ApiJson<SetDeckBracketRequest>,
) -> ApiResult<ApiJson<()>> {
    if bracket.is_some_and(|number| !(1..=5).contains(&number)) {
        return Err(ApiError::bad_request("A bracket is one to five"));
    }

    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::set_bracket(&mut tx, account.uuid, deck_uuid, bracket).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Mint a fresh secret for a deck's share link
#[post("/{deck}/share-token")]
pub async fn rotate_deck_share_token(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<RotateDeckShareTokenResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let share_token = match Deck::rotate_share_token(&mut tx, account.uuid, deck_uuid).await? {
        DeckAccess::Granted(token) => token,
        DeckAccess::Denied => return Err(denied()),
    };

    tx.commit().await?;

    Ok(ApiJson(RotateDeckShareTokenResponse { share_token }))
}

/// Delete a deck and everything in it
#[delete("/{deck}")]
pub async fn delete_deck(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::delete(&mut tx, account.uuid, deck_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Every card of a deck, with the catalog data and the tags on it
///
/// The whole deck in one answer: a hundred slots are not worth paging, and the
/// client groups and sorts them however the list is being looked at.
#[get("/{deck}/cards")]
pub async fn list_deck_cards(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<ListDeckCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;

    let cards = ListedSlot::read_deck(&mut tx, deck_uuid)
        .await?
        .into_iter()
        .map(DeckCardResponse::from)
        .collect();
    let tags = DeckTag::get_usable(&mut tx, account.uuid, deck_uuid)
        .await?
        .into_iter()
        .map(DeckTagResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(ListDeckCardsResponse { cards, tags }))
}

/// Put a card into a deck
#[post("/{deck}/cards")]
pub async fn add_deck_card(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(AddDeckCardRequest {
        printing,
        quantity,
        zone,
    }): ApiJson<AddDeckCardRequest>,
) -> ApiResult<ApiJson<DeckCardResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;

    if quantity < 1 {
        return Err(ApiError::bad_request("A slot holds at least one copy"));
    }

    let card = DeckCard::add(
        &mut tx,
        deck_uuid,
        DeckCardInsert {
            printing,
            quantity,
            zone,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckCardResponse {
        uuid: card.uuid,
        printing: card.printing,
        quantity: card.quantity,
        zone: card.zone,
        card: None,
        tags: Vec::new(),
    }))
}

/// Read a decklist off a link to another builder
///
/// Only the sites this knows are fetched, and only through a url composed here
/// from the deck's id — the link is read, never followed.
#[post("/import/url")]
pub async fn read_deck_url(
    _account: Account,
    ApiJson(ReadDeckUrlRequest { url }): ApiJson<ReadDeckUrlRequest>,
) -> ApiResult<ApiJson<ReadDeckUrlResponse>> {
    let source =
        parse_deck_url(&url).ok_or_else(|| ApiError::bad_request("Unsupported deck link"))?;

    let deck = fetch(&source).await.map_err(|error| match error {
        DeckSourceError::Unsupported => ApiError::bad_request("Unsupported deck link"),
        DeckSourceError::Refused { .. } => {
            ApiError::bad_request("The site refused to hand the deck over")
        }
        DeckSourceError::Unreadable { .. } => {
            ApiError::bad_request("The site's answer could not be read")
        }
        DeckSourceError::Unreachable { .. } => {
            ApiError::bad_request("The site could not be reached")
        }
    })?;

    Ok(ApiJson(ReadDeckUrlResponse {
        name: deck.name,
        format: deck.format,
        cards: deck
            .cards
            .into_iter()
            .map(|card| ReadDeckCardResponse {
                quantity: card.quantity,
                name: card.name,
                set_code: card.set_code,
                collector_number: card.collector_number,
                zone: card.zone,
            })
            .collect(),
    }))
}

/// Write a whole decklist into a deck
///
/// One transaction for the lot: a pasted list either lands or it does not.
#[post("/{deck}/cards/import")]
pub async fn import_deck_cards(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(ImportDeckCardsRequest { cards, replace }): ApiJson<ImportDeckCardsRequest>,
) -> ApiResult<ApiJson<ImportDeckCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;

    if cards.iter().any(|card| card.quantity < 1) {
        return Err(ApiError::bad_request("A slot holds at least one copy"));
    }

    let inserts: Vec<_> = cards
        .into_iter()
        .map(|card| DeckCardInsert {
            printing: card.printing,
            quantity: card.quantity,
            zone: card.zone,
        })
        .collect();
    let added = inserts.len() as u32;

    if replace {
        if !DeckCard::replace_all(&mut tx, deck_uuid, inserts).await? {
            return Err(denied());
        }
    } else {
        DeckCard::add_many(&mut tx, deck_uuid, inserts).await?;
    }

    tx.commit().await?;

    Ok(ApiJson(ImportDeckCardsResponse { added }))
}

/// Change a slot: its count, its zone or the print it sleeves
#[patch("/{deck}/cards/{card}")]
pub async fn update_deck_card(
    account: Account,
    Path((deck_uuid, card_uuid)): Path<(DeckUuid, DeckCardUuid)>,
    ApiJson(request): ApiJson<UpdateDeckCardRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;

    if request.quantity.is_some_and(|quantity| quantity < 1) {
        return Err(ApiError::bad_request("A slot holds at least one copy"));
    }

    granted(
        DeckCard::update(
            &mut tx,
            deck_uuid,
            card_uuid,
            DeckCardPatch {
                printing: request.printing,
                quantity: request.quantity,
                zone: request.zone,
            },
        )
        .await?,
    )?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Take a card out of a deck
#[delete("/{deck}/cards/{card}")]
pub async fn delete_deck_card(
    account: Account,
    Path((deck_uuid, card_uuid)): Path<(DeckUuid, DeckCardUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;
    granted(DeckCard::delete(&mut tx, deck_uuid, card_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Create a tag on a deck
#[post("/{deck}/tags")]
pub async fn create_deck_tag(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(CreateDeckTagRequest {
        name,
        color,
        global,
    }): ApiJson<CreateDeckTagRequest>,
) -> ApiResult<ApiJson<DeckTagResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;

    let tag = DeckTag::create(
        &mut tx,
        account.uuid,
        DeckTagInsert {
            deck: (!global).then_some(deck_uuid),
            name,
            color,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckTagResponse::from(tag)))
}

/// Rename a tag or recolour it
#[put("/{deck}/tags/{tag}")]
pub async fn update_deck_tag(
    account: Account,
    Path((deck_uuid, tag_uuid)): Path<(DeckUuid, DeckTagUuid)>,
    ApiJson(UpdateDeckTagRequest {
        name,
        color,
        global,
    }): ApiJson<UpdateDeckTagRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;
    granted(
        DeckTag::update(
            &mut tx,
            account.uuid,
            tag_uuid,
            (!global).then_some(deck_uuid),
            name,
            color,
        )
        .await?,
    )?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Delete a tag, taking it off every card it sat on
#[delete("/{deck}/tags/{tag}")]
pub async fn delete_deck_tag(
    account: Account,
    Path((deck_uuid, tag_uuid)): Path<(DeckUuid, DeckTagUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;
    granted(DeckTag::delete(&mut tx, account.uuid, tag_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Put a tag on a card
#[post("/{deck}/cards/{card}/tags/{tag}")]
pub async fn assign_deck_card_tag(
    account: Account,
    Path((deck_uuid, card_uuid, tag_uuid)): Path<(DeckUuid, DeckCardUuid, DeckTagUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;
    granted(DeckTag::assign(&mut tx, account.uuid, deck_uuid, card_uuid, tag_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Take a tag off a card
#[delete("/{deck}/cards/{card}/tags/{tag}")]
pub async fn unassign_deck_card_tag(
    account: Account,
    Path((deck_uuid, card_uuid, tag_uuid)): Path<(DeckUuid, DeckCardUuid, DeckTagUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;
    granted(DeckTag::unassign(&mut tx, account.uuid, deck_uuid, card_uuid, tag_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Turn a denied access into the one answer every refused request gets
fn granted<T>(access: DeckAccess<T>) -> ApiResult<T> {
    access.granted().ok_or_else(denied)
}

/// The answer a request that may not happen gets
fn denied() -> ApiError {
    ApiError::bad_request("Request was denied")
}
