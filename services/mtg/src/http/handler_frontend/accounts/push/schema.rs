use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::push::ENDPOINT_MAX_LEN;
use crate::models::push::PushLanguage;

/// The account's push settings and what a device subscribes with
#[derive(Serialize, JsonSchema)]
pub struct PushSettingsResponse {
    /// The public VAPID key to pass to `PushManager.subscribe`, `None` while the service sends no pushes
    pub public_key: Option<String>,
    /// Whether the account's devices get tournament pushes
    pub tournament_pushes: bool,
}

/// Changes the account's push settings
#[derive(Deserialize, JsonSchema)]
pub struct SetPushSettingsRequest {
    /// Whether the account's devices get tournament pushes
    pub tournament_pushes: bool,
}

/// A device's push subscription, as `PushSubscription.toJSON()` reports it
#[derive(Deserialize, JsonSchema)]
pub struct SubscribePushDeviceRequest {
    /// Where pushes for the device are posted
    pub endpoint: MaxStr<{ ENDPOINT_MAX_LEN }>,
    /// The device's P-256 public key, base64url
    pub p256dh: MaxStr<128>,
    /// The device's authentication secret, base64url
    pub auth: MaxStr<64>,
    /// The language the app shows on the device, which its pushes are written in
    pub language: PushLanguage,
}

/// Why a device could not subscribe
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct SubscribePushDeviceErrors {
    /// The endpoint is no https url
    pub invalid_endpoint: bool,
}

/// Names one device by its push endpoint
#[derive(Deserialize, JsonSchema)]
pub struct PushDeviceRequest {
    /// The device's push endpoint
    pub endpoint: MaxStr<{ ENDPOINT_MAX_LEN }>,
}

/// Whether a device is subscribed for the account
#[derive(Serialize, JsonSchema)]
pub struct PushDeviceResponse {
    /// True if the device gets this account's pushes
    pub subscribed: bool,
}
