//! The `openapi <output>` subcommand every Galvyn service with a frontend exposes

use std::any::Any;
use std::error::Error;
use std::fs;
use std::net::Ipv4Addr;
use std::net::SocketAddr;
use std::path::Path;

use galvyn::Galvyn;
use galvyn::GalvynSetup;
use galvyn::core::GalvynRouter;
use galvyn::openapi::get_openapi_for_page;

/// Write the openapi document of `page` to `output`, pretty-printed
///
/// Galvyn only knows its routes once it serves them, so this starts `routes`
/// on a loopback port the kernel picks, reads the document and kills the
/// server again. No module is registered and sessions are off: a handler
/// touches the database only when a request arrives, and none does. So the
/// command needs no database, no NATS and no config.
///
/// `routes` must not carry the session layer, which wants a database.
pub async fn write_openapi(
    routes: GalvynRouter,
    page: impl Any,
    output: &Path,
) -> Result<(), Box<dyn Error>> {
    let mut builder = Galvyn::builder(GalvynSetup {
        disable_panic_hook: true,
        disable_sessions: true,
        ..GalvynSetup::default()
    })
    .init_modules()
    .await?;
    builder.add_listener(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)), routes);
    let mut server = tokio::spawn(async move { builder.start().await });

    let galvyn = tokio::select! {
        galvyn = Galvyn::global_wait() => galvyn,
        stopped = &mut server => {
            stopped??;
            return Err(Box::from("the server stopped before registering its routes"));
        }
    };
    let document = get_openapi_for_page(page);
    fs::write(output, serde_json::to_string_pretty(&document)?)?;

    galvyn.kill();
    server.await??;
    Ok(())
}
