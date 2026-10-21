//! Outgoing mail, handed to the `mail-gateway` service over NATS

use galvyn::core::Module;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::IdentityModule;
use serde::Deserialize;
use serde::Serialize;
#[cfg(not(test))]
use service_bootstrap::nats::publisher::Nats;
use tracing::instrument;
use url::Url;

use crate::models::account::Username;
use crate::proto;

/// Error returned when a mail could not be handed to the gateway
pub type MailError = async_nats::jetstream::context::PublishError;

/// The language an outgoing mail is written in
///
/// Chosen by the client from the language its UI is showing — the mail should
/// read like the page that caused it. Not persisted anywhere: every mail is
/// triggered by a request, and that request carries the language.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum MailLanguage {
    /// German — the default, matching the app's primary language
    #[default]
    De,
    /// English
    En,
}

/// How many days a freshly issued Registration link stays usable
fn link_validity_days() -> i64 {
    IdentityModule::global()
        .registration_link_validity()
        .whole_days()
}

/// Send the one-time passkey registration link to a new account
///
/// The mail is only queued here; delivery is the `mail-gateway`'s job.
#[instrument(name = "mail::send_registration_link", skip(link))]
pub async fn send_registration_link(
    to: &MaxStr<255>,
    username: &Username,
    link: &Url,
    language: MailLanguage,
) -> Result<(), MailError> {
    let days = link_validity_days();
    let username = username.as_str();

    let (subject, text_body) = match language {
        MailLanguage::De => (
            "Registrierung abschließen",
            format!(
                "Hallo {username},\n\
                 \n\
                 du (oder jemand mit deiner Mailadresse) hat ein Konto angelegt.\n\
                 Über den folgenden Link registrierst du deinen Passkey und schließt\n\
                 die Anmeldung ab:\n\
                 \n\
                 {link}\n\
                 \n\
                 Der Link ist {days} Tage gültig und kann nur einmal verwendet werden.\n\
                 \n\
                 Wenn du das nicht warst, ignoriere diese Mail einfach - ohne den Link\n\
                 passiert nichts.\n",
            ),
        ),
        MailLanguage::En => (
            "Complete your registration",
            format!(
                "Hello {username},\n\
                 \n\
                 you (or someone using your email address) created an account.\n\
                 Use the following link to register your passkey and complete\n\
                 the sign-up:\n\
                 \n\
                 {link}\n\
                 \n\
                 The link is valid for {days} days and can only be used once.\n\
                 \n\
                 If this wasn't you, simply ignore this mail - nothing happens\n\
                 without the link.\n",
            ),
        ),
    };

    queue(proto::mail_v1::SendEmail {
        to: to.to_string(),
        subject: String::from(subject),
        text_body,
        ..Default::default()
    })
    .await
}

/// Send a fresh one-time registration link to an existing account
///
/// The "lost passkey" mail: the same link mechanics as the signup mail, but
/// different words — the reader did not just create an account, they asked to
/// get back into one. Registering over the link is additive, so the mail says
/// explicitly that existing passkeys keep working.
#[instrument(name = "mail::send_recovery_link", skip(link))]
pub async fn send_recovery_link(
    to: &MaxStr<255>,
    username: &Username,
    link: &Url,
    language: MailLanguage,
) -> Result<(), MailError> {
    let days = link_validity_days();
    let username = username.as_str();

    let (subject, text_body) = match language {
        MailLanguage::De => (
            "Neuen Passkey registrieren",
            format!(
                "Hallo {username},\n\
                 \n\
                 du (oder jemand mit deinem Benutzernamen) hat einen neuen\n\
                 Registrierungslink für dein Konto angefordert - zum Beispiel,\n\
                 weil ein Passkey verloren gegangen ist.\n\
                 \n\
                 Über den folgenden Link registrierst du auf deinem Gerät einen\n\
                 neuen Passkey:\n\
                 \n\
                 {link}\n\
                 \n\
                 Der Link ist {days} Tage gültig und kann nur einmal verwendet werden.\n\
                 Deine bestehenden Passkeys funktionieren unverändert weiter.\n\
                 \n\
                 Wenn du das nicht warst, ignoriere diese Mail einfach - ohne den\n\
                 Link passiert nichts.\n",
            ),
        ),
        MailLanguage::En => (
            "Register a new passkey",
            format!(
                "Hello {username},\n\
                 \n\
                 you (or someone using your username) requested a new\n\
                 registration link for your account - for example because a\n\
                 passkey was lost.\n\
                 \n\
                 Use the following link to register a new passkey on your\n\
                 device:\n\
                 \n\
                 {link}\n\
                 \n\
                 The link is valid for {days} days and can only be used once.\n\
                 Your existing passkeys keep working unchanged.\n\
                 \n\
                 If this wasn't you, simply ignore this mail - nothing happens\n\
                 without the link.\n",
            ),
        ),
    };

    queue(proto::mail_v1::SendEmail {
        to: to.to_string(),
        subject: String::from(subject),
        text_body,
        ..Default::default()
    })
    .await
}

/// Hand a mail to the gateway
///
/// Tests have no NATS: there the mail lands in the `outbox` instead.
async fn queue(mail: proto::mail_v1::SendEmail) -> Result<(), MailError> {
    #[cfg(test)]
    {
        outbox::push(mail);
        Ok(())
    }
    #[cfg(not(test))]
    {
        Nats::global()
            .publish(nats_subjects::mail::v1::SEND, mail)
            .await?;
        Ok(())
    }
}

/// The mails tests have sent, in place of the gateway
#[cfg(test)]
pub mod outbox {
    use std::sync::Mutex;

    use crate::proto::mail_v1::SendEmail;

    /// Every mail sent by any test of this binary
    static SENT: Mutex<Vec<SendEmail>> = Mutex::new(Vec::new());

    /// Records a sent mail
    pub(super) fn push(mail: SendEmail) {
        SENT.lock().unwrap_or_else(|e| e.into_inner()).push(mail);
    }

    /// The mails sent to `address` so far
    ///
    /// Tests run in parallel against one outbox, so they look up their own
    /// recipients rather than counting all mails.
    pub fn sent_to(address: &str) -> Vec<SendEmail> {
        SENT.lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .filter(|mail| mail.to == address)
            .cloned()
            .collect()
    }
}
