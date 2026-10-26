//! Web Push subscriptions: the devices an Account gets pushes on
//!
//! An Account subscribes each of its devices on its own. Tournament pushes
//! go to every device of an Account unless it turned them off in its
//! settings; nothing here sends mail.

use galvyn::core::Module;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::db::AccountModel;
use crate::models::push::db::PushSubscriptionInsertPatch;
use crate::models::push::db::PushSubscriptionModel;
use crate::models::push::message::TournamentPush;
use crate::modules::web_push::PushDevice;
use crate::modules::web_push::WebPush;

pub(in crate::models) mod db;
pub mod message;

/// The longest push service endpoint a device may subscribe with, in bytes
pub const ENDPOINT_MAX_LEN: usize = 2048;

/// The language a device's pushes are written in
///
/// The one its app showed when it subscribed: the text has to be readable
/// on the lock screen, without asking the service for anything.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum PushLanguage {
    /// German, the app's primary language
    #[default]
    De,
    /// English
    En,
}
custom_db_enum! {
    enum: PushLanguage,
    variants: [De, En],
    decoder: PushLanguageDecoder,
}

/// What a device hands over when it subscribes, as its browser reports it
#[derive(Debug, Clone)]
pub struct NewPushSubscription {
    /// Where pushes for the device are posted
    pub endpoint: MaxStr<{ ENDPOINT_MAX_LEN }>,
    /// The device's P-256 public key, base64url
    pub p256dh: MaxStr<128>,
    /// The device's authentication secret, base64url
    pub auth: MaxStr<64>,
    /// The language its pushes are written in
    pub language: PushLanguage,
}

/// Wrapper for the primary key of a push subscription
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PushSubscriptionUuid(Uuid);

impl PushSubscriptionUuid {
    /// Wrap any uuid, for tests that need a subscription id
    #[cfg(test)]
    pub fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// The devices of Accounts and whether they want tournament pushes
pub struct PushSubscription;

impl PushSubscription {
    /// Subscribe a device for `account`
    ///
    /// A device already subscribed, for any Account, is taken over: the
    /// endpoint belongs to whoever is logged in on it now.
    #[instrument(name = "PushSubscription::subscribe", skip(tx, device))]
    pub async fn subscribe(
        tx: &mut Transaction,
        account: AccountUuid,
        device: NewPushSubscription,
    ) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, PushSubscriptionModel)
            .condition(PushSubscriptionModel.endpoint.equals(&*device.endpoint))
            .await?;
        rorm::insert(&mut *tx, PushSubscriptionModel)
            .return_nothing()
            .single(&PushSubscriptionInsertPatch {
                uuid: Uuid::now_v7(),
                account: ForeignModelByField(account.into_inner()),
                endpoint: device.endpoint,
                p256dh: device.p256dh,
                auth: device.auth,
                language: device.language,
            })
            .await?;
        Ok(())
    }

    /// Unsubscribe one of `account`'s devices; false if it was none of its
    #[instrument(name = "PushSubscription::unsubscribe", skip(tx, endpoint))]
    pub async fn unsubscribe(
        tx: &mut Transaction,
        account: AccountUuid,
        endpoint: &str,
    ) -> Result<bool, rorm::Error> {
        let removed = rorm::delete(&mut *tx, PushSubscriptionModel)
            .condition(rorm::and![
                PushSubscriptionModel.endpoint.equals(endpoint),
                PushSubscriptionModel.account.equals(account.into_inner()),
            ])
            .await?;
        Ok(removed > 0)
    }

    /// Whether the device at `endpoint` is subscribed for `account`
    #[instrument(name = "PushSubscription::is_subscribed", skip(tx, endpoint))]
    pub async fn is_subscribed(
        tx: &mut Transaction,
        account: AccountUuid,
        endpoint: &str,
    ) -> Result<bool, rorm::Error> {
        Ok(rorm::query(&mut *tx, PushSubscriptionModel.uuid)
            .condition(rorm::and![
                PushSubscriptionModel.endpoint.equals(endpoint),
                PushSubscriptionModel.account.equals(account.into_inner()),
            ])
            .optional()
            .await?
            .is_some())
    }

    /// Drop a subscription its push service reported gone
    #[instrument(name = "PushSubscription::forget", skip(tx))]
    pub async fn forget(
        tx: &mut Transaction,
        subscription: PushSubscriptionUuid,
    ) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, PushSubscriptionModel)
            .condition(PushSubscriptionModel.uuid.equals(subscription.0))
            .await?;
        Ok(())
    }

    /// Whether `account` gets tournament pushes
    #[instrument(name = "PushSubscription::tournament_pushes", skip(tx))]
    pub async fn tournament_pushes(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<bool, rorm::Error> {
        Ok(rorm::query(&mut *tx, AccountModel.tournament_pushes)
            .condition(AccountModel.uuid.equals(account.into_inner()))
            .optional()
            .await?
            .unwrap_or(false))
    }

    /// Turn tournament pushes on or off for every device of `account`
    #[instrument(name = "PushSubscription::set_tournament_pushes", skip(tx))]
    pub async fn set_tournament_pushes(
        tx: &mut Transaction,
        account: AccountUuid,
        enabled: bool,
    ) -> Result<(), rorm::Error> {
        rorm::update(&mut *tx, AccountModel)
            .set(AccountModel.tournament_pushes, enabled)
            .condition(AccountModel.uuid.equals(account.into_inner()))
            .await?;
        Ok(())
    }

    /// Push each Account its tournament push, on every device it subscribed
    ///
    /// Accounts that turned tournament pushes off get nothing. The pushes
    /// leave through [`WebPush`] and are on their way when this returns.
    #[instrument(name = "PushSubscription::push_tournament", skip_all)]
    pub async fn push_tournament(
        tx: &mut Transaction,
        pushes: &[(AccountUuid, TournamentPush)],
    ) -> Result<(), rorm::Error> {
        if pushes.is_empty() {
            return Ok(());
        }
        let devices = rorm::query(&mut *tx, PushSubscriptionModel)
            .condition(rorm::and![
                PushSubscriptionModel.account.tournament_pushes.equals(true),
                DynamicCollection::or_unchecked(
                    pushes
                        .iter()
                        .map(|(account, _)| {
                            PushSubscriptionModel.account.equals(account.into_inner())
                        })
                        .collect(),
                ),
            ])
            .all()
            .await?;
        for device in devices {
            let ForeignModelByField(account) = device.account;
            for (_, push) in pushes.iter().filter(|(to, _)| to.into_inner() == account) {
                WebPush::global().send(
                    PushDevice {
                        subscription: PushSubscriptionUuid(device.uuid),
                        endpoint: device.endpoint.to_string(),
                        p256dh: device.p256dh.to_string(),
                        auth: device.auth.to_string(),
                    },
                    push.render(device.language),
                );
            }
        }
        Ok(())
    }
}
