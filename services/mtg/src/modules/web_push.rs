//! Web Push: hands pushes to the browsers' push services
//!
//! A push goes through a [`PushSender`]. The one mtg runs with signs each
//! request with the VAPID key from the config, encrypts the payload for the
//! device (RFC 8291) and posts it to the device's endpoint (RFC 8030). Tests
//! run with a sender that records the pushes instead. Without a VAPID key no
//! push leaves the service.
//!
//! Who gets which push is [`crate::models::push`]'s business; this module
//! only delivers.

use std::fmt;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use galvyn::rorm::Database;
use serde::Serialize;
use tracing::debug;
use tracing::warn;
use url::Url;
use web_push_native::Auth;
use web_push_native::WebPushBuilder;
use web_push_native::jwt_simple::algorithms::ECDSAP256PublicKeyLike;
use web_push_native::jwt_simple::algorithms::ES256KeyPair;
use web_push_native::p256::PublicKey;

use crate::models::push::PushSubscription;
use crate::models::push::PushSubscriptionUuid;

/// How long a push service keeps a push for a device that is offline
///
/// A Round paired half a day ago is news nobody needs anymore.
const TIME_TO_LIVE: Duration = Duration::from_secs(12 * 60 * 60);

/// Upper bound on one request to a push service
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// One device a push goes to, as it subscribed
#[derive(Debug, Clone)]
pub struct PushDevice {
    /// The subscription, dropped once its push service reports it gone
    pub subscription: PushSubscriptionUuid,
    /// Where the push is posted
    pub endpoint: String,
    /// The device's P-256 public key, base64url
    pub p256dh: String,
    /// The device's authentication secret, base64url
    pub auth: String,
}

/// What a push shows, the payload the service worker reads
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PushMessage {
    /// The notification's title
    pub title: String,
    /// The notification's text
    pub body: String,
    /// The app path a tap on it opens
    pub url: String,
    /// Pushes with the same tag replace each other on the device
    pub tag: String,
}

/// Delivers pushes
pub trait PushSender: Send + Sync + 'static {
    /// Hand `message` to `device`'s push service
    ///
    /// Returns at once; delivery runs on its own, and a failed one is logged,
    /// never retried.
    fn send(&self, device: PushDevice, message: PushMessage);
}

/// The private VAPID key every push is signed with
///
/// A raw P-256 scalar, base64url without padding. The browsers bind each
/// subscription to its public half: a new key orphans every subscription.
#[derive(Clone)]
pub struct VapidKey(Arc<ES256KeyPair>);

impl VapidKey {
    /// A fresh key
    pub fn generate() -> Self {
        Self(Arc::new(ES256KeyPair::generate()))
    }

    /// The private key, as the config takes it
    pub fn private_key(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.0.to_bytes())
    }

    /// The public key, as `PushManager.subscribe` takes it as `applicationServerKey`
    pub fn public_key(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.0.public_key().public_key().to_bytes_uncompressed())
    }
}

impl fmt::Debug for VapidKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("VapidKey").field(&self.public_key()).finish()
    }
}

impl FromStr for VapidKey {
    type Err = String;

    fn from_str(key: &str) -> Result<Self, Self::Err> {
        let bytes = URL_SAFE_NO_PAD
            .decode(key.trim())
            .map_err(|_| "not base64url without padding".to_string())?;
        if bytes.len() != 32 {
            return Err("not 32 bytes long".to_string());
        }
        let key_pair =
            ES256KeyPair::from_bytes(&bytes).map_err(|_| "not a P-256 private key".to_string())?;
        Ok(Self(Arc::new(key_pair)))
    }
}

/// Sends pushes for real, signed with a [`VapidKey`]
pub struct VapidSender {
    /// The key requests are signed with
    key: VapidKey,
    /// Who the push services can reach about this sender, the public origin
    subject: String,
    /// The client requests go out through
    client: reqwest::Client,
}

impl VapidSender {
    /// A sender signing with `key` on behalf of `origin`
    pub fn new(key: VapidKey, origin: &Url) -> Result<Self, reqwest::Error> {
        Ok(Self {
            key,
            subject: origin.origin().ascii_serialization(),
            client: reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()?,
        })
    }

