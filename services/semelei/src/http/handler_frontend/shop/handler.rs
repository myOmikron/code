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
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use tracing::error;
use tracing::info;

use crate::http::handler_frontend::shop::schema::CreateOrderRequest;
use crate::http::handler_frontend::shop::schema::CreateOrderResponse;
use crate::http::handler_frontend::shop::schema::LegalLinks;
use crate::http::handler_frontend::shop::schema::ListCategoriesResponse;
use crate::http::handler_frontend::shop::schema::ListItemsResponse;
use crate::http::handler_frontend::shop::schema::PickupWindowResponse;
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
use crate::models::PickupDay;
use crate::models::ShopSettings;
use crate::utils::mail;
use crate::utils::mail::MailPosition;
use crate::utils::mail::OrderMail;
use crate::utils::schedule;
use crate::utils::validate;

/// Maximum number of positions per order
const MAX_POSITIONS: usize = 100;
/// Maximum quantity per position
const MAX_QUANTITY: u32 = 99;

/// The pickup day customers can currently order for
///
/// The only place the frontend learns the date and the deadline from —
/// computing either in the browser would drift from the server the moment
/// the two disagree about the timezone.
#[get("/pickup")]
pub async fn get_pickup_window() -> ApiResult<ApiJson<PickupWindowResponse>> {
    let now = schedule::now();

    let mut tx = Database::global().start_transaction().await?;
    let days = schedule::upcoming(&mut tx, now, schedule::UPCOMING_DAYS).await?;
    tx.commit().await?;

    let mut open = days.into_iter().filter(|day| day.is_open(now));
    let current = open.next();
    let next = open.next();

    Ok(ApiJson(PickupWindowResponse {
        pickup_date: current.as_ref().map(|day| SchemaDate(day.pickup_date)),
        deadline: current.as_ref().map(|day| SchemaDateTime(day.deadline_at)),
        next_pickup_date: next.map(|day| SchemaDate(day.pickup_date)),
    }))
}

