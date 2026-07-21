//! Handlers of the staff order endpoints

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::get;
use galvyn::patch;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;

use crate::http::handler_frontend::orders::schema::FullOrder;
use crate::http::handler_frontend::orders::schema::FullOrderPosition;
use crate::http::handler_frontend::orders::schema::ListOrdersQuery;
use crate::http::handler_frontend::orders::schema::ListOrdersResponse;
use crate::http::handler_frontend::orders::schema::UpdateOrderItemPackedRequest;
use crate::http::handler_frontend::orders::schema::UpdateOrderStatusRequest;
use crate::models::Order;
use crate::models::OrderItem;
use crate::models::OrderItemUuid;
use crate::models::OrderUuid;

/// Convert an [`Order`] and its positions into the staff schema
async fn full_order(exe: impl Executor<'_>, order: Order) -> ApiResult<FullOrder> {
    let positions: Vec<FullOrderPosition> = OrderItem::get_by_order(exe, order.uuid)
        .await?
        .into_iter()
        .map(|p| FullOrderPosition {
            uuid: p.uuid,
            name: p.name.to_string(),
            quantity: p.quantity,
            price_cents: p.price_cents,
            packed: p.packed,
        })
        .collect();
    let total_cents = positions.iter().map(|p| p.price_cents * p.quantity).sum();

    Ok(FullOrder {
        uuid: order.uuid,
        pickup_code: order.pickup_code.to_string(),
        status: order.status,
        pickup_date: SchemaDate(order.pickup_date),
        customer_name: order.customer_name.to_string(),
        phone: order.phone.map(|p| p.to_string()),
        email: order.email.map(|e| e.to_string()),
        note: order.note.map(|n| n.to_string()),
        positions,
        total_cents,
        created_at: SchemaDateTime(order.created_at),
    })
}

/// List orders, optionally filtered by status and pickup date
#[get("/orders")]
pub async fn list_orders(
    Query(filter): Query<ListOrdersQuery>,
) -> ApiResult<ApiJson<ListOrdersResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    // Filters are optional — fetch and filter in process, village-shop scale.
    let orders = Order::get_all(&mut tx).await?;

    let mut result = Vec::new();
    for order in orders {
        if let Some(status) = filter.status
            && order.status != status
        {
            continue;
        }
        if let Some(SchemaDate(date)) = filter.pickup_date
            && order.pickup_date != date
        {
            continue;
        }
        result.push(full_order(&mut tx, order).await?);
    }
    tx.commit().await?;

    // Earliest pickup first, then oldest order first
    result
        .sort_by(|a, b| (a.pickup_date.0, a.created_at.0).cmp(&(b.pickup_date.0, b.created_at.0)));

    Ok(ApiJson(ListOrdersResponse { orders: result }))
}

/// Get a single order
#[get("/orders/{uuid}")]
pub async fn get_order_detail(Path(uuid): Path<OrderUuid>) -> ApiResult<ApiJson<FullOrder>> {
    let mut tx = Database::global().start_transaction().await?;
    let order = Order::get_by_uuid(&mut tx, uuid)
        .await?
        .ok_or(ApiError::bad_request("Unknown order"))?;
    let full = full_order(&mut tx, order).await?;
    tx.commit().await?;
    Ok(ApiJson(full))
}

/// Change an order's status
///
/// Allowed transitions: `Open -> Ready -> PickedUp`; `Open | Ready -> Cancelled`.
#[patch("/orders/{uuid}")]
pub async fn update_order_status(
    Path(uuid): Path<OrderUuid>,
    ApiJson(request): ApiJson<UpdateOrderStatusRequest>,
) -> ApiResult<ApiJson<FullOrder>> {
    let mut tx = Database::global().start_transaction().await?;

    let mut order = Order::get_by_uuid(&mut tx, uuid)
        .await?
        .ok_or(ApiError::bad_request("Unknown order"))?;

    if !order.status.can_transition_to(request.status) {
        return Err(ApiError::bad_request("Invalid status transition"));
    }

    Order::set_status(&mut tx, uuid, request.status).await?;
    order.status = request.status;

    let full = full_order(&mut tx, order).await?;
    tx.commit().await?;
    Ok(ApiJson(full))
}

/// Change a position's packed flag (packing list checkbox)
#[patch("/order-items/{uuid}")]
pub async fn update_order_item_packed(
    Path(uuid): Path<OrderItemUuid>,
    ApiJson(request): ApiJson<UpdateOrderItemPackedRequest>,
) -> ApiResult<()> {
    if !OrderItem::set_packed(Database::global(), uuid, request.packed).await? {
        return Err(ApiError::bad_request("Unknown order item"));
    }
    Ok(())
}
