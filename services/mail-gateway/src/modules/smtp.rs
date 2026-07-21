//! Global module providing the configured SMTP transport

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use lettre::AsyncSmtpTransport;
use lettre::Tokio1Executor;
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use secrecy::ExposeSecret;

use crate::config::Config;
use crate::config::SmtpSecurity;

/// Global module wrapping the SMTP connection pool
pub struct SmtpModule {
    /// The configured SMTP transport
    pub transport: AsyncSmtpTransport<Tokio1Executor>,

    /// Sender address for all outgoing mail
    pub mail_from: Mailbox,
}

/// Setup for [`SmtpModule`], the option must be filled
#[derive(Debug, Default)]
pub struct SmtpSetup {
    /// The service's configuration
    pub config: Option<Config>,
}

impl Module for SmtpModule {
    type Setup = SmtpSetup;
    type PreInit = Self;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        let config = setup.config.ok_or("config must be set in SmtpSetup")?;

        let mut builder = match config.smtp_security {
            SmtpSecurity::None => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(
                &config.smtp_host,
            ),
            SmtpSecurity::StartTls => {
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
                    .map_err(|e| format!("Invalid SMTP configuration: {e}"))?
            }
            SmtpSecurity::Implicit => {
                AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
                    .map_err(|e| format!("Invalid SMTP configuration: {e}"))?
            }
        }
        .port(config.smtp_port);

        if let Some((user, password)) = config.smtp_credentials {
            builder = builder.credentials(Credentials::new(
                user,
                password.expose_secret().to_string(),
            ));
        }

        Ok(Self {
            transport: builder.build(),
            mail_from: config.mail_from,
        })
    }

    type Dependencies = ();

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        Ok(pre_init)
    }
}
