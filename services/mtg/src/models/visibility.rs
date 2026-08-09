//! Who may see a collection or a deck

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;

/// Who may see a collection or a deck
///
/// [`Self::Unlisted`] is not resolved by the ordinary visibility check — the
/// share token is the authorization for those, not the viewer's identity.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum Visibility {
    /// Listed on the owner's public profile
    Public,
    /// Anyone who knows the share link
    Unlisted,
    /// Only the owner
    #[default]
    Private,
}
custom_db_enum! {
    enum: Visibility,
    variants: [Public, Unlisted, Private],
    decoder: VisibilityDecoder,
}
