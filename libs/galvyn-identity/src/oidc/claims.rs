//! The claims of a verified ID token, as the module reads them

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::Map;
use serde_json::Value;

/// The claims of a verified ID token, `id_token` in its compact serialization
///
/// Only call it on a token whose signature is checked: the payload is read as is.
pub(super) fn claims(id_token: &str) -> Option<Map<String, Value>> {
    let payload = id_token.split('.').nth(1)?;
    let payload = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&payload).ok()
}

/// The value the claim `claim` states, if it is a non-empty string or a number
pub(super) fn identifying_value(claims: &Map<String, Value>, claim: &str) -> Option<String> {
    match claims.get(claim)? {
        Value::String(value) if !value.is_empty() => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn token(payload: Value) -> String {
        let encode = |value: &Value| URL_SAFE_NO_PAD.encode(value.to_string());
        format!(
            "{}.{}.signature",
            encode(&json!({ "alg": "RS256" })),
            encode(&payload)
        )
    }

    fn claims_of(payload: Value) -> Map<String, Value> {
        claims(&token(payload)).expect("a readable payload")
    }

    #[test]
    fn the_subject_identifies_by_default() {
        let claims = claims_of(json!({ "sub": "1234", "email": "a@example.org" }));
        assert_eq!(identifying_value(&claims, "sub"), Some("1234".to_string()));
    }

    #[test]
    fn another_claim_can_identify() {
        let claims = claims_of(json!({ "sub": "1234", "email": "a@example.org" }));
        assert_eq!(
            identifying_value(&claims, "email"),
            Some("a@example.org".to_string())
        );
    }

    #[test]
    fn a_numeric_claim_identifies_by_its_digits() {
        let claims = claims_of(json!({ "sub": "1234", "employee": 4711 }));
        assert_eq!(
            identifying_value(&claims, "employee"),
            Some("4711".to_string())
        );
    }

    #[test]
    fn a_missing_claim_identifies_nobody() {
        let claims = claims_of(json!({ "sub": "1234" }));
        assert_eq!(identifying_value(&claims, "email"), None);
    }

    #[test]
    fn an_empty_or_structured_claim_identifies_nobody() {
        let claims = claims_of(json!({ "sub": "", "groups": ["a"], "admin": true }));
        assert_eq!(identifying_value(&claims, "sub"), None);
        assert_eq!(identifying_value(&claims, "groups"), None);
        assert_eq!(identifying_value(&claims, "admin"), None);
    }

    #[test]
    fn a_token_without_a_payload_has_no_claims() {
        assert_eq!(claims("header-only"), None);
        assert_eq!(claims("a.not base64.c"), None);
    }
}
