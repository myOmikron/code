//! Global module providing the configured [`webauthn_rs::Webauthn`] instance

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use webauthn_rs::Webauthn;
use webauthn_rs::WebauthnBuilder;

/// Global module wrapping the WebAuthn ceremony engine
pub struct WebauthnModule {
    /// The configured engine (rp_id/rp_origin from `PUBLIC_ORIGIN`)
    pub webauthn: Webauthn,
    /// The public origin, used to construct registration links
    pub public_origin: url::Url,
}

impl WebauthnModule {
    /// Construct the one-time registration link for an invite token
    pub fn registration_link(&self, token: &str) -> url::Url {
        let mut link = self.public_origin.clone();
        link.set_path("/register");
        link.set_query(Some(&format!("token={token}")));
        link
    }
}

/// Setup for [`WebauthnModule`], the option must be filled
#[derive(Debug, Default)]
pub struct WebauthnSetup {
    /// The public origin the app is served from
    pub public_origin: Option<url::Url>,
}

impl Module for WebauthnModule {
    type Setup = WebauthnSetup;
    type PreInit = (Webauthn, url::Url);

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        let origin = setup
            .public_origin
            .ok_or("public_origin must be set in WebauthnSetup")?;

        // Re-parse through webauthn-rs' url type to stay independent of
        // potential version skew between our `url` and webauthn's.
        let rp_origin = webauthn_rs::prelude::Url::parse(origin.as_str())
            .map_err(|e| format!("Invalid PUBLIC_ORIGIN: {e}"))?;
        let rp_id = rp_origin
            .host_str()
            .ok_or("PUBLIC_ORIGIN must contain a host")?
            .to_string();

        let webauthn = WebauthnBuilder::new(&rp_id, &rp_origin)
            .map_err(|e| format!("Invalid webauthn configuration: {e}"))?
            .rp_name("Semelei")
            .build()
            .map_err(|e| format!("Failed to build webauthn: {e}"))?;

        Ok((webauthn, origin))
    }

    type Dependencies = ();

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let (webauthn, public_origin) = pre_init;
        Ok(Self {
            webauthn,
            public_origin,
        })
    }
}
