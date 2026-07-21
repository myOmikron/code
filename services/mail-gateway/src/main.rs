//! # mail-gateway
//!
//! Consumes `mail.>` NATS messages and delivers them via SMTP.
//!
//! The gateway is a dumb transport: producers render the complete subject and
//! body and publish a `mail.v1.SendEmail`; this service only hands it to the
//! configured SMTP relay.
#![warn(missing_docs)]

use std::error::Error;

use clap::Parser;
use galvyn::RouterBuilder;
use galvyn::error::GalvynError;
use service_bootstrap::nats::listener::NatsListener;
use service_bootstrap::nats::listener::NatsListenerSetup;
use service_bootstrap::nats::publisher::Nats;
use service_bootstrap::nats::publisher::NatsSetup;

use crate::cli::Cli;
use crate::cli::Command;
use crate::config::Config;
use crate::modules::smtp::SmtpModule;
use crate::modules::smtp::SmtpSetup;

pub mod cli;
pub mod config;
pub mod handler;
pub mod models;
pub mod modules;
pub mod proto;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();

    match &cli.command {
        Command::Start => {
            service_bootstrap::run("mail-gateway", config::load, run).await;
        }
    }
}

async fn run(
    mut builder: galvyn::ModuleBuilder,
    config: Config,
) -> Result<RouterBuilder, GalvynError> {
    let builder = builder
        .register_module::<Nats>(NatsSetup::FromEnv)
        .register_module::<SmtpModule>(SmtpSetup {
            config: Some(config),
        })
        .register_module::<NatsListener>(NatsListenerSetup::default().add_consumer(
            nats_subjects::mail::STREAM,
            "mail-gateway",
            |router| {
                router.add_subject(nats_subjects::mail::v1::SEND, handler::send_email::send_email);
            },
        ))
        .init_modules()
        .await?;

    // No public HTTP api - service-bootstrap adds the internal :9090 listener itself.
    Ok(builder)
}
