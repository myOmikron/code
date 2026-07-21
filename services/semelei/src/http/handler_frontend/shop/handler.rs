//! Handlers of the public shop endpoints

use std::collections::HashMap;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::http::header::CACHE_CONTROL;
use galvyn::core::re_exports::axum::http::header::CONTENT_TYPE;
use galvyn::core::re_exports::axum::http::header::HeaderName;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use time::Date;
use time::OffsetDateTime;
use time::Weekday;

use crate::http::handler_frontend::shop::schema::CreateOrderRequest;
use crate::http::handler_frontend::shop::schema::CreateOrderResponse;
use crate::http::handler_frontend::shop::schema::ListCategoriesResponse;
use crate::http::handler_frontend::shop::schema::ListItemsResponse;
use crate::http::handler_frontend::shop::schema::PublicCategory;
use crate::http::handler_frontend::shop::schema::PublicItem;
use crate::http::handler_frontend::shop::schema::PublicOrder;
use crate::http::handler_frontend::shop::schema::PublicOrderPosition;
use crate::models::Category;
use crate::models::Item;
use crate::models::ItemUuid;
use crate::models::Order;
use crate::models::OrderInsert;
use crate::models::OrderItem;
use crate::models::OrderPositionInsert;
use crate::models::OrderStatus;

/// Maximum number of positions per order
const MAX_POSITIONS: usize = 100;
/// Maximum quantity per position
const MAX_QUANTITY: u32 = 99;

/// The Saturday all open orders are picked up on
///
/// Orders placed on a Saturday go to the following week.
/// A ±1 day timezone edge around midnight is acceptable here.
fn next_pickup_date() -> Date {
    OffsetDateTime::now_utc()
        .date()
        .next_occurrence(Weekday::Saturday)
}

/// List all categories
#[get("/categories")]
pub async fn get_categories() -> ApiResult<ApiJson<ListCategoriesResponse>> {
    let categories = Category::get_all(Database::global()).await?;
    Ok(ApiJson(ListCategoriesResponse {
        categories: categories
            .into_iter()
            .map(|c| PublicCategory {
                uuid: c.uuid,
                name: c.name.to_string(),
            })
            .collect(),
    }))
}

/// List all currently orderable items
#[get("/items")]
pub async fn get_items() -> ApiResult<ApiJson<ListItemsResponse>> {
    let items = Item::get_active(Database::global()).await?;
    Ok(ApiJson(ListItemsResponse {
        items: items
            .into_iter()
            .map(|i| PublicItem {
                uuid: i.uuid,
                name: i.name.to_string(),
                price_cents: i.price_cents,
                additional_info: i.additional_info.map(|info| info.to_string()),
                category: i.category,
                image_version: (i.image_version != 0).then_some(i.image_version),
            })
            .collect(),
    }))
}

