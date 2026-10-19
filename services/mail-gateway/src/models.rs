//! Domain types for the messages this service consumes

use lettre::address::AddressError;
use lettre::message::Mailbox;
use mime::FromStrError;
use mime::Mime;
use o2o::o2o;
use service_bootstrap::nats::NatsPayload;
use service_bootstrap::o2o_helper::vec;
use thiserror::Error;

use crate::proto;

/// A single plain-text email, optionally with attachments, to be delivered via SMTP
///
/// Validated counterpart of [`proto::mail_v1::SendEmail`].
#[derive(Debug, Clone, o2o)]
#[try_from_owned(proto::mail_v1::SendEmail, InvalidEmail)]
#[owned_into(proto::mail_v1::SendEmail)]
pub struct SendEmail {
    /// Recipient address, optionally with a display name
    #[from(~.parse()?)]
    #[into(~.to_string())]
    pub to: Mailbox,

    /// Additional recipients in the CC header
    #[from(vec::try_map(~, |cc| cc.parse())?)]
    #[into(vec::map(~, |cc| cc.to_string()))]
    pub cc: Vec<Mailbox>,

    /// Subject line
    pub subject: String,

    /// Plain-text body (UTF-8)
    pub text_body: String,

    /// Files attached to the mail, none for a single plain-text part
    #[from(vec::try_from(~)?)]
    #[into(vec::into(~))]
    pub attachments: Vec<Attachment>,
}

impl NatsPayload for SendEmail {
    type Proto = proto::mail_v1::SendEmail;
}

/// A file attached to a [`SendEmail`]
///
/// Validated counterpart of [`proto::mail_v1::Attachment`].
#[derive(Debug, Clone, o2o)]
#[try_from_owned(proto::mail_v1::Attachment, InvalidEmail)]
#[owned_into(proto::mail_v1::Attachment)]
pub struct Attachment {
    /// File name the receiver sees
    pub filename: String,

    /// MIME type of `content`
    #[from(~.parse()?)]
    #[into(~.to_string())]
    pub content_type: Mime,

    /// Raw file content
    pub content: Vec<u8>,
}

/// Why a [`proto::mail_v1::SendEmail`] is no valid [`SendEmail`]
#[derive(Debug, Error)]
pub enum InvalidEmail {
    /// The recipient or a CC recipient is no valid mailbox
    #[error("invalid address: {0}")]
    Address(#[from] AddressError),

    /// An attachment's content type is no valid MIME type
    #[error("invalid content type: {0}")]
    ContentType(#[from] FromStrError),
}
