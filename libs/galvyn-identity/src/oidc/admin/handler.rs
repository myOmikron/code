//! Handlers adding, editing, deactivating and deleting OpenID providers

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;

use super::schema::AdminBulkDeleteOpenIdProviderErrors;
use super::schema::AdminBulkDeleteOpenIdProviderRequest;
use super::schema::AdminCreateOpenIdProviderErrors;
use super::schema::AdminCreateOpenIdProviderRequest;
use super::schema::AdminDeleteOpenIdProviderErrors;
use super::schema::AdminEditOpenIdProviderErrors;
use super::schema::AdminEditOpenIdProviderRequest;
use super::schema::AdminListOpenIdProvidersResponse;
use super::schema::AdminOpenIdProvider;
use crate::IdentityModule;
use crate::oidc::NewOpenIdProvider;
use crate::oidc::OpenIdProviderEdit;
use crate::oidc::error::AddOpenIdProviderError;
use crate::oidc::error::BulkDeleteOpenIdProviderError;
use crate::oidc::error::DeleteOpenIdProviderError;
use crate::oidc::error::EditOpenIdProviderError;

/// List every OpenID provider, deactivated ones included
#[get("/")]
pub async fn admin_list_openid_providers() -> ApiResult<ApiJson<AdminListOpenIdProvidersResponse>> {
    let providers = IdentityModule::all_openid_providers(Database::global()).await?;
    Ok(ApiJson(AdminListOpenIdProvidersResponse {
        providers: providers
            .into_iter()
            .map(AdminOpenIdProvider::from)
            .collect(),
    }))
}

/// Add an OpenID provider people may log in through
#[post("/")]
pub async fn admin_create_openid_provider(
    ApiJson(request): ApiJson<AdminCreateOpenIdProviderRequest>,
) -> ApiResult<ApiJson<()>, AdminCreateOpenIdProviderErrors> {
    let mut errors = FormErrors::<AdminCreateOpenIdProviderErrors>::new();
    let provider = NewOpenIdProvider {
        slug: request.slug.into_inner(),
        display_name: request.display_name.into_inner(),
        discovery_url: request.discovery_url.into_inner(),
        client_id: request.client_id.into_inner(),
        client_secret: request.client_secret.into_inner(),
        identifying_claim: request.identifying_claim.into_inner(),
        admission: request.admission.into(),
    };
    match IdentityModule::add_openid_provider(Database::global(), &provider).await {
        Ok(()) => Ok(ApiJson(())),
        Err(AddOpenIdProviderError::Invalid(invalid)) => {
            errors.invalid_field = Some(invalid.into());
            errors.fail()
        }
        Err(AddOpenIdProviderError::SlugTaken) => {
            errors.slug_taken = true;
            errors.fail()
        }
        Err(AddOpenIdProviderError::Internal(error)) => Err(error.into()),
    }
}

/// Edit an OpenID provider; its client secret is only overwritten when one is sent
///
/// Its identifying claim and issuer are frozen once an External identity references it.
#[put("/{slug}")]
pub async fn admin_edit_openid_provider(
    Path(slug): Path<MaxStr<64>>,
    ApiJson(request): ApiJson<AdminEditOpenIdProviderRequest>,
) -> ApiResult<ApiJson<()>, AdminEditOpenIdProviderErrors> {
    let mut errors = FormErrors::<AdminEditOpenIdProviderErrors>::new();
    let edit = OpenIdProviderEdit {
        display_name: request.display_name.into_inner(),
        discovery_url: request.discovery_url.into_inner(),
        client_id: request.client_id.into_inner(),
        client_secret: request.client_secret.map(MaxStr::into_inner),
        identifying_claim: request.identifying_claim.into_inner(),
        admission: request.admission.into(),
    };

    let mut tx = Database::global().start_transaction().await?;
    let edited = IdentityModule::edit_openid_provider(&mut tx, &slug, &edit).await;
    let refused = match edited {
        Ok(()) => {
            tx.commit().await?;
            return Ok(ApiJson(()));
        }
        Err(error) => error,
    };
    tx.rollback().await?;
    match refused {
        EditOpenIdProviderError::UnknownProvider => {
            return Err(ApiError::bad_request("Unknown provider"));
        }
        EditOpenIdProviderError::Invalid(invalid) => errors.invalid_field = Some(invalid.into()),
        EditOpenIdProviderError::IdentifyingClaimFrozen => errors.identifying_claim_frozen = true,
        EditOpenIdProviderError::IssuerFrozen => errors.issuer_frozen = true,
        EditOpenIdProviderError::Internal(error) => return Err(error.into()),
    }
    errors.fail()
}

