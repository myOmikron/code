//! What the login page offers: the enabled login methods and the OpenID providers

use galvyn::core::GalvynRouter;
use galvyn::core::Module;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use serde::Serialize;

use crate::IdentityModule;

/// The route of the login page's listing, for the service to nest where its login page finds it
///
/// It checks no login: the login page asks before anyone is logged in.
pub fn login_methods_routes() -> GalvynRouter {
    GalvynRouter::new().handler(get_login_methods)
}

/// List the login methods the service enabled and the OpenID providers it offers
#[get("/")]
pub async fn get_login_methods() -> ApiResult<ApiJson<LoginMethodsResponse>> {
    let module = IdentityModule::global();
    #[cfg(feature = "oidc")]
    let openid_providers = module
        .openid_providers(galvyn::rorm::Database::global())
        .await?
        .iter()
        .map(OfferedOpenIdProvider::from)
        .collect();
    #[cfg(not(feature = "oidc"))]
    let openid_providers = Vec::new();
    Ok(ApiJson(LoginMethodsResponse {
        methods: module.enabled_login_methods(),
        openid_providers,
    }))
}

/// What the login page offers
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct LoginMethodsResponse {
    /// The login methods the service enabled
    pub methods: Vec<EnabledLoginMethod>,
    /// The OpenID providers people may log in through, by slug, empty while OIDC login is off
    ///
    /// A deactivated provider is left out, and so is one whose discovery
    /// failed a few minutes ago at most.
    pub openid_providers: Vec<OfferedOpenIdProvider>,
}

/// An OpenID provider the login page offers
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct OfferedOpenIdProvider {
    /// The service's own short name for the provider, to begin an OIDC login with
    pub slug: String,
    /// What the login page calls the provider
    pub display_name: String,
}

#[cfg(feature = "oidc")]
impl From<&crate::OpenIdProvider> for OfferedOpenIdProvider {
    fn from(provider: &crate::OpenIdProvider) -> Self {
        Self {
            slug: provider.slug().to_string(),
            display_name: provider.display_name().to_string(),
        }
    }
}

/// A login method the service enabled
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EnabledLoginMethod {
    /// Passkey login, by username and one of the Identity's Passkeys
    Passkey,
    /// OIDC login through one of the offered OpenID providers
    Oidc,
}

impl IdentityModule {
    /// The login methods the service enabled
    ///
    /// Passkey login with the `passkey` feature, OIDC login with the `oidc`
    /// feature once the service set a callback path.
    pub fn enabled_login_methods(&self) -> Vec<EnabledLoginMethod> {
        #[cfg(feature = "oidc")]
        let oidc = self.oidc.enabled();
        #[cfg(not(feature = "oidc"))]
        let oidc = false;
        [
            (cfg!(feature = "passkey"), EnabledLoginMethod::Passkey),
            (oidc, EnabledLoginMethod::Oidc),
        ]
        .into_iter()
        .filter_map(|(enabled, method)| enabled.then_some(method))
        .collect()
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::Module;
    use url::Url;

    use super::*;
    use crate::IdentityModule;
    use crate::IdentitySetup;

    /// The module of `http://service.test`, with OIDC login on if `callback_path` is not empty
    #[cfg_attr(
        not(feature = "oidc"),
        expect(unused_variables, reason = "only OIDC login has a callback path")
    )]
    async fn module(callback_path: &str) -> IdentityModule {
        let prepared = IdentityModule::pre_init(IdentitySetup {
            public_origin: Some(Url::parse("http://service.test").expect("valid url")),
            registration_link_path: "/auth/register".to_string(),
            #[cfg(feature = "passkey")]
            passkey: crate::PasskeySetup {
                rp_name: "Service".to_string(),
            },
            #[cfg(feature = "oidc")]
            oidc: crate::OidcSetup {
                callback_path: callback_path.to_string(),
                ..crate::OidcSetup::default()
            },
            ..IdentitySetup::default()
        })
        .await
        .unwrap_or_else(|error| panic!("prepare the module: {error:?}"));
        IdentityModule::from_prepared(prepared)
    }

    #[cfg(feature = "passkey")]
    #[tokio::test]
    async fn passkey_login_is_enabled_with_its_feature() {
        let methods = module("").await.enabled_login_methods();
        assert!(methods.contains(&EnabledLoginMethod::Passkey));
    }

    #[cfg(feature = "oidc")]
    #[tokio::test]
    async fn oidc_login_is_enabled_by_a_callback_path() {
        let methods = module("/auth/oidc/callback").await.enabled_login_methods();
        assert!(methods.contains(&EnabledLoginMethod::Oidc));
    }

    #[test]
    fn the_routes_hold_the_one_listing() {
        let (_, routes) = login_methods_routes().finish();
        assert_eq!(routes.len(), 1);
    }

    #[cfg(feature = "oidc")]
    #[test]
    fn an_offered_provider_shows_its_slug_and_display_name_alone() {
        let provider = crate::OpenIdProvider {
            uuid: uuid::Uuid::new_v4(),
            slug: "authentik".to_string(),
            display_name: "Authentik".to_string(),
            discovery_url: "https://sso.example.org/.well-known/openid-configuration".to_string(),
            issuer: Some("https://sso.example.org".to_string()),
            client_id: "service".to_string(),
            client_secret: "s3cret".to_string(),
            identifying_claim: "sub".to_string(),
            admission: crate::Admission::Open,
            active: true,
        };
        let offered = serde_json::to_value(OfferedOpenIdProvider::from(&provider)).unwrap();
        assert_eq!(
            offered,
            serde_json::json!({ "slug": "authentik", "display_name": "Authentik" })
        );
    }

    #[cfg(feature = "oidc")]
    #[tokio::test]
    async fn oidc_login_is_not_listed_without_a_callback_path() {
        let methods = module("").await.enabled_login_methods();
        assert!(!methods.contains(&EnabledLoginMethod::Oidc));
    }
}
