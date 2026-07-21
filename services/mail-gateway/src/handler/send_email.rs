//! Handler for `mail.v1.send`

use galvyn::core::Module;
use lettre::AsyncTransport;
use service_bootstrap::nats::listener::DontAck;
use service_bootstrap::nats::listener::OwnedInfo;
use service_bootstrap::nats::listener::TypedMessage;
use tracing::info;

use crate::models::SendEmail;
use crate::modules::smtp::SmtpModule;

/// Delivers a single [`SendEmail`] message via SMTP
pub async fn send_email(
    _info: OwnedInfo,
    msg: TypedMessage<SendEmail>,
) -> Result<(), DontAck> {
    let SendEmail {
        to,
        subject,
        text_body,
    } = msg.payload;

    let email = lettre::Message::builder()
        .from(SmtpModule::global().mail_from.clone())
        .to(to.clone())
        .subject(subject)
        .body(text_body)
        // The message itself is broken beyond repair - retrying won't help
        .map_err(DontAck::dlq)?;

    // SMTP failures are most likely transient (relay down, connection hiccup)
    SmtpModule::global()
        .transport
        .send(email)
        .await
        .map_err(DontAck::retry)?;

    info!(email.to = %to, "Delivered email");
    Ok(())
}
