//! NATS-safe encoding of arbitrary model IDs.
//!
//! NATS recommends only `[A-Za-z0-9-_]` for subject/key names and reserves
//! the `_` prefix for internal use. `[parse_nats_model_id]` implements the
//! constraints
//! written here that maps any raw model ID to a string that is safe
//! to embed in a NATS subject or JetStream KV key.

use sha2::Digest;
use sha2::Sha256;

/// Encodes `model_id` according to the constraints.
pub fn encode_nats_model_id(model_id: String) -> String {
    let needs_escaping = model_id.starts_with('_')
        || model_id.is_empty()
        || model_id.len() > 40
        || model_id.chars().any(is_not_recommended);

    if needs_escaping {
        let hash = Sha256::digest(model_id.as_bytes());
        let hex = format!(
            "{:02x}{:02x}{:02x}{:02x}",
            hash[0], hash[1], hash[2], hash[3]
        );

        let escaped: String = model_id
            .chars()
            .filter(|c| !is_not_recommended(*c))
            .collect();
        let escaped = &escaped[..escaped.len().min(32)];

        format!("_{escaped}-{hex}")
    } else {
        model_id
    }
}

/// Returns `true` for characters outside the NATS-recommended set
/// `[A-Za-z0-9-_]`.
fn is_not_recommended(c: char) -> bool {
    !matches!(c, 'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_')
}
