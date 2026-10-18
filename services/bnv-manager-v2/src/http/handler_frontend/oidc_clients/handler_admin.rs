//! Endpoints for managing OIDC clients

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::FormResult;
use galvyn::core::stuff::schema::SingleUuid;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use tracing::instrument;
use url::Url;

use crate::http::handler_frontend::oidc_clients::CreateOidcClientError;
use crate::http::handler_frontend::oidc_clients::CreateOidcClientRequest;
use crate::http::handler_frontend::oidc_clients::CreatedOidcClient;
use crate::http::handler_frontend::oidc_clients::schema;
use crate::models::oidc_client::OidcClient;
use crate::models::oidc_client::OidcClientUuid;

/// Retrieve all registered OIDC clients
#[get("/")]
#[instrument(name = "Api::admin::get_all_oidc_clients")]
pub async fn get_all_oidc_clients() -> ApiResult<ApiJson<Vec<schema::OidcClientSchema>>> {
    let clients = OidcClient::find_all(Database::global())
        .await?
        .into_iter()
        .map(schema::OidcClientSchema::from)
        .collect();

    Ok(ApiJson(clients))
}

/// Register a new OIDC client
///
/// The response contains the client secret, which is not retrievable afterwards.
#[post("/")]
#[instrument(name = "Api::admin::create_oidc_client")]
pub async fn create_oidc_client(
    ApiJson(CreateOidcClientRequest { name, redirect_uri }): ApiJson<CreateOidcClientRequest>,
) -> ApiResult<ApiJson<FormResult<CreatedOidcClient, CreateOidcClientError>>> {
    let Some(redirect_uri) = Url::parse(&redirect_uri)
        .ok()
        .filter(|redirect_uri| redirect_uri.as_str().len() <= 1024)
        .filter(OidcClient::is_valid_redirect_uri)
    else {
        return Ok(ApiJson(FormResult::err(CreateOidcClientError {
            invalid_redirect_uri: true,
        })));
    };

    let mut tx = Database::global().start_transaction().await?;

    let client = OidcClient::create(&mut tx, name, redirect_uri).await?;

    tx.commit().await?;

    Ok(ApiJson(FormResult::ok(CreatedOidcClient {
        client_id: client.client_id,
        client_secret: client.client_secret,
    })))
}

/// Delete an OIDC client
///
/// Its pending authorization codes are deleted with it.
#[delete("/{uuid}")]
#[instrument(name = "Api::admin::delete_oidc_client")]
pub async fn delete_oidc_client(Path(SingleUuid { uuid }): Path<SingleUuid>) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    OidcClient::delete(&mut tx, OidcClientUuid(uuid)).await?;

    tx.commit().await?;

    Ok(())
}
