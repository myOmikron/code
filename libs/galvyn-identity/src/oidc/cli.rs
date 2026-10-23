//! The cli subcommand adding an OpenID provider

use galvyn::rorm::db::executor::Executor;

use super::error::AddOpenIdProviderError;
use super::provider::Admission;
use super::provider::DEFAULT_IDENTIFYING_CLAIM;
use super::provider::NewOpenIdProvider;
use crate::IdentityModule;

/// Add an OpenID provider people may log in through
///
/// For bootstrapping a service whose only login is OIDC. A service mounts it
/// as a subcommand of its cli, connects to its database and hands it to
/// [`AddOpenIdProviderCommand::run`]. Its redirect uri is the service's
/// public origin and OIDC callback path, followed by the slug.
#[derive(Debug, Clone, clap::Args)]
pub struct AddOpenIdProviderCommand {
    /// The service's own short name for the provider, e.g. `authentik`
    ///
    /// Lowercase letters, digits and `-`; it ends the redirect uri.
    #[arg(long)]
    pub slug: String,

    /// What the login page calls the provider, e.g. `Authentik`
    #[arg(long)]
    pub display_name: String,

    /// The url of the provider's discovery document, or its issuer
    #[arg(long)]
    pub discovery_url: String,

    /// The client id the provider issued the service
    #[arg(long)]
    pub client_id: String,

    /// The client secret the provider issued the service, stored in plain text
    #[arg(long)]
    pub client_secret: String,

    /// The ID token claim whose value identifies a person
    #[arg(long, default_value = DEFAULT_IDENTIFYING_CLAIM)]
    pub identifying_claim: String,

    /// Who the provider admits on their first OIDC login
    #[arg(long, value_enum, default_value_t = CliAdmission::Open)]
    pub admission: CliAdmission,
}

/// [`Admission`] as the cli names it
#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum CliAdmission {
    /// Everyone the provider vouches for
    Open,
    /// Only those holding a Registration link
    InviteOnly,
}

impl AddOpenIdProviderCommand {
    /// The provider the command adds
    pub fn provider(&self) -> NewOpenIdProvider {
        NewOpenIdProvider {
            slug: self.slug.clone(),
            display_name: self.display_name.clone(),
            discovery_url: self.discovery_url.clone(),
            client_id: self.client_id.clone(),
            client_secret: self.client_secret.clone(),
            identifying_claim: self.identifying_claim.clone(),
            admission: match self.admission {
                CliAdmission::Open => Admission::Open,
                CliAdmission::InviteOnly => Admission::InviteOnly,
            },
        }
    }

    /// Add the provider through `exe`
    pub async fn run(&self, exe: impl Executor<'_>) -> Result<(), AddOpenIdProviderError> {
        IdentityModule::add_openid_provider(exe, &self.provider()).await
    }
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::*;

    #[derive(Parser)]
    struct Cli {
        #[command(flatten)]
        command: AddOpenIdProviderCommand,
    }

    fn parse(args: &[&str]) -> NewOpenIdProvider {
        let base = [
            "service",
            "--slug",
            "authentik",
            "--display-name",
            "Authentik",
            "--discovery-url",
            "https://auth.example.org/application/o/mtg/",
            "--client-id",
            "client",
            "--client-secret",
            "secret",
        ];
        Cli::try_parse_from(base.iter().chain(args))
            .unwrap_or_else(|error| panic!("parse: {error}"))
            .command
            .provider()
    }

    #[test]
    fn a_provider_identifies_by_subject_and_admits_everyone_by_default() {
        assert_eq!(
            parse(&[]),
            NewOpenIdProvider {
                slug: "authentik".to_string(),
                display_name: "Authentik".to_string(),
                discovery_url: "https://auth.example.org/application/o/mtg/".to_string(),
                client_id: "client".to_string(),
                client_secret: "secret".to_string(),
                identifying_claim: "sub".to_string(),
                admission: Admission::Open,
            }
        );
    }

    #[test]
    fn claim_and_admission_can_be_chosen() {
        let provider = parse(&["--identifying-claim", "email", "--admission", "invite-only"]);
        assert_eq!(provider.identifying_claim, "email");
        assert_eq!(provider.admission, Admission::InviteOnly);
    }
}
