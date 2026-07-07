//! Schema for mailcow domain endpoints

use serde::Deserialize;
use serde::Serialize;

/// A domain in mailcow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailcowDomain {
    /// Integer to show if the domain is enabled
    pub active_int: u8,
    /// Domain
    pub domain_name: String,
    /// Number of mailboxes left to create on the domain
    pub mboxes_left: u64,
    /// Maximal quota for a mailbox in bytes
    pub max_quota_for_mbox: u64,
    /// Default quota for new mailboxes in bytes (used when mailbox quota is 0)
    pub def_quota_for_mbox: u64,
    /// Maximum total quota for the domain in bytes
    pub max_quota_for_domain: u64,
    /// Total bytes used across all mailboxes (string in Mailcow API)
    #[serde(deserialize_with = "deserialize_string_to_u64")]
    pub bytes_total: u64,
    /// Total messages across all mailboxes (string in Mailcow API)
    #[serde(deserialize_with = "deserialize_string_to_u64")]
    pub msgs_total: u64,
    /// Number of mailboxes in the domain
    pub mboxes_in_domain: u64,
    /// Maximum number of mailboxes for the domain
    pub max_num_mboxes_for_domain: u64,
}

fn deserialize_string_to_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    let value = serde_json::Value::deserialize(deserializer)?;
    match &value {
        serde_json::Value::Number(n) => {
            n.as_u64().ok_or_else(|| D::Error::custom("invalid number"))
        }
        serde_json::Value::String(s) => s.parse().map_err(D::Error::custom),
        _ => Err(D::Error::custom("expected number or string")),
    }
}