/// Serve an item's product photo
///
/// The url carries the image version, so the response is immutable.
#[get("/items/{uuid}/image")]
pub async fn get_item_image(
    Path(uuid): Path<ItemUuid>,
) -> ApiResult<([(HeaderName, &'static str); 2], Vec<u8>)> {
    let image = Item::get_image(Database::global(), uuid)
        .await?
        .ok_or(ApiError::bad_request("Unknown item"))?
        .ok_or(ApiError::bad_request("Item has no image"))?;
    Ok((
        [
            (CONTENT_TYPE, "image/jpeg"),
            (CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        image,
    ))
}

/// Place a pre-order
///
/// Customers need no account: name plus phone or email is enough.
/// The pickup date is not chosen by the customer — every order is
/// for the next Saturday.
#[post("/orders")]
pub async fn create_order(
    ApiJson(request): ApiJson<CreateOrderRequest>,
) -> ApiResult<ApiJson<CreateOrderResponse>> {
    if request.customer_name.trim().is_empty() {
        return Err(ApiError::bad_request("Name must not be empty"));
    }
    let phone = request.phone.filter(|p| !p.trim().is_empty());
    let email = request.email.filter(|e| !e.trim().is_empty());
    if phone.is_none() && email.is_none() {
        return Err(ApiError::bad_request("Provide a phone number or an email"));
    }
    if request.items.is_empty() {
        return Err(ApiError::bad_request("Order must contain items"));
    }
    if request.items.len() > MAX_POSITIONS {
        return Err(ApiError::bad_request("Too many positions"));
    }
    if request
        .items
        .iter()
        .any(|p| p.quantity == 0 || p.quantity > MAX_QUANTITY)
    {
        return Err(ApiError::bad_request("Invalid quantity"));
    }
    let pickup_date = next_pickup_date();

    let mut tx = Database::global().start_transaction().await?;

    // Load all referenced items and reject unknown or inactive ones
    let mut catalog: HashMap<ItemUuid, Item> = HashMap::new();
    for position in &request.items {
        if catalog.contains_key(&position.item) {
            continue;
        }
        let item = Item::get_by_uuid(&mut tx, position.item)
            .await?
            .filter(|item| item.active)
            .ok_or(ApiError::bad_request("Order contains an unknown item"))?;
        catalog.insert(item.uuid, item);
    }

    let customer_name = request.customer_name.to_string();
    let note = request.note.as_ref().map(|n| n.to_string());
    let pickup_code = Order::create(
        &mut tx,
        OrderInsert {
            customer_name: request.customer_name,
            phone,
            email,
            pickup_date,
            note: request.note,
        },
        request
            .items
            .iter()
            .map(|p| OrderPositionInsert {
                item: catalog[&p.item].clone(),
                quantity: i64::from(p.quantity),
            })
            .collect(),
    )
    .await?
    .ok_or(ApiError::server_error("Failed to generate a pickup code"))?;

    tx.commit().await?;

    let positions: Vec<PublicOrderPosition> = request
        .items
        .iter()
        .map(|p| {
            let item = &catalog[&p.item];
            PublicOrderPosition {
                name: item.name.to_string(),
                quantity: i64::from(p.quantity),
                price_cents: item.price_cents,
            }
        })
        .collect();
    let total_cents = positions.iter().map(|p| p.price_cents * p.quantity).sum();

    let order = PublicOrder {
        pickup_code: pickup_code.to_string(),
        status: OrderStatus::Open,
        pickup_date: SchemaDate(pickup_date),
        customer_name,
        note,
        positions,
        total_cents,
    };

    Ok(ApiJson(CreateOrderResponse {
        pickup_code: pickup_code.to_string(),
        order,
    }))
}

/// Get an order by its pickup code
///
/// Deliberately does not echo phone/email: the code is a weak bearer
/// secret, so a guessed code must not leak contact data.
#[get("/orders/{pickup_code}")]
pub async fn get_order(Path(pickup_code): Path<String>) -> ApiResult<ApiJson<PublicOrder>> {
    let pickup_code =
        MaxStr::<16>::new(pickup_code).map_err(|_| ApiError::bad_request("Invalid pickup code"))?;

    let mut tx = Database::global().start_transaction().await?;

    let order = Order::get_by_pickup_code(&mut tx, &pickup_code)
        .await?
        .ok_or(ApiError::bad_request("Unknown pickup code"))?;

    let positions = OrderItem::get_by_order(&mut tx, order.uuid).await?;

    tx.commit().await?;

    let positions: Vec<PublicOrderPosition> = positions
        .into_iter()
        .map(|p| PublicOrderPosition {
            name: p.name.to_string(),
            quantity: p.quantity,
            price_cents: p.price_cents,
        })
        .collect();
    let total_cents = positions.iter().map(|p| p.price_cents * p.quantity).sum();

    Ok(ApiJson(PublicOrder {
        pickup_code: order.pickup_code.to_string(),
        status: order.status,
        pickup_date: SchemaDate(order.pickup_date),
        customer_name: order.customer_name.to_string(),
        note: order.note.map(|n| n.to_string()),
        positions,
        total_cents,
    }))
}
