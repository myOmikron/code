//! Outgoing mail, handed to the `mail-gateway` service over NATS
//!
//! Nothing here talks SMTP: a mail is a NATS message, and the gateway owns
//! delivery. A failed publish must never take an order down with it — the
//! callers log it and carry on.
//!
//! The mails leave through a [`MailSink`], so the tests can record them
//! instead of needing a NATS server.

use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::OnceLock;

use galvyn::core::Module;
use service_bootstrap::nats::publisher::Nats;
use time::Date;
use time::Month;
use time::OffsetDateTime;
use time::Weekday;
use tracing::instrument;
use url::Url;

use crate::models::OrderItem;
use crate::models::OrderLanguage;
use crate::proto;
use crate::utils::bakery;

/// Error returned when a mail could not be handed to the gateway
#[derive(Debug)]
pub struct MailError(Box<dyn std::error::Error + Send + Sync>);

impl MailError {
    /// Wrap whatever kept the mail from leaving
    pub fn new(error: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self(error.into())
    }
}

impl fmt::Display for MailError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl std::error::Error for MailError {}

/// The future a [`MailSink`] answers with
pub type SendFuture<'a> = Pin<Box<dyn Future<Output = Result<(), MailError>> + Send + 'a>>;

/// Where outgoing mails are handed over
///
/// Takes the gateway's message as is, CC and attachments included, so a new
/// kind of mail never needs a change here.
pub trait MailSink: Send + Sync {
    /// Hand the mail over, resolving once it was accepted
    fn send(&self, mail: proto::mail_v1::SendEmail) -> SendFuture<'_>;
}

/// The production sink: publishes to the gateway's NATS subject
///
/// Resolves once JetStream acknowledged the message, so `Ok` means the mail
/// is stored and the gateway will deliver it.
pub struct NatsMailSink;

impl MailSink for NatsMailSink {
    fn send(&self, mail: proto::mail_v1::SendEmail) -> SendFuture<'_> {
        Box::pin(async move {
            Nats::global()
                .publish(nats_subjects::mail::v1::SEND, mail)
                .await
                .map_err(MailError::new)?;
            Ok(())
        })
    }
}

/// What outgoing mails need, set once at startup
///
/// Mails are also sent by the deadline job, which has no request to read the
/// host from, so the configured origin is stashed here.
struct Mailer {
    /// The origin customer links are built from
    public_origin: Url,
    /// Where the mails go
    sink: Arc<dyn MailSink>,
}

/// The [`Mailer`], once [`init`] ran
static MAILER: OnceLock<Mailer> = OnceLock::new();

/// Remember the public origin for the links in outgoing mails and the sink they leave through
pub fn init(public_origin: Url, sink: Arc<dyn MailSink>) {
    let _ = MAILER.set(Mailer {
        public_origin,
        sink,
    });
}

/// The link a customer opens to see their order
fn order_link(pickup_code: &str) -> Option<Url> {
    let mut link = MAILER.get()?.public_origin.clone();
    link.set_path(&format!("/order/{pickup_code}"));
    Some(link)
}

/// Squeeze any run of whitespace into a single space
///
/// Second line of defence for the customer's name, which the order handler
/// already refuses with control characters in it: whatever reaches a mail
/// body from a customer stays on the line it was put on.
fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// One position, as a mail prints it
pub struct MailPosition {
    /// Item name (snapshot at order time)
    pub name: String,
    /// How many units were ordered
    pub quantity: i64,
    /// Price per unit in euro cents (snapshot at order time)
    pub price_cents: i64,
}

impl From<&OrderItem> for MailPosition {
    fn from(value: &OrderItem) -> Self {
        Self {
            name: value.name.to_string(),
            quantity: value.quantity,
            price_cents: value.price_cents,
        }
    }
}

/// Everything a mail about an order needs
///
/// Spelled out rather than taking an [`Order`](crate::models::Order): the mail
/// after placing an order is sent before it is read back from the database.
pub struct OrderMail<'a> {
    /// The customer-facing order code
    pub pickup_code: &'a str,
    /// The customer's name
    pub customer_name: &'a str,
    /// The customer's email address — no address, no mail
    pub email: Option<&'a str>,
    /// The language the mail is written in
    pub language: OrderLanguage,
    /// The date the order is picked up on
    pub pickup_date: Date,
    /// The point in time the order becomes binding
    pub deadline: OffsetDateTime,
    /// The order's positions
    pub positions: &'a [MailPosition],
}

