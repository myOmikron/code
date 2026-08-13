use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::field;
use galvyn::rorm::prelude::BackRef;
use time::Date;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::models::order::db::OrderModel;

/// A pickup date and everything the shop decided about it
///
/// Only dates somebody touched have a row: the recurring rule in
/// [`ShopSettings`](crate::models::ShopSettings) produces the dates, this
/// table stores the deviations from it and the lock state.
#[derive(Model, Debug)]
#[rorm(rename = "pickupday")]
pub struct PickupDayModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The date the recurring rule produced
    ///
    /// The anchor, not the effective date: moving a pickup day must not make
    /// the rule generate the original date again.
    #[rorm(unique)]
    pub rule_date: Date,

    /// The date orders are actually picked up on
    #[rorm(unique)]
    pub pickup_date: Date,

    /// The point in time orders close — no new orders, no cancellations
    pub deadline_at: OffsetDateTime,

    /// Whether the pickup day was called off
    pub closed: bool,

    /// When the day was frozen (by the deadline job or an admin)
    pub locked_at: Option<OffsetDateTime>,

    /// When the confirmation mails for this day went out
    ///
    /// Separate from `locked_at` so a crash between freezing and sending
    /// does not silently swallow the mails.
    pub confirmations_sent_at: Option<OffsetDateTime>,

    /// The orders placed for this day
    pub orders: BackRef<field!(OrderModel.pickup_day)>,

    /// The point in time the row was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`PickupDayModel`]
#[derive(Patch)]
#[rorm(model = "PickupDayModel")]
pub struct PickupDayInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The date the recurring rule produced
    pub rule_date: Date,
    /// The date orders are actually picked up on
    pub pickup_date: Date,
    /// The point in time orders close
    pub deadline_at: OffsetDateTime,
    /// Whether the pickup day was called off
    pub closed: bool,
}
