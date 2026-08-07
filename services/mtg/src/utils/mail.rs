//! Outgoing mail, handed to the `mail-gateway` service over NATS

use galvyn::core::Module;
use galvyn::rorm::fields::types::MaxStr;
use service_bootstrap::nats::publisher::Nats;
use tracing::instrument;
use url::Url;

use crate::models::accounts::RegistrationToken;
use crate::models::accounts::Username;
use crate::proto;

/// Error returned when a mail could not be handed to the gateway
pub type MailError = async_nats::jetstream::context::PublishError;

/// Send the one-time passkey registration link to a new account
///
/// The mail is only queued here; delivery is the `mail-gateway`'s job.
#[instrument(name = "mail::send_registration_link", skip(link))]
pub async fn send_registration_link(
    to: &MaxStr<255>,
    username: &Username,
    link: &Url,
) -> Result<(), MailError> {
    let days = RegistrationToken::VALIDITY.whole_days();

    let text_body = format!(
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
        username = username.as_str(),
    );

    Nats::global()
        .publish(
            nats_subjects::mail::v1::SEND,
            proto::mail_v1::SendEmail {
                to: to.to_string(),
                subject: String::from("Registrierung abschließen"),
                text_body,
            },
        )
        .await?;

    Ok(())
}
