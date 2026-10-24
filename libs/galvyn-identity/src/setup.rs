//! Everything a service configures about [`IdentityModule`](super::IdentityModule)

use std::sync::Arc;

use galvyn::core::re_exports::time::Duration;
use tower_sessions::Expiry;
use url::Url;

/// Setup of the [`IdentityModule`](super::IdentityModule)
///
/// Only `public_origin`, `registration_link_path` and the enabled login
/// methods' own setup have to be filled; the durations default to what most
/// services want.
#[derive(Debug, Clone)]
pub struct IdentitySetup {
    /// The public origin the service is served from
    ///
    /// Registration links point at it. For Passkeys it becomes the WebAuthn
    /// `rp_origin` and its host the `rp_id`, so changing the host invalidates
    /// every enrolled Passkey.
    pub public_origin: Option<Url>,

    /// The path of the frontend page a Registration link opens
    pub registration_link_path: String,

    /// How long a freshly issued Registration link stays usable
    pub registration_link_validity: Duration,

    /// How long a remembered session survives without being used
    pub remember_me: Duration,

    /// How the service deletes a single person, `None` to delete only the Identity
    ///
    /// Without a hook the service's foreign keys on the Identity decide what
    /// goes with the person.
    pub delete_hook: Option<Arc<dyn super::DeleteHook>>,

    /// Setup of Passkey login
    #[cfg(feature = "passkey")]
    pub passkey: super::PasskeySetup,

    /// Setup of OIDC login
    #[cfg(feature = "oidc")]
    pub oidc: super::OidcSetup,
}

impl Default for IdentitySetup {
    fn default() -> Self {
        Self {
            public_origin: None,
            registration_link_path: String::new(),
            registration_link_validity: Duration::days(7),
            remember_me: Duration::days(30),
            delete_hook: None,
            #[cfg(feature = "passkey")]
            passkey: super::PasskeySetup::default(),
            #[cfg(feature = "oidc")]
            oidc: super::OidcSetup::default(),
        }
    }
}

/// The setup after validation, as the module keeps it
#[derive(Debug, Clone)]
pub struct Settings {
    /// See [`IdentitySetup::public_origin`]
    pub(crate) public_origin: Url,
    /// See [`IdentitySetup::registration_link_path`]
    registration_link_path: String,
    /// See [`IdentitySetup::registration_link_validity`]
    pub(crate) registration_link_validity: Duration,
    /// See [`IdentitySetup::remember_me`]
    remember_me: Duration,
}

impl Settings {
    /// Validate `setup`
    pub(crate) fn new(setup: IdentitySetup) -> Result<Self, String> {
        let public_origin = setup
            .public_origin
            .ok_or("public_origin must be set in IdentitySetup")?;
        if setup.registration_link_path.is_empty() {
            return Err("registration_link_path must be set in IdentitySetup".to_string());
        }
        Ok(Self {
            public_origin,
            registration_link_path: setup.registration_link_path,
            registration_link_validity: setup.registration_link_validity,
            remember_me: setup.remember_me,
        })
    }

    /// The full Registration link carrying `token`
    pub(crate) fn registration_link(&self, token: &str) -> Url {
        let mut link = self.public_origin.clone();
        link.set_path(&self.registration_link_path);
        link.set_query(Some(&format!("token={token}")));
        link
    }

    /// How long a freshly logged-in session lives
    ///
    /// A remembered one survives the configured remember-me duration of
    /// inactivity, any other ends with the browser session.
    pub(crate) fn login_expiry(&self, remember_me: bool) -> Expiry {
        if remember_me {
            Expiry::OnInactivity(self.remember_me)
        } else {
            Expiry::OnSessionEnd
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> IdentitySetup {
        IdentitySetup {
            public_origin: Some(Url::parse("https://mtg.example.org").unwrap()),
            registration_link_path: "/auth/register".to_string(),
            ..IdentitySetup::default()
        }
    }

    #[test]
    fn registration_links_stay_usable_for_seven_days_by_default() {
        let settings = Settings::new(setup()).unwrap();
        assert_eq!(settings.registration_link_validity, Duration::days(7));
    }

    #[test]
    fn an_overridden_registration_link_validity_takes_effect() {
        let settings = Settings::new(IdentitySetup {
            registration_link_validity: Duration::hours(2),
            ..setup()
        })
        .unwrap();
        assert_eq!(settings.registration_link_validity, Duration::hours(2));
    }

    #[test]
    fn a_remembered_login_survives_thirty_days_of_inactivity_by_default() {
        let settings = Settings::new(setup()).unwrap();
        assert_eq!(
            settings.login_expiry(true),
            Expiry::OnInactivity(Duration::days(30))
        );
    }

    #[test]
    fn an_overridden_remember_me_duration_takes_effect() {
        let settings = Settings::new(IdentitySetup {
            remember_me: Duration::days(1),
            ..setup()
        })
        .unwrap();
        assert_eq!(
            settings.login_expiry(true),
            Expiry::OnInactivity(Duration::days(1))
        );
    }

    #[test]
    fn a_login_without_remember_me_ends_with_the_browser_session() {
        let settings = Settings::new(setup()).unwrap();
        assert_eq!(settings.login_expiry(false), Expiry::OnSessionEnd);
    }

    #[test]
    fn a_registration_link_opens_the_configured_page_with_its_token() {
        let settings = Settings::new(setup()).unwrap();
        assert_eq!(
            settings.registration_link("abc").as_str(),
            "https://mtg.example.org/auth/register?token=abc"
        );
    }

    #[test]
    fn a_setup_without_public_origin_is_refused() {
        let missing = IdentitySetup {
            public_origin: None,
            ..setup()
        };
        assert!(Settings::new(missing).is_err());
    }

    #[test]
    fn a_setup_without_registration_link_path_is_refused() {
        let missing = IdentitySetup {
            registration_link_path: String::new(),
            ..setup()
        };
        assert!(Settings::new(missing).is_err());
    }
}