/// The shop's imprint and privacy policy links
///
/// Public and unauthenticated: the footer showing them is on every page,
/// including the ones nobody is logged in for — which is the whole point of
/// an imprint.
#[get("/legal")]
pub async fn get_legal_links() -> ApiResult<ApiJson<LegalLinks>> {
    let settings = ShopSettings::get(Database::global()).await?;
    Ok(ApiJson(LegalLinks {
        imprint_url: settings.imprint_url,
        privacy_url: settings.privacy_url,
    }))
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
/// The pickup date is not chosen by the customer — it is whichever day is
/// currently open, and the order closes with that day's deadline.
#[post("/orders")]
pub async fn create_order(
    ApiJson(request): ApiJson<CreateOrderRequest>,
) -> ApiResult<ApiJson<CreateOrderResponse>> {
    if request.customer_name.trim().is_empty() {
        return Err(ApiError::bad_request("Name must not be empty"));
    }
    // The name is rendered into the confirmation mail, which this anonymous
    // request also chooses the recipient of — a name that can start a new
    // paragraph would let a stranger put their own text into a mail sent from
    // the shop's domain.
    if !validate::is_single_line(&request.customer_name) {
        return Err(ApiError::bad_request("Name must be a single line"));
    }
    let phone = request.phone.filter(|p| !p.trim().is_empty());
    let email = request.email.filter(|e| !e.trim().is_empty());
    if phone.is_none() && email.is_none() {
        return Err(ApiError::bad_request("Provide a phone number or an email"));
    }
    if let Some(phone) = &phone
        && !validate::is_phone_number(phone.trim())
    {
        return Err(ApiError::bad_request("Invalid phone number"));
    }
    // Checked here rather than trusting the form: the address decides where
    // the shop's mail server delivers.
    if let Some(email) = &email
        && !validate::is_bare_email(email.trim())
    {
        return Err(ApiError::bad_request("Invalid email address"));
    }
    if let Some(note) = &request.note
        && !validate::is_plain_text(note)
    {
        return Err(ApiError::bad_request("Note must be plain text"));
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

    let now = schedule::now();
    let mut tx = Database::global().start_transaction().await?;

    // Re-check the deadline against the database, not against whatever the
    // page was showing: a tab left open over the deadline must not slip an
    // order into a day the bakery already ordered for.
    let resolved = schedule::current(&mut tx, now)
        .await?
        .ok_or(ApiError::bad_request("No pickup day is open for orders"))?;
    let pickup_day = schedule::materialize(&mut tx, &resolved).await?;
    if pickup_day.is_locked(now) || pickup_day.closed {
        return Err(ApiError::bad_request(
            "Orders for this pickup day are closed",
        ));
    }

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
            phone: phone.clone(),
            email: email.clone(),
            pickup_day: pickup_day.uuid,
            note: request.note,
            language: request.language,
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

    // The order stands whether or not the mail makes it out — a NATS hiccup
    // must not lose a pre-order the customer already saw confirmed.
    let mail_positions: Vec<MailPosition> = positions
        .iter()
        .map(|p| MailPosition {
            name: p.name.clone(),
            quantity: p.quantity,
            price_cents: p.price_cents,
        })
        .collect();
    if let Err(error) = mail::send_order_received(&OrderMail {
        pickup_code: &pickup_code,
        customer_name: &customer_name,
        email: email.as_deref(),
        language: request.language,
        pickup_date: pickup_day.pickup_date,
        deadline: pickup_day.deadline_at,
        positions: &mail_positions,
    })
    .await
    {
        error!(error = %error, "Failed to queue the order confirmation mail");
    }

    let order = PublicOrder {
        pickup_code: pickup_code.to_string(),
        status: OrderStatus::Open,
        pickup_date: SchemaDate(pickup_day.pickup_date),
        deadline: SchemaDateTime(pickup_day.deadline_at),
        locked: false,
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

    let pickup_day = PickupDay::get_by_uuid(&mut tx, order.pickup_day)
        .await?
        .ok_or(ApiError::server_error("Order without a pickup day"))?;

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
        pickup_date: SchemaDate(pickup_day.pickup_date),
        deadline: SchemaDateTime(pickup_day.deadline_at),
        locked: pickup_day.is_locked(schedule::now()),
        customer_name: order.customer_name.to_string(),
        note: order.note.map(|n| n.to_string()),
        positions,
        total_cents,
    }))
}

/// Cancel an order by its pickup code
///
/// Only until the pickup day's deadline: afterwards the bakery has the order
/// and the customer has to call. The pickup code is a weak bearer secret, so
/// every cancellation is logged — a guessed code cancelling someone else's
/// order should be visible after the fact.
#[post("/orders/{pickup_code}/cancel")]
pub async fn cancel_order(Path(pickup_code): Path<String>) -> ApiResult<ApiJson<PublicOrder>> {
    let pickup_code =
        MaxStr::<16>::new(pickup_code).map_err(|_| ApiError::bad_request("Invalid pickup code"))?;

    let now = schedule::now();
    let mut tx = Database::global().start_transaction().await?;

    let order = Order::get_by_pickup_code(&mut tx, &pickup_code)
        .await?
        .ok_or(ApiError::bad_request("Unknown pickup code"))?;

    let pickup_day = PickupDay::get_by_uuid(&mut tx, order.pickup_day)
        .await?
        .ok_or(ApiError::server_error("Order without a pickup day"))?;

    if pickup_day.is_locked(now) {
        return Err(ApiError::bad_request("This order is already binding"));
    }
    if order.status != OrderStatus::Open {
        return Err(ApiError::bad_request("This order cannot be cancelled"));
    }

    Order::set_status(&mut tx, order.uuid, OrderStatus::Cancelled).await?;

    let positions = OrderItem::get_by_order(&mut tx, order.uuid).await?;

    tx.commit().await?;

    info!(
        order.pickup_code = %order.pickup_code,
        "Order cancelled by the customer"
    );

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
        status: OrderStatus::Cancelled,
        pickup_date: SchemaDate(pickup_day.pickup_date),
        deadline: SchemaDateTime(pickup_day.deadline_at),
        locked: false,
        customer_name: order.customer_name.to_string(),
        note: order.note.map(|n| n.to_string()),
        positions,
        total_cents,
    }))
}
