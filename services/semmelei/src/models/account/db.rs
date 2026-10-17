use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::IdentityModel;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::models::account::Role;

/// A staff account (Admin or Verkauf)
///
/// Authentication is passkey-only: the account's Identity holds its
/// Passkeys, enrolled through Registration links.
#[derive(Model, Debug, Clone)]
#[rorm(rename = "account")]
pub struct AccountModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The username of the account
    #[rorm(unique)]
    pub username: MaxStr<255>,

    /// The account's role
    pub role: Role,

    /// The point in time the account was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The Identity this account logs in as
    ///
    /// Deleting the Identity deletes the account.
    #[rorm(unique, on_delete = "Cascade", on_update = "Cascade")]
    pub identity: ForeignModel<IdentityModel>,
}

/// Insert patch for [`AccountModel`]
#[derive(Patch)]
#[rorm(model = "AccountModel")]
pub struct AccountInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The username of the account
    pub username: MaxStr<255>,
    /// The account's role
    pub role: Role,
    /// The Identity this account logs in as
    pub identity: ForeignModel<IdentityModel>,
}
