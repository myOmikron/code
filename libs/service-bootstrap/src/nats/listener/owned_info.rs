//! Contains [`OwnedInfo`]

use async_nats::jetstream::message::Info;
use galvyn::core::re_exports::time::OffsetDateTime;
use o2o::o2o;

/// Information about a received message
///
/// This is an alternative version of [`Info`] which owns its fields.
#[derive(Debug, Clone, o2o)]
#[from(Info<'a>)]
#[ref_into(Info<'a>)]
pub struct OwnedInfo {
    /// Optional domain, present in servers post-ADR-15
    #[from(~.map(str::to_owned))]
    #[into(~.as_deref())]
    pub domain: Option<String>,

    /// Optional account hash, present in servers post-ADR-15
    #[from(~.map(str::to_owned))]
    #[into(~.as_deref())]
    pub acc_hash: Option<String>,

    /// The stream name
    #[from(~.to_owned())]
    #[into(~.as_str())]
    pub stream: String,

    /// The consumer name
    #[from(~.to_owned())]
    #[into(~.as_str())]
    pub consumer: String,

    /// The stream sequence number associated with this message
    pub stream_sequence: u64,

    /// The consumer sequence number associated with this message
    pub consumer_sequence: u64,

    /// The number of delivery attempts for this message
    pub delivered: i64,

    /// the number of messages known by the server to be pending to this consumer
    pub pending: u64,

    /// the time that this message was received by the server from its publisher
    pub published: OffsetDateTime,

    /// Optional token, present in servers post-ADR-15
    #[from(~.map(str::to_owned))]
    #[into(~.as_deref())]
    pub token: Option<String>,
}
