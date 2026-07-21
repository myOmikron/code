//! Domain types for the messages this service consumes

use lettre::address::AddressError;
use lettre::message::Mailbox;
use service_bootstrap::nats::NatsPayload;

use crate::proto;

/// A single plain-text email to be delivered via SMTP
///
/// Validated counterpart of [`proto::mail_v1::SendEmail`].
#[derive(Debug, Clone)]
pub struct SendEmail {
    /// Recipient address, optionally with a display name
    pub to: Mailbox,

    /// Subject line
    pub subject: String,

    /// Plain-text body (UTF-8)
    pub text_body: String,
}

impl TryFrom<proto::mail_v1::SendEmail> for SendEmail {
    type Error = AddressError;

    fn try_from(proto: proto::mail_v1::SendEmail) -> Result<Self, Self::Error> {
        Ok(Self {
            to: proto.to.parse()?,
            subject: proto.subject,
            text_body: proto.text_body,
        })
    }
}

impl From<SendEmail> for proto::mail_v1::SendEmail {
    fn from(email: SendEmail) -> Self {
        Self {
            to: email.to.to_string(),
            subject: email.subject,
            text_body: email.text_body,
        }
    }
}

impl NatsPayload for SendEmail {
    type Proto = proto::mail_v1::SendEmail;
}
