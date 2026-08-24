use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::deck::folder::DeckFolder;
use crate::models::deck::folder::DeckFolderKind;
use crate::models::deck::folder::DeckFolderUuid;

/// A shelf an account files its decks on
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckFolderResponse {
    /// Primary key
    pub uuid: DeckFolderUuid,
    /// What the folder is called
    ///
    /// The archive carries the name it was made under; a client shows it under
    /// its own word for the archive instead, in the language it is running in.
    pub name: MaxStr<64>,
    /// Which of the folders this is
    pub kind: DeckFolderKind,
    /// When the folder was made
    pub created_at: SchemaDateTime,
}

/// Every folder an account keeps
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListDeckFoldersResponse {
    /// The folders, the account's own first and the archive last
    pub folders: Vec<DeckFolderResponse>,
}

/// Request to make a folder
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateDeckFolderRequest {
    /// What it is called
    pub name: MaxStr<64>,
}

/// Request to rename a folder
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateDeckFolderRequest {
    /// What it is called now
    pub name: MaxStr<64>,
}

impl From<DeckFolder> for DeckFolderResponse {
    fn from(folder: DeckFolder) -> Self {
        Self {
            uuid: folder.uuid,
            name: folder.name,
            kind: folder.kind,
            created_at: SchemaDateTime(folder.created_at),
        }
    }
}
