//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::modules::passkeys::IdentityModel;

/// An account
///
/// Authentication is passkey-only: an account has no password, only the
/// passkeys of the [`IdentityModel`] it references.
///
/// Login is username-first: the client sends the username, the server looks
/// the account up by [`Self::username_normalized`] and answers with the
/// credential ids of its identity's passkeys.
#[derive(Model, Debug, Clone)]
#[rorm(rename = "account")]
pub struct AccountModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The username, spelled the way the account chose it
    pub username: MaxStr<32>,

    /// The lowercased [`Self::username`], used for lookup and uniqueness
    #[rorm(unique)]
    pub username_normalized: MaxStr<32>,

    /// The email address used to reach the account's owner
    #[rorm(unique)]
    pub email: MaxStr<255>,

    /// The point in time the account was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// Whether this row is the tombstone deleted accounts leave behind
    ///
    /// There is exactly one of them, and it owns nothing but the public decks
    /// of accounts that are gone. Its username and email are spelled so that no
    /// request can name it, and every lookup by name skips it on top of that:
    /// an account nobody can sign up as, recover, or log into.
    #[rorm(default = false)]
    pub tombstone: bool,

    /// The identity this account signs in as
    ///
    /// Deleting the identity deletes the account with it.
    #[rorm(unique, on_delete = "Cascade", on_update = "Cascade")]
    pub identity: ForeignModel<IdentityModel>,
}

/// Insert patch for [`AccountModel`]
#[derive(Patch)]
#[rorm(model = "AccountModel")]
pub struct AccountInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The username, spelled the way the account chose it
    pub username: MaxStr<32>,
    /// The lowercased username
    pub username_normalized: MaxStr<32>,
    /// The email address used to reach the account's owner
    pub email: MaxStr<255>,
    /// Whether this row is the tombstone deleted accounts leave behind
    pub tombstone: bool,
    /// The identity this account signs in as
    pub identity: ForeignModel<IdentityModel>,
}
