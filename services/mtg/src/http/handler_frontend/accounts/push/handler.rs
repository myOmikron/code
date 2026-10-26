use galvyn::core::Module;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use url::Url;

use crate::http::handler_frontend::accounts::push::schema::PushDeviceRequest;
use crate::http::handler_frontend::accounts::push::schema::PushDeviceResponse;
use crate::http::handler_frontend::accounts::push::schema::PushSettingsResponse;
use crate::http::handler_frontend::accounts::push::schema::SetPushSettingsRequest;
use crate::http::handler_frontend::accounts::push::schema::SubscribePushDeviceErrors;
use crate::http::handler_frontend::accounts::push::schema::SubscribePushDeviceRequest;
use crate::models::account::Account;
use crate::models::push::NewPushSubscription;
use crate::models::push::PushSubscription;
use crate::modules::web_push::WebPush;

/// The logged-in account's push settings and the key its devices subscribe with
#[get("/me/push")]
pub async fn get_push_settings(account: Account) -> ApiResult<ApiJson<PushSettingsResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let tournament_pushes = PushSubscription::tournament_pushes(&mut tx, account.uuid).await?;
    tx.commit().await?;

    Ok(ApiJson(PushSettingsResponse {
        public_key: WebPush::global().public_key().map(str::to_string),
        tournament_pushes,
    }))
}

/// Turn tournament pushes on or off for every device of the logged-in account
#[put("/me/push")]
pub async fn set_push_settings(
    account: Account,
    ApiJson(request): ApiJson<SetPushSettingsRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    PushSubscription::set_tournament_pushes(&mut tx, account.uuid, request.tournament_pushes)
        .await?;
    tx.commit().await?;
    Ok(ApiJson(()))
}

/// Subscribe this device to the logged-in account's pushes
///
/// A device subscribed for another account before gets this one's pushes
/// from now on.
#[post("/me/push/devices")]
pub async fn subscribe_push_device(
    account: Account,
    ApiJson(request): ApiJson<SubscribePushDeviceRequest>,
) -> ApiResult<ApiJson<()>, SubscribePushDeviceErrors> {
    if !Url::parse(&request.endpoint).is_ok_and(|endpoint| endpoint.scheme() == "https") {
        let mut errors = FormErrors::<SubscribePushDeviceErrors>::new();
        errors.invalid_endpoint = true;
        return errors.fail();
    }

    let mut tx = Database::global().start_transaction().await?;
    PushSubscription::subscribe(
        &mut tx,
        account.uuid,
        NewPushSubscription {
            endpoint: request.endpoint,
            p256dh: request.p256dh,
            auth: request.auth,
            language: request.language,
        },
    )
    .await?;
    tx.commit().await?;
    Ok(ApiJson(()))
}

/// Unsubscribe one of the logged-in account's devices; a device that is none of its is left alone
#[post("/me/push/devices/unsubscribe")]
pub async fn unsubscribe_push_device(
    account: Account,
    ApiJson(request): ApiJson<PushDeviceRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    PushSubscription::unsubscribe(&mut tx, account.uuid, &request.endpoint).await?;
    tx.commit().await?;
    Ok(ApiJson(()))
}

/// Whether a device gets the logged-in account's pushes
///
/// The browser knows it has a subscription, not whose it is: another
/// account may have taken the device over since.
#[post("/me/push/devices/check")]
pub async fn check_push_device(
    account: Account,
    ApiJson(request): ApiJson<PushDeviceRequest>,
) -> ApiResult<ApiJson<PushDeviceResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let subscribed =
        PushSubscription::is_subscribed(&mut tx, account.uuid, &request.endpoint).await?;
    tx.commit().await?;
    Ok(ApiJson(PushDeviceResponse { subscribed }))
}
