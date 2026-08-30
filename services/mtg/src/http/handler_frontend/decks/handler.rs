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
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::collections::schema::CollectionResponse;
use crate::http::handler_frontend::decks::schema::AddDeckCardRequest;
use crate::http::handler_frontend::decks::schema::BracketRulesResponse;
use crate::http::handler_frontend::decks::schema::CreateDeckRequest;
use crate::http::handler_frontend::decks::schema::CreateDeckTagRequest;
use crate::http::handler_frontend::decks::schema::DeckCardResponse;
use crate::http::handler_frontend::decks::schema::DeckDriftResponse;
use crate::http::handler_frontend::decks::schema::DeckOverviewResponse;
use crate::http::handler_frontend::decks::schema::DeckResponse;
use crate::http::handler_frontend::decks::schema::DeckSourcingResponse;
use crate::http::handler_frontend::decks::schema::DeckTagResponse;
use crate::http::handler_frontend::decks::schema::FillDeckCollectionRequest;
use crate::http::handler_frontend::decks::schema::FillDeckCollectionResponse;
use crate::http::handler_frontend::decks::schema::FormatRulesResponse;
use crate::http::handler_frontend::decks::schema::ImportDeckCardsRequest;
use crate::http::handler_frontend::decks::schema::ImportDeckCardsResponse;
use crate::http::handler_frontend::decks::schema::ListDeckCardsResponse;
use crate::http::handler_frontend::decks::schema::ListFormatsResponse;
use crate::http::handler_frontend::decks::schema::ReadDeckCardResponse;
use crate::http::handler_frontend::decks::schema::ReadDeckUrlRequest;
use crate::http::handler_frontend::decks::schema::ReadDeckUrlResponse;
use crate::http::handler_frontend::decks::schema::ReturnAllDeckCardsRequest;
use crate::http::handler_frontend::decks::schema::ReturnAllDeckCardsResponse;
use crate::http::handler_frontend::decks::schema::ReturnDeckCardsRequest;
use crate::http::handler_frontend::decks::schema::RotateDeckShareTokenResponse;
use crate::http::handler_frontend::decks::schema::SetDeckBracketRequest;
use crate::http::handler_frontend::decks::schema::SetDeckColorsRequest;
use crate::http::handler_frontend::decks::schema::SetDeckFolderRequest;
use crate::http::handler_frontend::decks::schema::SetDeckRuleZeroRequest;
use crate::http::handler_frontend::decks::schema::SetDeckVisibilityRequest;
use crate::http::handler_frontend::decks::schema::TakeDeckCardsRequest;
use crate::http::handler_frontend::decks::schema::UpdateDeckCardRequest;
use crate::http::handler_frontend::decks::schema::UpdateDeckRequest;
use crate::http::handler_frontend::decks::schema::UpdateDeckTagRequest;
use crate::models::account::Account;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionEntry;
use crate::models::collection::CollectionEntryInsert;
use crate::models::collection::MoveOutcome;
use crate::models::deck::Deck;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckCard;
use crate::models::deck::DeckCardInsert;
use crate::models::deck::DeckCardPatch;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckInsert;
use crate::models::deck::DeckUuid;
use crate::models::deck::DetachOutcome;
use crate::models::deck::drift::DeckDrift;
use crate::models::deck::listing::DeckSummary;
use crate::models::deck::listing::ListedSlot;
use crate::models::deck::sourcing::DeckSourcing;
use crate::models::deck::tag::DeckTag;
use crate::models::deck::tag::DeckTagInsert;
use crate::models::deck::tag::DeckTagUuid;
use crate::models::format::BRACKETS;
use crate::models::format::FORMAT_RULES;
use crate::modules::webauthn::WebauthnModule;
use crate::utils::deck_source::DeckSourceError;
use crate::utils::deck_source::fetch;
use crate::utils::deck_source::parse_deck_url;
use crate::utils::deck_source::parse_share_link;

/// The decks an account owns
#[get("/")]
pub async fn get_all_decks(account: Account) -> ApiResult<ApiJson<Vec<DeckOverviewResponse>>> {
    let mut tx = Database::global().start_transaction().await?;

    let decks = Deck::get_all_for_account(&mut tx, account.uuid).await?;
    let mut summaries = DeckSummary::read_for_account(&mut tx, account.uuid).await?;

    let overviews = decks
        .into_iter()
        .map(|deck| {
            let summary = summaries.remove(&deck.uuid);
            DeckOverviewResponse::new(deck, summary)
        })
        .collect();

    tx.commit().await?;

    Ok(ApiJson(overviews))
}

