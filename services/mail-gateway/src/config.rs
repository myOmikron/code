//! The configuration of `mail-gateway`

use std::str::FromStr;

use lettre::message::Mailbox;
use secrecy::SecretString;
use service_bootstrap::config::ConfigError;
use service_bootstrap::config::EnvLoader;

/// The configuration of mail-gateway
#[derive(Debug, Clone)]
pub struct Config {
    /// Hostname of the SMTP relay
    pub smtp_host: String,

    /// Port of the SMTP relay
    pub smtp_port: u16,

    /// Optional SMTP credentials (username + password)
    pub smtp_credentials: Option<(String, SecretString)>,

    /// Connection security towards the SMTP relay
    pub smtp_security: SmtpSecurity,

    /// Sender address for all outgoing mail
    pub mail_from: Mailbox,
}

/// Connection security towards the SMTP relay
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmtpSecurity {
    /// Plaintext SMTP - only for local development (e.g. mailpit)
    None,
    /// Plaintext connection upgraded via STARTTLS
    StartTls,
    /// Implicit TLS from the first byte (SMTPS)
    Implicit,
}

impl FromStr for SmtpSecurity {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "none" => Ok(Self::None),
            "starttls" => Ok(Self::StartTls),
            "implicit" => Ok(Self::Implicit),
            _ => Err(format!(
                "invalid value {s:?}, expected one of: none, starttls, implicit"
            )),
        }
    }
}

/// Load and validate all env vars. Reports all errors at once.
pub fn load() -> Result<Config, ConfigError> {
    let mut env = EnvLoader::new();

    let smtp_host = env.require("SMTP_HOST");
    let smtp_port = env.optional_parse::<u16>("SMTP_PORT", "587");
    let smtp_security = env.optional_parse::<SmtpSecurity>("SMTP_SECURITY", "starttls");
    let mail_from = env.require_parse::<Mailbox>("MAIL_FROM");

    // SMTP_USER is optional, but if it is set a password is required as well.
    let smtp_user = env.optional("SMTP_USER", "");
    let smtp_password = (!smtp_user.is_empty()).then(|| env.require("SMTP_PASSWORD"));

    env.finish()?;

    Ok(Config {
        smtp_host: smtp_host.unwrap(),
        smtp_port: smtp_port.unwrap(),
        smtp_credentials: smtp_password
            .map(|password| (smtp_user, SecretString::from(password.unwrap()))),
        smtp_security: smtp_security.unwrap(),
        mail_from: mail_from.unwrap(),
    })
}
