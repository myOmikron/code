//! Black-box HTTP tests, driving the service's router in-process

mod credential_reset;
mod fake_mailcow;
mod flow;
pub mod harness;
mod login;
mod oidc;
mod oidc_clients;
mod oidc_token;
mod userinfo;