/// Start keeping the cards that are physically in this deck
///
/// The deck gets a collection of its own. Idempotent, so the client can call it
/// without first asking whether there already is one.
#[post("/{deck}/collection")]
pub async fn attach_deck_collection(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<CollectionResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = match Deck::attach_collection(&mut tx, account.uuid, deck_uuid).await? {
        DeckAccess::Granted(collection) => collection,
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    };

    tx.commit().await?;

    Ok(ApiJson(CollectionResponse::from(collection)))
}

/// Stop keeping them
///
/// Refused while cards are still filed in it: they would otherwise leave the
/// account's inventory without anybody saying where they went.
#[delete("/{deck}/collection")]
pub async fn detach_deck_collection(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Deck::detach_collection(&mut tx, account.uuid, deck_uuid).await? {
        DetachOutcome::Detached => {}
        DetachOutcome::NotEmpty => {
            return Err(ApiError::bad_request("Sort the cards back first"));
        }
        DetachOutcome::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// What the deck asks for, what is in it, and where the rest could come from
#[get("/{deck}/sourcing")]
pub async fn get_deck_sourcing(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<DeckSourcingResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    match Deck::may_administer(&mut tx, deck_uuid, account.uuid).await? {
        DeckAccess::Granted(_) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let collection = Deck::collection(&mut tx, deck_uuid).await?;
    let sourcing = DeckSourcing::read(
        &mut tx,
        account.uuid,
        deck_uuid,
        collection.as_ref().map(|collection| collection.uuid),
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckSourcingResponse::new(sourcing, collection)))
}

/// Where the deck list and the deck's own collection disagree
///
/// Read on its own rather than out of the sourcing answer: the header asks this
/// on every tab of the deck, and it has no use for the whole account's shelf.
#[get("/{deck}/collection/drift")]
pub async fn get_deck_collection_drift(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<DeckDriftResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;

    let collection = Deck::collection(&mut tx, deck_uuid).await?;
    let drift = DeckDrift::read(
        &mut tx,
        deck_uuid,
        collection.as_ref().map(|collection| collection.uuid),
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckDriftResponse::new(drift, collection.is_some())))
}

/// Move copies out of a collection and into the deck
///
/// Where they came from is written down with them, which is what makes taking
/// the deck apart again possible.
#[post("/{deck}/sourcing/take")]
pub async fn take_deck_cards(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(TakeDeckCardsRequest {
        entry,
        quantity,
        slot,
    }): ApiJson<TakeDeckCardsRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Deck::may_administer(&mut tx, deck_uuid, account.uuid).await? {
        DeckAccess::Granted(_) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }
    let Some(collection) = Deck::collection(&mut tx, deck_uuid).await? else {
        return Err(ApiError::bad_request("This deck keeps no collection"));
    };

    let source = CollectionEntry::collection_of(&mut tx, account.uuid, entry)
        .await?
        .ok_or_else(|| ApiError::bad_request("Request was denied"))?;
    if source == collection.uuid {
        return Err(ApiError::bad_request("Those cards are already in the deck"));
    }

    let filed = match CollectionEntry::move_copies(
        &mut tx,
        account.uuid,
        entry,
        quantity,
        collection.uuid,
        Some(source),
    )
    .await?
    {
        MoveOutcome::Moved { filed, .. } => filed,
        MoveOutcome::TooFewCopies => {
            return Err(ApiError::bad_request("The stack does not hold that many"));
        }
        MoveOutcome::Denied => return Err(ApiError::bad_request("Request was denied")),
    };

    // The list follows the cardboard: a slot somebody sourced another edition
    // for now says so, and is split when only part of it was covered.
    if let Some(slot) = slot {
        let foil = filed.finish != CardFinish::Nonfoil;
        match DeckCard::point_at(&mut tx, deck_uuid, slot, filed.printing, foil, quantity).await? {
            DeckAccess::Granted(_) => {}
            DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
        }
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Declare that the deck holds what its list asks for
///
/// Two things at once, because they are the same thing at different sizes: the
/// way in for a deck that arrived from somewhere else, where the list is already
/// right and saying so one card at a time would be an afternoon's work, and the
/// answer to "I bought that one" for a single slot.
///
/// The slots are topped up to what they ask for, in the printing and finish they
/// name, as near mint and without an origin: nothing was taken out of a
/// collection, so there is nowhere to put it back. Sorting them into one later
/// is the same return call with a target.
#[post("/{deck}/sourcing/fill")]
pub async fn fill_deck_collection(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(FillDeckCollectionRequest { slot }): ApiJson<FillDeckCollectionRequest>,
) -> ApiResult<ApiJson<FillDeckCollectionResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    match Deck::may_administer(&mut tx, deck_uuid, account.uuid).await? {
        DeckAccess::Granted(_) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }
    let Some(collection) = Deck::collection(&mut tx, deck_uuid).await? else {
        return Err(ApiError::bad_request("This deck keeps no collection"));
    };

    let sourcing =
        DeckSourcing::read(&mut tx, account.uuid, deck_uuid, Some(collection.uuid)).await?;

    let mut filed = 0;
    for slot in sourcing
        .slots
        .into_iter()
        .filter(|listed| slot.is_none_or(|wanted| wanted == listed.uuid))
    {
        let finish = if slot.foil {
            CardFinish::Foil
        } else {
            CardFinish::Nonfoil
        };
        // Only what the deck is short of: a slot somebody already sourced out of
        // a collection keeps the copies it has, origin and all.
        let held: i32 = sourcing
            .filed
            .iter()
            .filter(|stack| stack.printing == slot.printing && stack.finish == finish)
            .map(|stack| stack.quantity)
            .sum();
        let short = slot.quantity - held;
        if short < 1 {
            continue;
        }

        CollectionEntry::file_into(
            &mut tx,
            collection.uuid,
            CollectionEntryInsert {
                printing: slot.printing,
                quantity: short,
                condition: CardCondition::NearMint,
                finish,
                purchase_price_cents: None,
                acquired_at: None,
            },
            None,
        )
        .await?;
        filed += u32::try_from(short).unwrap_or(0);
    }

    tx.commit().await?;

    Ok(ApiJson(FillDeckCollectionResponse { filed }))
}

/// Sort copies out of the deck back into a collection
#[post("/{deck}/sourcing/return")]
pub async fn return_deck_cards(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(ReturnDeckCardsRequest {
        entry,
        quantity,
        target,
    }): ApiJson<ReturnDeckCardsRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Deck::may_administer(&mut tx, deck_uuid, account.uuid).await? {
        DeckAccess::Granted(_) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }
    let Some(collection) = Deck::collection(&mut tx, deck_uuid).await? else {
        return Err(ApiError::bad_request("This deck keeps no collection"));
    };

    let stack = CollectionEntry::get(&mut tx, collection.uuid, entry)
        .await?
        .ok_or_else(|| ApiError::bad_request("Request was denied"))?;
    // Where they came from, unless the client names somewhere else — which it
    // has to for cards that were bought straight into the deck.
    let into = target
        .or(stack.origin)
        .ok_or_else(|| ApiError::bad_request("Say which collection they go into"))?;

    match CollectionEntry::move_copies(&mut tx, account.uuid, entry, quantity, into, None).await? {
        MoveOutcome::Moved { .. } => {}
        MoveOutcome::TooFewCopies => {
            return Err(ApiError::bad_request("The stack does not hold that many"));
        }
        MoveOutcome::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Sort everything in the deck back where it came from
///
/// This is what taking a deck apart does. Stacks that remember no origin only
/// move when the client says where they should go; otherwise they stay, and the
/// answer says how many that was.
#[post("/{deck}/sourcing/return-all")]
pub async fn return_all_deck_cards(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(ReturnAllDeckCardsRequest { target }): ApiJson<ReturnAllDeckCardsRequest>,
) -> ApiResult<ApiJson<ReturnAllDeckCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    match Deck::may_administer(&mut tx, deck_uuid, account.uuid).await? {
        DeckAccess::Granted(_) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }
    let Some(collection) = Deck::collection(&mut tx, deck_uuid).await? else {
        return Err(ApiError::bad_request("This deck keeps no collection"));
    };

    let stacks =
        CollectionEntry::get_all_in_collection(&mut tx, account.uuid, collection.uuid).await?;

    let mut returned = 0;
    let mut left = 0;
    for stack in stacks {
        let Some(into) = stack.origin.or(target) else {
            left += 1;
            continue;
        };
        match CollectionEntry::move_copies(
            &mut tx,
            account.uuid,
            stack.uuid,
            stack.quantity,
            into,
            None,
        )
        .await?
        {
            MoveOutcome::Moved { .. } => returned += 1,
            // The collection a stack remembers can be gone by now; that is not a
            // reason to abandon the rest of the deck.
            MoveOutcome::Denied | MoveOutcome::TooFewCopies => left += 1,
        }
    }

    tx.commit().await?;

    Ok(ApiJson(ReturnAllDeckCardsResponse { returned, left }))
}

/// File a deck into one of the account's folders
///
/// `null` takes it off every shelf. Putting a deck away is this call with the
/// archive, which is the folder [`crate::http::handler_frontend::folders`]
/// hands out alongside the account's own.
#[post("/{deck}/folder")]
pub async fn set_deck_folder(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(SetDeckFolderRequest { folder }): ApiJson<SetDeckFolderRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Deck::set_folder(&mut tx, account.uuid, deck_uuid, folder).await? {
        DeckAccess::Granted(_) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
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

/// Record the house rules the deck is played under
///
/// Beyond a deck size that would hold no cards, nothing is checked: what a
/// table agreed to is a claim its builder makes, and the client says where the
/// claim and the cards disagree.
#[put("/{deck}/rule-zero")]
pub async fn set_deck_rule_zero(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(request): ApiJson<SetDeckRuleZeroRequest>,
) -> ApiResult<ApiJson<()>> {
    if request.deck_size.is_some_and(|cards| cards < 1) {
        return Err(ApiError::bad_request("A deck holds at least one card"));
    }

    let mut tx = Database::global().start_transaction().await?;

    granted(
        Deck::set_rule_zero(
            &mut tx,
            account.uuid,
            deck_uuid,
            request.allow_extra_commanders,
            request.allow_duplicates,
            request.allow_banned,
            request.deck_size,
        )
        .await?,
    )?;

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
///
/// Copies of a print already sitting in the zone (same finish) fold into that
/// slot instead of opening a second row beside it. The answer is the slot's
/// bookkeeping fields either way — catalog data and tags come from the list
/// endpoint.
#[post("/{deck}/cards")]
pub async fn add_deck_card(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    ApiJson(AddDeckCardRequest {
        printing,
        quantity,
        zone,
        foil,
    }): ApiJson<AddDeckCardRequest>,
) -> ApiResult<ApiJson<DeckCardResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;

    if quantity < 1 {
        return Err(ApiError::bad_request("A slot holds at least one copy"));
    }

    let card = DeckCard::add_folded(
        &mut tx,
        deck_uuid,
        DeckCardInsert {
            printing,
            quantity,
            zone,
            foil: foil.unwrap_or(false),
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckCardResponse {
        uuid: card.uuid,
        printing: card.printing,
        quantity: card.quantity,
        zone: card.zone,
        foil: card.foil,
        card: None,
        tags: Vec::new(),
    }))
}

/// Read a decklist off a link to another builder, or off one of our own share links
///
/// Only the sites this knows are fetched, and only through a url composed here
/// from the deck's id — the link is read, never followed. A link to this
/// instance is not fetched at all: it is resolved against the database, which
/// is what lets a shared deck come back with the print of every card.
#[post("/import/url")]
pub async fn read_deck_url(
    _account: Account,
    ApiJson(ReadDeckUrlRequest { url }): ApiJson<ReadDeckUrlRequest>,
) -> ApiResult<ApiJson<ReadDeckUrlResponse>> {
    let host = WebauthnModule::global()
        .public_origin
        .host_str()
        .unwrap_or_default()
        .to_owned();
    if let Some(token) = parse_share_link(&url, &host) {
        return read_shared_deck(&token).await;
    }

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
                foil: card.foil,
                zone: card.zone,
            })
            .collect(),
    }))
}