impl OrderMail<'_> {
    /// Total over all positions in euro cents
    fn total_cents(&self) -> i64 {
        self.positions
            .iter()
            .map(|p| p.price_cents * p.quantity)
            .sum()
    }

    /// The positions as a plain-text block, one per line
    fn position_lines(&self) -> String {
        self.positions
            .iter()
            .map(|p| {
                format!(
                    "  {} x {} — {}\n",
                    p.quantity,
                    p.name,
                    format_price(p.price_cents * p.quantity, self.language)
                )
            })
            .collect()
    }
}

/// Format euro cents the way the respective language writes money
fn format_price(cents: i64, language: OrderLanguage) -> String {
    let euro = cents / 100;
    let rest = (cents % 100).abs();
    match language {
        OrderLanguage::De => format!("{euro},{rest:02} €"),
        OrderLanguage::En => format!("€{euro}.{rest:02}"),
    }
}

/// Format a date with its weekday spelled out
fn format_date(date: Date, language: OrderLanguage) -> String {
    let weekday = weekday_name(date.weekday(), language);
    match language {
        OrderLanguage::De => format!(
            "{weekday}, {:02}.{:02}.{}",
            date.day(),
            u8::from(date.month()),
            date.year()
        ),
        OrderLanguage::En => format!(
            "{weekday}, {} {}, {}",
            month_name(date.month()),
            date.day(),
            date.year()
        ),
    }
}

/// Format a point in time as "date, HH:MM"
fn format_datetime(datetime: OffsetDateTime, language: OrderLanguage) -> String {
    format!(
        "{} {:02}:{:02}",
        format_date(datetime.date(), language),
        datetime.hour(),
        datetime.minute()
    )
}

/// The weekday's name
fn weekday_name(weekday: Weekday, language: OrderLanguage) -> &'static str {
    match (language, weekday) {
        (OrderLanguage::De, Weekday::Monday) => "Montag",
        (OrderLanguage::De, Weekday::Tuesday) => "Dienstag",
        (OrderLanguage::De, Weekday::Wednesday) => "Mittwoch",
        (OrderLanguage::De, Weekday::Thursday) => "Donnerstag",
        (OrderLanguage::De, Weekday::Friday) => "Freitag",
        (OrderLanguage::De, Weekday::Saturday) => "Samstag",
        (OrderLanguage::De, Weekday::Sunday) => "Sonntag",
        (OrderLanguage::En, Weekday::Monday) => "Monday",
        (OrderLanguage::En, Weekday::Tuesday) => "Tuesday",
        (OrderLanguage::En, Weekday::Wednesday) => "Wednesday",
        (OrderLanguage::En, Weekday::Thursday) => "Thursday",
        (OrderLanguage::En, Weekday::Friday) => "Friday",
        (OrderLanguage::En, Weekday::Saturday) => "Saturday",
        (OrderLanguage::En, Weekday::Sunday) => "Sunday",
    }
}

/// The month's english name
fn month_name(month: Month) -> &'static str {
    match month {
        Month::January => "January",
        Month::February => "February",
        Month::March => "March",
        Month::April => "April",
        Month::May => "May",
        Month::June => "June",
        Month::July => "July",
        Month::August => "August",
        Month::September => "September",
        Month::October => "October",
        Month::November => "November",
        Month::December => "December",
    }
}

/// Hand a mail to the gateway
pub async fn send(mail: proto::mail_v1::SendEmail) -> Result<(), MailError> {
    let mailer = MAILER
        .get()
        .ok_or_else(|| MailError::new("no mail sink was set up"))?;
    mailer.sink.send(mail).await
}

/// Hand a plain-text mail to a single recipient to the gateway
async fn publish(to: &str, subject: &str, text_body: String) -> Result<(), MailError> {
    send(proto::mail_v1::SendEmail {
        to: to.to_string(),
        subject: subject.to_string(),
        text_body,
        ..Default::default()
    })
    .await
}

