//! OIDC login: "Continue with Google", the username step and returning logins

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// The path the OpenID providers send the browser back to
///
/// Joined to the public origin, it is the redirect uri registered with every
/// provider: changing it breaks OIDC login until the registrations follow.
pub const CALLBACK_PATH: &str = "/api/frontend/v1/auth/oidc/callback";

/// The frontend page of the username step
pub const USERNAME_STEP_PAGE: &str = "/auth/username";

/// The frontend page a logged-in Account lands on
pub const LOGGED_IN_PAGE: &str = "/home";

/// The frontend page a refused OIDC login returns to, with `oidc_error` set
pub const LOGIN_PAGE: &str = "/auth/login";

/// Initializes the OIDC login routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_openid_providers)
        .handler(handler::start_oidc_login)
        .handler(handler::finish_oidc_login)
        .handler(handler::get_pending_oidc_login)
        .handler(handler::choose_username)
}
