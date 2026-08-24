use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::folders::schema::CreateDeckFolderRequest;
use crate::http::handler_frontend::folders::schema::DeckFolderResponse;
use crate::http::handler_frontend::folders::schema::ListDeckFoldersResponse;
use crate::http::handler_frontend::folders::schema::UpdateDeckFolderRequest;
use crate::models::account::Account;
use crate::models::deck::DeckAccess;
use crate::models::deck::folder::DeckFolder;
use crate::models::deck::folder::DeckFolderUuid;

/// List every folder the account keeps
///
/// The archive is part of the answer whether or not anything was ever put away:
/// a client offering to file a deck needs the shelf to exist before the first
/// deck goes onto it.
#[get("/")]
pub async fn get_all_deck_folders(account: Account) -> ApiResult<ApiJson<ListDeckFoldersResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let folders = DeckFolder::get_all_for_account(&mut tx, account.uuid)
        .await?
        .into_iter()
        .map(DeckFolderResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(ListDeckFoldersResponse { folders }))
}

/// Make a folder
#[post("/")]
pub async fn create_deck_folder(
    account: Account,
    ApiJson(CreateDeckFolderRequest { name }): ApiJson<CreateDeckFolderRequest>,
) -> ApiResult<ApiJson<DeckFolderResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let folder = DeckFolder::create(&mut tx, account.uuid, name).await?;

    tx.commit().await?;

    Ok(ApiJson(DeckFolderResponse::from(folder)))
}

/// Rename a folder
///
/// The archive is refused: it is called what the app calls it.
#[put("/{folder}")]
pub async fn update_deck_folder(
    account: Account,
    Path(folder_uuid): Path<DeckFolderUuid>,
    ApiJson(UpdateDeckFolderRequest { name }): ApiJson<UpdateDeckFolderRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match DeckFolder::rename(&mut tx, account.uuid, folder_uuid, name).await? {
        DeckAccess::Granted(()) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Throw a folder away
///
/// The decks in it are not touched; they turn up among the ones on no shelf.
/// The archive is refused, see [`update_deck_folder`].
#[delete("/{folder}")]
pub async fn delete_deck_folder(
    account: Account,
    Path(folder_uuid): Path<DeckFolderUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match DeckFolder::delete(&mut tx, account.uuid, folder_uuid).await? {
        DeckAccess::Granted(()) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}