/// Send the Bakery order of a pickup day, the CSV attached
///
/// Always German: it goes to the Bakery, whatever language the customers
/// ordered in. Resolves once the gateway's stream acknowledged the mail.
#[instrument(name = "mail::send_bakery_order", skip(csv))]
pub async fn send_bakery_order(
    to: &str,
    cc: Option<&str>,
    pickup_date: Date,
    csv: Vec<u8>,
) -> Result<(), MailError> {
    let pickup = format_date(pickup_date, OrderLanguage::De);
    send(proto::mail_v1::SendEmail {
        to: to.to_string(),
        cc: cc.into_iter().map(String::from).collect(),
        subject: format!("Bestellung Nachbarschaftshilfe für {pickup}"),
        text_body: format!("Anbei unsere Bestellung für die Abholung am {pickup}.\n"),
        attachments: vec![proto::mail_v1::Attachment {
            filename: bakery::filename(pickup_date),
            content_type: bakery::CONTENT_TYPE.to_string(),
            content: csv,
        }],
    })
    .await
}

/// Confirm that an order arrived — sent right after it was placed
///
/// Not the binding confirmation: until the deadline the customer may still
/// cancel, and the mail says so.
#[instrument(name = "mail::send_order_received", skip(mail))]
pub async fn send_order_received(mail: &OrderMail<'_>) -> Result<(), MailError> {
    let Some(to) = mail.email else {
        return Ok(());
    };
    let code = mail.pickup_code;
    let link = order_link(code).map(String::from).unwrap_or_default();
    let name = one_line(mail.customer_name);
    let positions = mail.position_lines();
    let total = format_price(mail.total_cents(), mail.language);
    let pickup = format_date(mail.pickup_date, mail.language);
    let deadline = format_datetime(mail.deadline, mail.language);

    let (subject, text_body) = match mail.language {
        OrderLanguage::De => (
            format!("Deine Vorbestellung {code}"),
            format!(
                "Hallo {name},\n\
                 \n\
                 wir haben deine Vorbestellung erhalten. Dein Abholcode:\n\
                 \n\
                 {code}\n\
                 \n\
                 Deine Bestellung:\n\
                 {positions}\
                 Summe: {total}\n\
                 \n\
                 Abholung: {pickup}\n\
                 Bezahlt wird bei der Abholung im Laden.\n\
                 \n\
                 Bis {deadline} kannst du die Bestellung hier noch ändern\n\
                 oder stornieren:\n\
                 \n\
                 {link}\n\
                 \n\
                 Danach ist sie verbindlich - wir bestellen dann bei der Bäckerei.\n",
            ),
        ),
        OrderLanguage::En => (
            format!("Your pre-order {code}"),
            format!(
                "Hello {name},\n\
                 \n\
                 we received your pre-order. Your pickup code:\n\
                 \n\
                 {code}\n\
                 \n\
                 Your order:\n\
                 {positions}\
                 Total: {total}\n\
                 \n\
                 Pickup: {pickup}\n\
                 You pay in the shop when you collect it.\n\
                 \n\
                 Until {deadline} you can still review or cancel it here:\n\
                 \n\
                 {link}\n\
                 \n\
                 After that it is binding - we order at the bakery then.\n",
            ),
        ),
    };

    publish(to, &subject, text_body).await
}

