//! Proof Key for Code Exchange (RFC 7636)
//!
//! Challenges are stored in their `S256` form: a `plain` challenge is the verifier itself
//! (RFC 7636 §4.2), so its hash is what the `S256` transformation of a matching verifier
//! yields. The token endpoint then verifies every code with one comparison.

use base64ct::Base64UrlUnpadded;
use base64ct::Encoding;
use sha2::Digest;
use sha2::Sha256;
use subtle::ConstantTimeEq;

/// The supported `code_challenge_method` values, `S256` first as the one to prefer
pub const CODE_CHALLENGE_METHODS: [&str; 2] = ["S256", "plain"];

/// Whether `value` is a valid `code_verifier` or `code_challenge`
///
/// RFC 7636 §4.1: "code-verifier = 43*128unreserved", with "unreserved = ALPHA / DIGIT /
/// "-" / "." / "_" / "~"". §4.2 gives the same syntax for the `code_challenge`.
pub fn is_well_formed(value: &str) -> bool {
    (43..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._~".contains(&byte))
}

/// The `S256` form of a challenge of the `code_challenge_method` `method`
///
/// RFC 7636 §4.3: "code_challenge_method OPTIONAL, defaults to "plain" if not present in
/// the request." Fails with the description of an `invalid_request`.
pub fn s256_challenge(challenge: &str, method: Option<&str>) -> Result<String, &'static str> {
    if !is_well_formed(challenge) {
        return Err("code_challenge must be 43 to 128 unreserved characters");
    }
    match method.unwrap_or("plain") {
        "S256" => Ok(challenge.to_string()),
        "plain" => Ok(s256(challenge)),
        _ => Err("Unsupported code_challenge_method, only S256 and plain are supported"),
    }
}

/// Whether `verifier` matches a challenge in its `S256` form
///
/// RFC 7636 §4.2: "S256 code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))"
pub fn verifies(verifier: &str, s256_challenge: &str) -> bool {
    s256(verifier)
        .as_bytes()
        .ct_eq(s256_challenge.as_bytes())
        .into()
}

/// The `S256` transformation of a verifier
fn s256(verifier: &str) -> String {
    Base64UrlUnpadded::encode_string(&Sha256::digest(verifier.as_bytes()))
}
