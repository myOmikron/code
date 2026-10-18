//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::LOCK_REASON_MAX_LEN;
use crate::models::account::Role;
use crate::models::account::db::AccountModel;
use crate::models::admin_log::AdminAction;

/// One entry of the Admin log
///
/// Names both Accounts by text as well, so the entry still reads right once
/// either of them is deleted and its reference is cleared.
#[derive(Model, Debug, Clone)]
#[rorm(rename = "admin_log_entry")]
pub struct AdminLogEntryModel {
    /// Primary key
    ///
    /// A v7 uuid, so ordering by it is ordering by time. The second half of
    /// the `admin_log_affected` index, see [`Self::account`].
    #[rorm(primary_key, index(name = "admin_log_affected", priority = 2))]
    pub uuid: Uuid,

    /// When the Admin acted
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The acting Admin, `None` once it is deleted
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub admin: Option<ForeignModel<AccountModel>>,

    /// The acting Admin's username at the time
    pub admin_username: MaxStr<32>,

    /// The affected Account, `None` once it is deleted
    ///
    /// Indexed together with [`Self::uuid`], so an Account's entries page
    /// newest first without reading anybody else's.
    #[rorm(
        index(name = "admin_log_affected", priority = 1),
        on_update = "Cascade",
        on_delete = "SetNull"
    )]
    pub account: Option<ForeignModel<AccountModel>>,

    /// The affected Account's username at the time
    pub account_username: MaxStr<32>,

    /// What the Admin did
    pub action: AdminAction,

    /// The Role a Role change gave the Account
    pub role: Option<Role>,

    /// The reason the Admin gave
    pub reason: Option<MaxStr<{ LOCK_REASON_MAX_LEN }>>,
}

/// Insert patch for [`AdminLogEntryModel`]
#[derive(Patch)]
#[rorm(model = "AdminLogEntryModel")]
pub struct AdminLogEntryInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The acting Admin
    pub admin: Option<ForeignModel<AccountModel>>,
    /// The acting Admin's username
    pub admin_username: MaxStr<32>,
    /// The affected Account
    pub account: Option<ForeignModel<AccountModel>>,
    /// The affected Account's username
    pub account_username: MaxStr<32>,
    /// What the Admin did
    pub action: AdminAction,
    /// The Role a Role change gave the Account
    pub role: Option<Role>,
    /// The reason the Admin gave
    pub reason: Option<MaxStr<{ LOCK_REASON_MAX_LEN }>>,
}
