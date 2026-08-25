//! Authenticated pass-through to the graph advisor (services/mtg-graph)
//!
//! The advisor is a separate FastAPI service that must not be publicly
//! routable: besides the endpoints the frontend uses it serves its own
//! openapi explorer, a health probe that repeats Neo4j error text, and
//! `/warm` writes into the graph. So traefik no longer routes `/api/graph`
//! anywhere — these handlers are the only way in, and the allowlist below
//! is the public surface.

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod proxy;

/// Initialize the proxied advisor routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(proxy::post_diagnostics)
            .handler(proxy::post_swaps)
            .handler(proxy::post_replace)
            .handler(proxy::post_fill)
            .handler(proxy::post_search)
            .handler(proxy::post_combos)
            .handler(proxy::post_warm)
            .handler(proxy::post_pool_query)
            .handler(proxy::get_facets)
            .wrap(AuthRequiredLayer),
    )
}
