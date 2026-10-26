//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::push::ENDPOINT_MAX_LEN;
use crate::models::push::PushLanguage;

/// One device an Account subscribed to Web Push
///
/// The endpoint names the device at its browser's push service, so it is
/// unique: a device that subscribes again, for this or another Account,
/// replaces its row.
#[derive(Model, Debug, Clone)]
#[rorm(rename = "push_subscription")]
pub struct PushSubscriptionModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Account the device belongs to; its Deletion takes the device along
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<AccountModel>,

    /// Where pushes for the device are posted
    #[rorm(unique)]
    pub endpoint: MaxStr<{ ENDPOINT_MAX_LEN }>,

    /// The device's P-256 public key, base64url
    pub p256dh: MaxStr<128>,

    /// The device's authentication secret, base64url
    pub auth: MaxStr<64>,

    /// The language the device shows the app in, which pushes are written in
    pub language: PushLanguage,

    /// The point in time the device subscribed
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`PushSubscriptionModel`]
#[derive(Patch)]
#[rorm(model = "PushSubscriptionModel")]
pub struct PushSubscriptionInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Account the device belongs to
    pub account: ForeignModel<AccountModel>,
    /// Where pushes for the device are posted
    pub endpoint: MaxStr<{ ENDPOINT_MAX_LEN }>,
    /// The device's P-256 public key
    pub p256dh: MaxStr<128>,
    /// The device's authentication secret
    pub auth: MaxStr<64>,
    /// The language pushes are written in
    pub language: PushLanguage,
}