    /// Build the encrypted, signed request for `message` to `device`
    fn request(
        &self,
        device: &PushDevice,
        message: &PushMessage,
    ) -> Result<reqwest::Request, String> {
        let public = URL_SAFE_NO_PAD
            .decode(&device.p256dh)
            .ok()
            .and_then(|key| PublicKey::from_sec1_bytes(&key).ok())
            .ok_or("invalid p256dh")?;
        let auth: [u8; 16] = URL_SAFE_NO_PAD
            .decode(&device.auth)
            .ok()
            .and_then(|auth| auth.try_into().ok())
            .ok_or("invalid auth secret")?;
        let endpoint = device.endpoint.parse().map_err(|_| "invalid endpoint")?;
        let payload = serde_json::to_vec(message).map_err(|error| error.to_string())?;

        let mut request = WebPushBuilder::new(endpoint, public, Auth::from(auth))
            .with_valid_duration(TIME_TO_LIVE)
            .with_vapid(&self.key.0, &self.subject)
            .build(payload)
            .map_err(|error| error.to_string())?;
        request
            .headers_mut()
            .insert("Urgency", "high".parse().expect("a valid header value"));
        reqwest::Request::try_from(request).map_err(|error| error.to_string())
    }
}

impl PushSender for VapidSender {
    fn send(&self, device: PushDevice, message: PushMessage) {
        let request = match self.request(&device, &message) {
            Ok(request) => request,
            Err(error) => {
                warn!(%error, "Could not build a push");
                return;
            }
        };
        let client = self.client.clone();
        tokio::spawn(async move {
            match client.execute(request).await {
                Ok(response) if response.status().is_success() => {
                    debug!("Push delivered to the push service");
                }
                Ok(response) if matches!(response.status().as_u16(), 404 | 410) => {
                    debug!("Push subscription gone, forgetting it");
                    forget(device.subscription).await;
                }
                Ok(response) => {
                    warn!(status = %response.status(), "Push service refused a push");
                }
                Err(error) => {
                    warn!(%error, "Could not reach the push service");
                }
            }
        });
    }
}

/// Drop a subscription its push service no longer knows
async fn forget(subscription: PushSubscriptionUuid) {
    if let Err(error) = forget_in_database(subscription).await {
        warn!(%error, "Could not forget a gone push subscription");
    }
}

/// Delete the subscription's row
async fn forget_in_database(subscription: PushSubscriptionUuid) -> anyhow::Result<()> {
    let mut tx = Database::global().start_transaction().await?;
    PushSubscription::forget(&mut tx, subscription).await?;
    tx.commit().await?;
    Ok(())
}

/// Setup of [`WebPush`], pushes off by default
#[derive(Default)]
pub struct WebPushSetup {
    /// The public VAPID key the browsers subscribe with, `None` while pushes are off
    pub public_key: Option<String>,
    /// Where pushes go, `None` to send none
    pub sender: Option<Arc<dyn PushSender>>,
}

impl fmt::Debug for WebPushSetup {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("WebPushSetup")
            .field("public_key", &self.public_key)
            .field("sender", &self.sender.is_some())
            .finish()
    }
}

impl WebPushSetup {
    /// Real pushes signed with `key`, or none without one
    pub fn from_key(key: Option<VapidKey>, origin: &Url) -> Result<Self, reqwest::Error> {
        Ok(match key {
            Some(key) => Self {
                public_key: Some(key.public_key()),
                sender: Some(Arc::new(VapidSender::new(key, origin)?)),
            },
            None => Self {
                public_key: None,
                sender: None,
            },
        })
    }
}

/// The service's way out to the push services
pub struct WebPush {
    /// The public VAPID key, `None` while pushes are off
    public_key: Option<String>,
    /// Where pushes go
    sender: Option<Arc<dyn PushSender>>,
}

impl WebPush {
    /// The public VAPID key browsers subscribe with, `None` while pushes are off
    pub fn public_key(&self) -> Option<&str> {
        self.public_key.as_deref()
    }

    /// Hand `message` to `device`, a no-op while pushes are off
    pub fn send(&self, device: PushDevice, message: PushMessage) {
        if let Some(sender) = &self.sender {
            sender.send(device, message);
        }
    }
}

