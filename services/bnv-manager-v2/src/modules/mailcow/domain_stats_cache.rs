use std::collections::HashMap;
use std::sync::Arc;

use mailcow::domains::schema::MailcowDomain;
use mailcow::mailboxes::schema::MailcowMailbox;
use tokio::sync::RwLock;

/// Cached domain statistics including domain info and all mailboxes
#[derive(Debug, Clone)]
pub struct CachedDomainStats {
    /// Domain statistics from Mailcow
    pub domain: MailcowDomain,
    /// All mailboxes for this domain
    pub mailboxes: Vec<MailcowMailbox>,
}

/// Thread-safe cache for domain statistics, keyed by domain name
pub type DomainStatsCache = Arc<RwLock<HashMap<String, CachedDomainStats>>>;