/// Deactivate an OpenID provider: nobody logs in through it, its External identities are kept
#[post("/{slug}/deactivate")]
pub async fn admin_deactivate_openid_provider(
    Path(slug): Path<MaxStr<64>>,
) -> ApiResult<ApiJson<()>> {
    match IdentityModule::deactivate_openid_provider(Database::global(), &slug).await? {
        true => Ok(ApiJson(())),
        false => Err(ApiError::bad_request("Unknown provider")),
    }
}

/// Reactivate an OpenID provider with all its External identities
#[post("/{slug}/reactivate")]
pub async fn admin_reactivate_openid_provider(
    Path(slug): Path<MaxStr<64>>,
) -> ApiResult<ApiJson<()>> {
    match IdentityModule::reactivate_openid_provider(Database::global(), &slug).await? {
        true => Ok(ApiJson(())),
        false => Err(ApiError::bad_request("Unknown provider")),
    }
}

/// Delete an OpenID provider, refused while an External identity references it
#[delete("/{slug}")]
pub async fn admin_delete_openid_provider(
    Path(slug): Path<MaxStr<64>>,
) -> ApiResult<ApiJson<()>, AdminDeleteOpenIdProviderErrors> {
    let mut errors = FormErrors::<AdminDeleteOpenIdProviderErrors>::new();
    let mut tx = Database::global().start_transaction().await?;
    let deleted = IdentityModule::delete_openid_provider(&mut tx, &slug).await;
    let refused = match deleted {
        Ok(()) => {
            tx.commit().await?;
            return Ok(ApiJson(()));
        }
        Err(error) => error,
    };
    tx.rollback().await?;
    match refused {
        DeleteOpenIdProviderError::UnknownProvider => {
            Err(ApiError::bad_request("Unknown provider"))
        }
        DeleteOpenIdProviderError::Referenced => {
            errors.referenced = true;
            errors.fail()
        }
        DeleteOpenIdProviderError::Internal(error) => Err(error.into()),
    }
}

/// Delete an OpenID provider with everyone it vouches for, for GDPR requests
///
/// The admin types the provider's display name to confirm. Per affected
/// Identity the service's delete hook deletes or anonymizes the Account,
/// then the External identities, the Identities and the provider go, all in
/// one transaction.
#[delete("/{slug}/bulk")]
pub async fn admin_bulk_delete_openid_provider(
    Path(slug): Path<MaxStr<64>>,
    ApiJson(request): ApiJson<AdminBulkDeleteOpenIdProviderRequest>,
) -> ApiResult<ApiJson<()>, AdminBulkDeleteOpenIdProviderErrors> {
    let mut tx = Database::global().start_transaction().await?;
    let deleted = IdentityModule::global()
        .bulk_delete_openid_provider(&mut tx, &slug, &request.name)
        .await;
    let refused = match deleted {
        Ok(()) => {
            tx.commit().await?;
            return Ok(ApiJson(()));
        }
        Err(error) => error,
    };
    tx.rollback().await?;
    match refused {
        BulkDeleteOpenIdProviderError::UnknownProvider => {
            Err(ApiError::bad_request("Unknown provider"))
        }
        BulkDeleteOpenIdProviderError::NameMismatch => {
            let mut errors = FormErrors::<AdminBulkDeleteOpenIdProviderErrors>::new();
            errors.name_mismatch = true;
            errors.fail()
        }
        BulkDeleteOpenIdProviderError::Internal(error) => Err(error.into()),
    }
}