impl Module for WebPush {
    type Setup = WebPushSetup;
    type PreInit = WebPushSetup;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        Ok(setup)
    }

    type Dependencies = ();

    async fn init(
        setup: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        Ok(Self {
            public_key: setup.public_key,
            sender: setup.sender,
        })
    }
}

/// A sender that keeps every push instead of sending it, for tests
#[cfg(test)]
#[derive(Default)]
pub struct RecordingSender {
    /// Every push so far, in order
    pushes: std::sync::Mutex<Vec<(String, PushMessage)>>,
}

#[cfg(test)]
impl RecordingSender {
    /// The pushes the device at `endpoint` got so far, oldest first
    pub fn to(&self, endpoint: &str) -> Vec<PushMessage> {
        self.pushes
            .lock()
            .expect("the recording is intact")
            .iter()
            .filter(|(to, _)| to == endpoint)
            .map(|(_, message)| message.clone())
            .collect()
    }
}

#[cfg(test)]
impl PushSender for RecordingSender {
    fn send(&self, device: PushDevice, message: PushMessage) {
        self.pushes
            .lock()
            .expect("the recording is intact")
            .push((device.endpoint, message));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_vapid_key_reads_back_what_it_writes() {
        let key = VapidKey::generate();
        let read: VapidKey = key.private_key().parse().expect("a valid key");
        assert_eq!(read.public_key(), key.public_key());
    }

    #[test]
    fn the_public_key_is_an_uncompressed_point() {
        let public = URL_SAFE_NO_PAD
            .decode(VapidKey::generate().public_key())
            .expect("base64url");
        assert_eq!(public.len(), 65);
        assert_eq!(public[0], 4);
    }

    #[test]
    fn a_vapid_key_must_be_a_p256_scalar() {
        assert!("not a key!".parse::<VapidKey>().is_err());
        assert!(
            URL_SAFE_NO_PAD
                .encode([0u8; 7])
                .parse::<VapidKey>()
                .is_err()
        );
    }

    #[test]
    fn a_push_is_encrypted_signed_and_urgent() {
        let sender = VapidSender::new(
            VapidKey::generate(),
            &Url::parse("https://mtg.test/").expect("a url"),
        )
        .expect("a client");
        let device = PushDevice {
            subscription: PushSubscriptionUuid::new(uuid::Uuid::nil()),
            endpoint: "https://push.test/device".to_string(),
            p256dh: "BLn9b-VR0ca83knDNZ32dCHGyjJp-1riX9ZTN40MqV8K_LpQmLqxC_DoHvqvFXO_nGdAB4W9dogZb_sM-uV4JbY"
                .to_string(),
            auth: "_ordMnz7uTCmrpBTeUV4Bw".to_string(),
        };
        let message = PushMessage {
            title: "t".to_string(),
            body: "b".to_string(),
            url: "/".to_string(),
            tag: "x".to_string(),
        };

        let request = sender.request(&device, &message).expect("a request");

        assert_eq!(request.url().as_str(), "https://push.test/device");
        let headers = request.headers();
        assert_eq!(headers["Content-Encoding"], "aes128gcm");
        assert_eq!(headers["TTL"], "43200");
        assert_eq!(headers["Urgency"], "high");
        assert!(
            headers["Authorization"]
                .to_str()
                .expect("ascii")
                .starts_with("vapid t=")
        );
    }

    #[test]
    fn a_device_with_broken_keys_gets_no_request() {
        let sender = VapidSender::new(
            VapidKey::generate(),
            &Url::parse("https://mtg.test/").expect("a url"),
        )
        .expect("a client");
        let device = PushDevice {
            subscription: PushSubscriptionUuid::new(uuid::Uuid::nil()),
            endpoint: "https://push.test/device".to_string(),
            p256dh: "AAAA".to_string(),
            auth: "_ordMnz7uTCmrpBTeUV4Bw".to_string(),
        };
        let message = PushMessage {
            title: String::new(),
            body: String::new(),
            url: String::new(),
            tag: String::new(),
        };
        assert!(sender.request(&device, &message).is_err());
    }
}
