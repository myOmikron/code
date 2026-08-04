//! Handler for the webserver

use galvyn::core::GalvynRouter;
use galvyn::core::re_exports::axum;
use galvyn::openapi::OpenapiRouterExt;

use crate::http::middlewares;
use crate::http::middlewares::AuthRateLimit;

pub mod accounts;
pub mod clubs;
pub mod credential_reset;
pub mod domains;
pub mod invites;
pub mod me;
pub mod oidc_provider;
pub mod openapi;
pub mod settings;

/// Openapi page for the admin API
pub struct AdminAPI;

/// Handler for the admin
pub fn router_admin() -> GalvynRouter {
    GalvynRouter::with_openapi_page(AdminAPI)
        .nest(
            "/accounts",
            GalvynRouter::new()
                .handler(accounts::handler_admin::get_all_superadmins)
                .handler(accounts::handler_admin::delete_club_admin)
                .handler(accounts::handler_admin::reset_credentials),
        )
        .nest(
            "/clubs",
            GalvynRouter::new()
                .handler(clubs::handler_admin::get_club)
                .handler(clubs::handler_admin::get_clubs)
                .handler(clubs::handler_admin::create_club)
                .handler(clubs::handler_admin::delete_club)
                .handler(clubs::handler_admin::get_club_admins)
                .handler(clubs::handler_admin::get_club_members)
                .handler(clubs::handler_admin::get_club_member_invites)
                .handler(clubs::handler_admin::get_club_admin_invites)
                .handler(clubs::handler_admin::get_dashboard_stats)
                .handler(clubs::handler_admin::get_club_domains)
                .handler(clubs::handler_admin::associate_domain)
                .handler(clubs::handler_admin::unassociate_domain),
        )
        .nest(
            "/domains",
            GalvynRouter::new().handler(domains::handler_admin::get_unassociated_domains),
        )
        .nest(
            "/invites",
            GalvynRouter::new()
                .handler(invites::handler_admin::create_invite)
                .handler(invites::handler_admin::retract_invite),
        )
        .nest(
            "/oidc-providers",
            GalvynRouter::new()
                .handler(oidc_provider::handler_admin::get_all_oidc_providers)
                .handler(oidc_provider::handler_admin::create_oidc_provider),
        )
        .layer(axum::middleware::from_fn(middlewares::auth_superadmin))
}

/// Openapi page for the club admin API
pub struct ClubAdminApi;

/// Handler for the club admin
pub fn router_club_admin() -> GalvynRouter {
    GalvynRouter::with_openapi_page(ClubAdminApi).nest(
        "/clubs/{club_uuid}",
        GalvynRouter::new()
            .nest(
                "/club",
                GalvynRouter::new()
                    .handler(clubs::handler_club_admin::get_club)
                    .handler(clubs::handler_club_admin::get_club_members)
                    .handler(clubs::handler_club_admin::get_club_member_invites)
                    .handler(clubs::handler_club_admin::get_dashboard_stats),
            )
            .nest("/domains", GalvynRouter::new())
            .nest(
                "/invites",
                GalvynRouter::new()
                    .handler(invites::handler_club_admin::create_member_invite)
                    .handler(invites::handler_club_admin::retract_invite),
            )
            .nest(
                "/members",
                GalvynRouter::new()
                    .handler(clubs::handler_club_admin::delete_member)
                    .handler(accounts::handler_club_admin::reset_credentials),
            )
            .layer(axum::middleware::from_fn(middlewares::auth_club_admin)),
    )
}

/// Openapi page for the club member API
pub struct ClubMemberApi;

/// Handler for the club members
pub fn router_club_member() -> GalvynRouter {
    GalvynRouter::with_openapi_page(ClubMemberApi)
}

/// Unauthenticated handler_frontend
pub fn router_unauthenticated() -> GalvynRouter {
    let mut router = GalvynRouter::with_openapi_page(CommonApi);

    #[cfg(debug_assertions)]
    {
        router = router
            .handler(openapi::handler_common::openapi_admin)
            .handler(openapi::handler_common::openapi_club_admin)
            .handler(openapi::handler_common::openapi_club_member)
            .handler(openapi::handler_common::openapi_common)
            .handler(openapi::handler_common::openapi_auth);
    }

    router = router.nest(
        "/invite",
        GalvynRouter::new()
            .handler(invites::handler_common::get_invite_common)
            .merge(
                GalvynRouter::new()
                    .handler(invites::handler_common::accept_invite)
                    .wrap(AuthRateLimit::new(25)),
            ),
    );

    router = router.nest(
        "/credential-reset",
        GalvynRouter::new()
            .handler(credential_reset::handler_common::verify_code)
            .handler(credential_reset::handler_common::verify_uuid)
            .handler(credential_reset::handler_common::reset_password)
            .handler(credential_reset::handler_common::reset_password_by_uuid)
            .wrap(AuthRateLimit::new(5)),
    );

    router
}

/// Openapi page for the common API
pub struct CommonApi;

/// Common handler_frontend
pub fn router_common() -> GalvynRouter {
    GalvynRouter::with_openapi_page(CommonApi)
        .nest(
            "/me",
            GalvynRouter::new()
                .handler(me::handler_common::get_me)
                .handler(me::handler_common::update_me)
                .handler(me::handler_common::set_password),
        )
        .nest(
            "/settings",
            GalvynRouter::new().handler(settings::handler_common::get_settings),
        )
}

/// Initialize the router
pub fn initialize() -> GalvynRouter {
    GalvynRouter::new()
        .merge(router_unauthenticated())
        .nest("/common", router_common())
        .nest("/admin", router_admin())
        .nest("/club-admin", router_club_admin())
}