/// Read a decklist off a share link pointing at this instance
///
/// The token is the authorization, exactly as it is when the deck is read
/// through the shared routes. Slots the catalog does not know are dropped:
/// what comes back is looked up by name and print on the way in, and a card
/// without either cannot be.
async fn read_shared_deck(token: &str) -> ApiResult<ApiJson<ReadDeckUrlResponse>> {
    let token = MaxStr::new(token.to_owned())
        .map_err(|_| ApiError::bad_request("Unsupported deck link"))?;

    let mut tx = Database::global().start_transaction().await?;

    let deck = Deck::get_by_share_token(&mut tx, &token)
        .await?
        .ok_or_else(|| ApiError::bad_request("Unsupported deck link"))?;
    let slots = ListedSlot::read_deck(&mut tx, deck.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ReadDeckUrlResponse {
        name: deck.name.into_inner(),
        format: Some(deck.format.into_inner()),
        cards: slots
            .into_iter()
            .filter_map(|slot| {
                let card = slot.card?;
                Some(ReadDeckCardResponse {
                    quantity: slot.quantity,
                    name: card.name,
                    set_code: Some(card.set_code),
                    collector_number: Some(card.collector_number),
                    foil: slot.foil,
                    zone: slot.zone,
                })
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
            foil: card.foil.unwrap_or(false),
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
                foil: request.foil,
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
        icon,
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
            icon,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckTagResponse::from(tag)))
}

/// Rename a tag, change its marker or move its scope
#[put("/{deck}/tags/{tag}")]
pub async fn update_deck_tag(
    account: Account,
    Path((deck_uuid, tag_uuid)): Path<(DeckUuid, DeckTagUuid)>,
    ApiJson(UpdateDeckTagRequest {
        name,
        color,
        icon,
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
            icon,
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
