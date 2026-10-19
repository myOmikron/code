//! The scopes a client may request and the space separated `scope` parameter (RFC 6749 §3.3)

use serde::Deserialize;
use serde::Serialize;
use strum::EnumIter;
use strum::EnumString;
use strum::IntoStaticStr;

/// A scope a client may request, named in snake case
///
/// The order of the variants is the order the discovery document lists them in.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    EnumIter,
    EnumString,
    IntoStaticStr,
    strum::Display,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum Scope {
    /// Marks the request as an OpenID Connect one
    Openid,
    /// The `preferred_username` and `name` claims
    Profile,
    /// The `email` and `email_verified` claims
    Email,
    /// The `mailcow_template` claim, the key mailcow maps to a mailbox template
    MailcowTemplate,
}

/// A `scope` parameter with an unknown or empty scope
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnknownScope;

impl Scope {
    /// The scopes of the space separated `scope` parameter
    ///
    /// RFC 6749 §3.3: "scope = scope-token *( SP scope-token )", so an empty token is no
    /// scope either.
    pub fn parse_list(scope: &str) -> Result<Vec<Scope>, UnknownScope> {
        scope
            .split(' ')
            .map(|name| name.parse().map_err(|_| UnknownScope))
            .collect()
    }

    /// The space separated `scope` parameter of `scopes`
    pub fn format_list(scopes: &[Scope]) -> String {
        scopes
            .iter()
            .map(|&scope| <&str>::from(scope))
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::Scope;
    use super::UnknownScope;

    #[test]
    fn scope_parameter_parses_into_its_scopes() {
        assert_eq!(
            Scope::parse_list("openid email mailcow_template"),
            Ok(vec![Scope::Openid, Scope::Email, Scope::MailcowTemplate])
        );
        for scope in ["openid admin", "", "openid  profile", "openid Email"] {
            assert_eq!(Scope::parse_list(scope), Err(UnknownScope), "{scope:?}");
        }
    }

    #[test]
    fn scopes_format_into_a_scope_parameter() {
        assert_eq!(
            Scope::format_list(&[Scope::Openid, Scope::Profile, Scope::MailcowTemplate]),
            "openid profile mailcow_template"
        );
    }

    #[test]
    fn stored_scope_names_round_trip() {
        let stored = r#"["openid","email","profile","mailcow_template"]"#;
        let scopes: Vec<Scope> = serde_json::from_str(stored).expect("stored scopes");
        assert_eq!(
            scopes,
            [
                Scope::Openid,
                Scope::Email,
                Scope::Profile,
                Scope::MailcowTemplate
            ]
        );
        assert_eq!(serde_json::to_string(&scopes).expect("serialize"), stored);
        assert!(serde_json::from_str::<Scope>(r#""admin""#).is_err());
    }
}
