use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::domain::Domain;
use crate::models::domain::DomainUuid;

/// The representation of a domain
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DomainSchema {
    /// Internal identifier of the domain
    pub uuid: DomainUuid,
    /// The domain
    pub domain: MaxStr<255>,
    /// Is the domain used to create mailboxes
    pub is_primary: bool,
}

impl From<Domain> for DomainSchema {
    fn from(domain: Domain) -> Self {
        Self {
            uuid: domain.uuid,
            domain: domain.domain,
            is_primary: domain.is_primary,
        }
    }
}
