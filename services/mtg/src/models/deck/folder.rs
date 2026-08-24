//! The shelves an account files its decks on
//!
//! A folder is the account's own word for a pile of decks — "Planned", "Shared
//! by others", whatever the shelf in the hallway is called. A deck lies in at
//! most one of them, so the deck list is a set of sections that between them
//! hold every deck exactly once.
//!
//! The archive is the one folder the app knows by itself: putting a deck away
//! used to be a flag on the deck, and it is the same act as filing it, so it is
//! the same mechanism now. It is told apart by [`DeckFolderKind`] rather than by
//! its name, because a name is the account's to change and must not be what
//! decides whether a folder may be deleted.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::deck::DeckAccess;
use crate::models::deck::db::DeckFolderInsertPatch;
use crate::models::deck::db::DeckFolderModel;

/// The name the archive is created under
///
/// Never shown as it stands: a client labels the archive from
/// [`DeckFolderKind::Archive`] in the language it is running in. This is what
/// somebody reading the table sees.
const ARCHIVE_NAME: &str = "Archived";

/// Which of an account's folders a folder is
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum DeckFolderKind {
    /// A folder the account made and named
    Custom,
    /// The one folder the app knows: decks that were put away
    Archive,
}
custom_db_enum! {
    enum: DeckFolderKind,
    variants: [Custom, Archive],
    decoder: DeckFolderKindDecoder,
}

/// A shelf an account files its decks on
#[derive(Debug, Clone)]
pub struct DeckFolder {
    /// Primary key
    pub uuid: DeckFolderUuid,
    /// The account whose folder this is
    pub owner: AccountUuid,
    /// What the folder is called
    pub name: MaxStr<64>,
    /// Which of the folders this is
    pub kind: DeckFolderKind,
    /// The point in time the folder was made
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`DeckFolder`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct DeckFolderUuid(Uuid);

impl DeckFolderUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `DeckFolderUuid` from a foreign key of [`DeckFolderModel`]
    pub(in crate::models) fn new_from_field(
        field: ForeignModelByField<<DeckFolderModel as rorm::Model>::Primary>,
    ) -> Self {
        Self(field.0)
    }
}

impl DeckFolder {
    /// Every folder an account keeps, its own first and the archive last
    ///
    /// The archive is made here when the account has none yet, so a client that
    /// asks what the shelves are always gets one to put a deck away into. That
    /// is a write on a read, and deliberately so: the alternative is every
    /// caller that might need it having to remember to make it first, which is
    /// the sort of thing that gets forgotten in exactly the one place it
    /// matters. It happens once per account and is idempotent.
    #[instrument(name = "DeckFolder::get_all_for_account", skip(tx))]
    pub async fn get_all_for_account(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<DeckFolder>, rorm::Error> {
        Self::archive_of(&mut *tx, owner).await?;

        let folders = rorm::query(&mut *tx, DeckFolderModel)
            .condition(DeckFolderModel.owner.equals(owner.into_inner()))
            .order_asc(DeckFolderModel.name)
            .order_asc(DeckFolderModel.uuid)
            .all()
            .await?;

        // Sorted here rather than in the statement: "the archive goes last" is
        // an order over the kind, not over anything the database can compare,
        // and an account has a handful of folders.
        let mut folders: Vec<DeckFolder> = folders.into_iter().map(DeckFolder::from).collect();
        folders.sort_by_key(|folder| folder.kind == DeckFolderKind::Archive);
        Ok(folders)
    }

    /// The account's archive, made if it does not exist yet
    #[instrument(name = "DeckFolder::archive_of", skip(tx))]
    pub async fn archive_of(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<DeckFolder, rorm::Error> {
        let existing = rorm::query(&mut *tx, DeckFolderModel)
            .condition(rorm::and![
                DeckFolderModel.owner.equals(owner.into_inner()),
                DeckFolderModel.kind.equals(DeckFolderKind::Archive),
            ])
            .optional()
            .await?;
        if let Some(archive) = existing {
            return Ok(DeckFolder::from(archive));
        }

        let created = rorm::insert(&mut *tx, DeckFolderModel)
            .single(&DeckFolderInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                name: MaxStr::new(ARCHIVE_NAME.to_owned())
                    .unwrap_or_else(|_| unreachable!("the archive's name is a few ascii letters")),
                kind: DeckFolderKind::Archive,
            })
            .await?;
        Ok(DeckFolder::from(created))
    }

    /// Make a folder
    #[instrument(name = "DeckFolder::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        name: MaxStr<64>,
    ) -> Result<DeckFolder, rorm::Error> {
        let folder = rorm::insert(&mut *tx, DeckFolderModel)
            .single(&DeckFolderInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                name,
                kind: DeckFolderKind::Custom,
            })
            .await?;
        Ok(DeckFolder::from(folder))
    }

    /// Rename a folder
    ///
    /// The archive is refused: what it is called is the app's word for it, in
    /// the language the reader is using, and a stored name would only be that
    /// word in whichever language it was made in.
    #[instrument(name = "DeckFolder::rename", skip(tx))]
    pub async fn rename(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckFolderUuid,
        name: MaxStr<64>,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckFolderModel)
            .set(DeckFolderModel.name, name)
            .condition(rorm::and![
                DeckFolderModel.uuid.equals(uuid.0),
                DeckFolderModel.owner.equals(owner.into_inner()),
                DeckFolderModel.kind.equals(DeckFolderKind::Custom),
            ])
            .await?;
        Ok(granted(affected))
    }

    /// Throw a folder away, leaving the decks in it unfiled
    ///
    /// The decks are not touched — the foreign key clears itself, and they turn
    /// up among the ones on no shelf. The archive cannot be thrown away: the
    /// app offers putting a deck away whether or not the account has ever
    /// arranged its folders.
    #[instrument(name = "DeckFolder::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckFolderUuid,
    ) -> Result<DeckAccess, rorm::Error> {
        let affected = rorm::delete(&mut *tx, DeckFolderModel)
            .condition(rorm::and![
                DeckFolderModel.uuid.equals(uuid.0),
                DeckFolderModel.owner.equals(owner.into_inner()),
                DeckFolderModel.kind.equals(DeckFolderKind::Custom),
            ])
            .await?;
        Ok(granted(affected))
    }

    /// Whether a folder is this account's to file a deck into
    #[instrument(name = "DeckFolder::belongs_to", skip(tx))]
    pub async fn belongs_to(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: DeckFolderUuid,
    ) -> Result<bool, rorm::Error> {
        let found = rorm::query(&mut *tx, DeckFolderModel.uuid)
            .condition(rorm::and![
                DeckFolderModel.uuid.equals(uuid.0),
                DeckFolderModel.owner.equals(owner.into_inner()),
            ])
            .optional()
            .await?;
        Ok(found.is_some())
    }
}

impl From<DeckFolderModel> for DeckFolder {
    fn from(value: DeckFolderModel) -> Self {
        Self {
            uuid: DeckFolderUuid(value.uuid),
            owner: AccountUuid::new_from_field(value.owner),
            name: value.name,
            kind: value.kind,
            created_at: value.created_at,
        }
    }
}

/// Turn a statement's affected-row count into a [`DeckAccess`]
///
/// Zero rows means the folder is gone, somebody else's, or the archive, and a
/// caller must not be able to tell those apart.
fn granted(affected: u64) -> DeckAccess {
    if affected > 0 {
        DeckAccess::Granted(())
    } else {
        DeckAccess::Denied
    }
}
