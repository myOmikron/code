//! Database model of an External identity

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::db::IdentityModel;

/// A person as one OpenID provider knows them, bound to an external [`IdentityModel`]
#[derive(Model)]
#[rorm(rename = "external_identity")]
pub struct ExternalIdentityModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The external Identity this External identity is bound to
    ///
    /// Indexed: the login method of an Identity filters on it, and Postgres
    /// does not index a foreign key on its own.
    #[rorm(index, on_delete = "Cascade", on_update = "Cascade")]
    pub identity: ForeignModel<IdentityModel>,

    /// The issuer of the OpenID provider
    pub issuer: MaxStr<255>,

    /// The subject the provider identifies the person by
    pub subject: MaxStr<255>,

    /// Issuer and subject joined by a space, keeping the pair unique
    ///
    /// rorm declares no unique constraint over two columns. An issuer is a
    /// url and holds no space, so the joined value names exactly one pair.
    #[rorm(unique)]
    pub issuer_subject: MaxStr<511>,

    /// The point in time this External identity was enrolled
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`ExternalIdentityModel`]
#[derive(Patch)]
#[rorm(model = "ExternalIdentityModel")]
pub struct ExternalIdentityInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The external Identity this External identity is bound to
    pub identity: ForeignModel<IdentityModel>,
    /// The issuer of the OpenID provider
    pub issuer: MaxStr<255>,
    /// The subject the provider identifies the person by
    pub subject: MaxStr<255>,
    /// Issuer and subject joined by a space
    pub issuer_subject: MaxStr<511>,
}
