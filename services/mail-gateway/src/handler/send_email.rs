//! Handler for `mail.v1.send`

use galvyn::core::Module;
use lettre::AsyncTransport;
use lettre::Message;
use lettre::error::Error as EmailError;
use lettre::message::Mailbox;
use lettre::message::MultiPart;
use lettre::message::SinglePart;
use lettre::message::header::ContentType;
use service_bootstrap::nats::listener::DontAck;
use service_bootstrap::nats::listener::OwnedInfo;
use service_bootstrap::nats::listener::TypedMessage;
use tracing::info;

use crate::models::SendEmail;
use crate::modules::smtp::SmtpModule;

/// Delivers a single [`SendEmail`] message via SMTP
pub async fn send_email(_info: OwnedInfo, msg: TypedMessage<SendEmail>) -> Result<(), DontAck> {
    let to = msg.payload.to.clone();

    let email = build_message(SmtpModule::global().mail_from.clone(), msg.payload)
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

/// Builds the message `email` is sent as, from the gateway's sender address `from`
fn build_message(from: Mailbox, email: SendEmail) -> Result<Message, EmailError> {
    let SendEmail {
        to,
        cc,
        subject,
        text_body,
        attachments,
    } = email;

    let mut builder = Message::builder().from(from).to(to).subject(subject);
    for recipient in cc {
        builder = builder.cc(recipient);
    }

    if attachments.is_empty() {
        return builder.header(ContentType::TEXT_PLAIN).body(text_body);
    }

    let multipart = attachments.into_iter().fold(
        MultiPart::mixed().singlepart(SinglePart::plain(text_body)),
        |multipart, attachment| {
            multipart.singlepart(
                lettre::message::Attachment::new(attachment.filename)
                    .body(attachment.content, attachment.content_type.into()),
            )
        },
    );
    builder.multipart(multipart)
}

#[cfg(test)]
mod tests {
    use lettre::message::Mailbox;

    use super::build_message;
    use crate::models::InvalidEmail;
    use crate::models::SendEmail;
    use crate::proto;

    fn formatted(email: proto::mail_v1::SendEmail) -> String {
        let from: Mailbox = "Gateway <gateway@example.com>".parse().unwrap();
        let email = SendEmail::try_from(email).unwrap();
        String::from_utf8(build_message(from, email).unwrap().formatted()).unwrap()
    }

    fn plain_email() -> proto::mail_v1::SendEmail {
        proto::mail_v1::SendEmail {
            to: String::from("Erika Muster <erika@example.com>"),
            subject: String::from("Bestellung"),
            text_body: String::from("Grüße"),
            ..Default::default()
        }
    }

    #[test]
    fn cc_recipients_are_in_the_cc_header() {
        let message = formatted(proto::mail_v1::SendEmail {
            cc: vec![
                String::from("max@example.com"),
                String::from("Lisa Lustig <lisa@example.com>"),
            ],
            ..plain_email()
        });

        let cc = message
            .lines()
            .find(|line| line.starts_with("Cc: "))
            .expect("no Cc header");
        assert_eq!(
            cc,
            "Cc: max@example.com, \"Lisa Lustig\" <lisa@example.com>"
        );
    }

    #[test]
    fn without_attachments_the_message_is_plain_text() {
        let message = formatted(plain_email());

        assert!(message.contains("Content-Type: text/plain; charset=utf-8\r\n"));
        assert!(!message.contains("multipart"));
        assert!(
            message.ends_with("\r\n\r\nR3LDvMOfZQ=="),
            "body is not \"Grüße\" in base64"
        );
    }

    #[test]
    fn attachments_make_a_multipart_message_keeping_each_file() {
        let message = formatted(proto::mail_v1::SendEmail {
            attachments: vec![
                proto::mail_v1::Attachment {
                    filename: String::from("rechnung.pdf"),
                    content_type: String::from("application/pdf"),
                    content: b"%PDF\xff\x00".to_vec(),
                },
                proto::mail_v1::Attachment {
                    filename: String::from("notiz.txt"),
                    content_type: String::from("text/plain"),
                    content: b"Hallo".to_vec(),
                },
            ],
            ..plain_email()
        });

        assert!(message.contains("Content-Type: multipart/mixed;"));
        let parts: Vec<&str> = message.split("\r\n--").skip(1).collect();
        assert_eq!(parts.len(), 4, "body, two attachments, closing boundary");

        assert!(parts[0].contains("Content-Type: text/plain; charset=utf-8\r\n"));
        assert!(parts[0].ends_with("\r\n\r\nR3LDvMOfZQ=="));

        assert!(parts[1].contains("Content-Disposition: attachment; filename=\"rechnung.pdf\""));
        assert!(parts[1].contains("Content-Type: application/pdf\r\n"));
        assert!(parts[1].ends_with("\r\n\r\nJVBERv8A"), "{:?}", parts[1]);

        assert!(parts[2].contains("Content-Disposition: attachment; filename=\"notiz.txt\""));
        assert!(parts[2].contains("Content-Type: text/plain\r\n"));
        assert!(parts[2].ends_with("\r\n\r\nHallo"), "{:?}", parts[2]);
    }

    #[test]
    fn an_attachment_without_a_valid_content_type_is_rejected() {
        let email = SendEmail::try_from(proto::mail_v1::SendEmail {
            attachments: vec![proto::mail_v1::Attachment {
                filename: String::from("rechnung.pdf"),
                content_type: String::from("pdf"),
                content: b"%PDF".to_vec(),
            }],
            ..plain_email()
        });

        assert!(matches!(email, Err(InvalidEmail::ContentType(_))));
    }
}