/// Confirm an order for good — sent when its pickup day is frozen
#[instrument(name = "mail::send_order_confirmed", skip(mail))]
pub async fn send_order_confirmed(mail: &OrderMail<'_>) -> Result<(), MailError> {
    let Some(to) = mail.email else {
        return Ok(());
    };
    let code = mail.pickup_code;
    let link = order_link(code).map(String::from).unwrap_or_default();
    let name = one_line(mail.customer_name);
    let positions = mail.position_lines();
    let total = format_price(mail.total_cents(), mail.language);
    let pickup = format_date(mail.pickup_date, mail.language);

    let (subject, text_body) = match mail.language {
        OrderLanguage::De => (
            format!("Vorbestellung {code} ist verbindlich"),
            format!(
                "Hallo {name},\n\
                 \n\
                 der Bestellschluss ist vorbei, deine Vorbestellung steht fest:\n\
                 \n\
                 {positions}\
                 Summe: {total}\n\
                 \n\
                 Abholung: {pickup}\n\
                 Abholcode: {code}\n\
                 \n\
                 Zeig den Code im Laden vor - am schnellsten geht es mit dem\n\
                 QR-Code auf dieser Seite:\n\
                 \n\
                 {link}\n\
                 \n\
                 Bezahlt wird bei der Abholung. Wir freuen uns auf dich!\n",
            ),
        ),
        OrderLanguage::En => (
            format!("Pre-order {code} is binding now"),
            format!(
                "Hello {name},\n\
                 \n\
                 orders are closed, your pre-order is fixed:\n\
                 \n\
                 {positions}\
                 Total: {total}\n\
                 \n\
                 Pickup: {pickup}\n\
                 Pickup code: {code}\n\
                 \n\
                 Show the code in the shop - the QR code on this page is the\n\
                 quickest way:\n\
                 \n\
                 {link}\n\
                 \n\
                 You pay when you collect it. See you there!\n",
            ),
        ),
    };

    publish(to, &subject, text_body).await
}

/// Tell a customer that staff cancelled their order
///
/// The pickup day itself still takes place; only this one order is off.
#[instrument(name = "mail::send_order_cancelled_by_staff", skip(mail))]
pub async fn send_order_cancelled_by_staff(mail: &OrderMail<'_>) -> Result<(), MailError> {
    let Some(to) = mail.email else {
        return Ok(());
    };
    let code = mail.pickup_code;
    let name = one_line(mail.customer_name);
    let pickup = format_date(mail.pickup_date, mail.language);

    let (subject, text_body) = match mail.language {
        OrderLanguage::De => (
            format!("Vorbestellung {code} storniert"),
            format!(
                "Hallo {name},\n\
                 \n\
                 deine Vorbestellung {code} für die Abholung am {pickup} wurde\n\
                 von der Nachbarschaftshilfe storniert. Es entstehen dir keine\n\
                 Kosten.\n\
                 \n\
                 Bei Fragen melde dich gern bei uns im Laden.\n",
            ),
        ),
        OrderLanguage::En => (
            format!("Pre-order {code} cancelled"),
            format!(
                "Hello {name},\n\
                 \n\
                 your pre-order {code} for pickup on {pickup} was cancelled\n\
                 by the Nachbarschaftshilfe, at no cost to you.\n\
                 \n\
                 If you have any questions, just ask us in the shop.\n",
            ),
        ),
    };

    publish(to, &subject, text_body).await
}

/// Tell a customer their pickup day was called off
#[instrument(name = "mail::send_order_cancelled", skip(mail))]
pub async fn send_order_cancelled(mail: &OrderMail<'_>) -> Result<(), MailError> {
    let Some(to) = mail.email else {
        return Ok(());
    };
    let code = mail.pickup_code;
    let name = one_line(mail.customer_name);
    let pickup = format_date(mail.pickup_date, mail.language);

    let (subject, text_body) = match mail.language {
        OrderLanguage::De => (
            format!("Vorbestellung {code} abgesagt"),
            format!(
                "Hallo {name},\n\
                 \n\
                 leider müssen wir den Abholtermin am {pickup} absagen.\n\
                 Deine Vorbestellung {code} wurde deshalb storniert - es\n\
                 entstehen dir keine Kosten.\n\
                 \n\
                 Für den nächsten Termin kannst du jederzeit neu bestellen.\n\
                 Entschuldige die Umstände!\n",
            ),
        ),
        OrderLanguage::En => (
            format!("Pre-order {code} cancelled"),
            format!(
                "Hello {name},\n\
                 \n\
                 unfortunately we have to call off the pickup day on {pickup}.\n\
                 Your pre-order {code} was cancelled - at no cost to you.\n\
                 \n\
                 You are welcome to order again for the next pickup day.\n\
                 Sorry for the inconvenience!\n",
            ),
        ),
    };

    publish(to, &subject, text_body).await
}
