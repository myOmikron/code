//! The secret in a share link
//!
//! Shared by everything that can be handed out by link. The token lives on the
//! row it unlocks, next to its [`Visibility`](super::visibility::Visibility):
//! minting one is switching to [`Unlisted`](super::visibility::Visibility::Unlisted),
//! and leaving that visibility drops it, which is how a link is withdrawn.

use galvyn::rorm::fields::types::MaxStr;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;

/// Length of the secret in a share link
pub const SHARE_TOKEN_LEN: usize = 32;

/// Generate the secret for a share link
pub fn generate_share_token() -> MaxStr<64> {
    let token = Alphanumeric.sample_string(&mut rand::rng(), SHARE_TOKEN_LEN);
    MaxStr::new(token).unwrap_or_else(|_| unreachable!("{SHARE_TOKEN_LEN} is below 64"))
}
