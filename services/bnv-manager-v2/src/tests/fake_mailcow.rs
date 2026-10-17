//! A fake Mailcow API, just enough for the [`Mailcow`](crate::modules::mailcow::Mailcow)
//! module to start and sync one domain

use std::net::Ipv4Addr;

use galvyn::core::re_exports::axum;
use galvyn::core::re_exports::axum::Json;
use galvyn::core::re_exports::axum::Router;
use galvyn::core::re_exports::axum::routing::get;
use serde_json::Value;
use serde_json::json;
use tokio::net::TcpListener;
use url::Url;

/// The only domain the fake knows, every test member's mailbox lives on it
pub const DOMAIN: &str = "club.test";

/// Serves the fake on a free local port and returns its base url
pub async fn start() -> Url {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("bind the fake mailcow");
    let url = Url::parse(&format!(
        "http://{}",
        listener.local_addr().expect("local address")
    ))
    .expect("valid url");

    let router = Router::new()
        .route(
            "/api/v1/get/status/version",
            get(|| async { Json(json!({ "version": "fake" })) }),
        )
        .route(
            "/api/v1/get/domain/all",
            get(|| async { Json(json!([domain()])) }),
        )
        .route(
            "/api/v1/get/domain/{domain}",
            get(|| async { Json(domain()) }),
        )
        .route(
            "/api/v1/get/mailbox/all/{domain}",
            get(|| async { Json(json!([])) }),
        );

    tokio::spawn(async move { axum::serve(listener, router).await });

    url
}

fn domain() -> Value {
    json!({
        "active_int": 1,
        "domain_name": DOMAIN,
        "mboxes_left": 1000,
        "max_quota_for_mbox": 1_073_741_824u64,
        "def_quota_for_mbox": 1_073_741_824u64,
        "max_quota_for_domain": 1_099_511_627_776u64,
        "bytes_total": "0",
        "msgs_total": "0",
        "mboxes_in_domain": 0,
        "max_num_mboxes_for_domain": 1000,
    })
}
