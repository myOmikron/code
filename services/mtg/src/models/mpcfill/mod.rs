//! The MPCFill art an account starred
//!
//! A favorite keeps its image's drive and file name, so a client can recognise
//! the image after its drive re-uploads it under a new id.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::mpcfill::db::MpcFillFavoriteDriveInsertPatch;
use crate::models::mpcfill::db::MpcFillFavoriteDriveModel;
use crate::models::mpcfill::db::MpcFillFavoriteInsertPatch;
use crate::models::mpcfill::db::MpcFillFavoriteModel;

pub mod db;

/// An MPCFill image as it was found when it was starred
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillFavoriteImage {
    /// The Google Drive file id
    pub drive_id: MaxStr<128>,
    /// The file's name in its drive
    pub file_name: MaxStr<255>,
    /// The drive it lies in
    pub source: MaxStr<255>,
}

/// Wrapper for the primary key of [`MpcFillFavoriteModel`]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct MpcFillFavoriteUuid(Uuid);

/// An image an account starred for one card face or the cardback
#[derive(Debug, Clone)]
pub struct MpcFillFavorite {
    /// Primary key
    pub uuid: MpcFillFavoriteUuid,
    /// The card face it was starred for, `None` for a cardback
    pub face: Option<MaxStr<255>>,
    /// The image
    pub image: MpcFillFavoriteImage,
    /// When it was starred
    pub starred_at: OffsetDateTime,
}

impl MpcFillFavorite {
    /// Every image the account starred, newest first
    #[instrument(name = "MpcFillFavorite::all_for", skip(tx))]
    pub async fn all_for(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<MpcFillFavorite>, rorm::Error> {
        let rows = rorm::query(&mut *tx, MpcFillFavoriteModel)
            .condition(MpcFillFavoriteModel.owner.equals(owner.into_inner()))
            .order_desc(MpcFillFavoriteModel.starred_at)
            .order_desc(MpcFillFavoriteModel.uuid)
            .all()
            .await?;
        Ok(rows.into_iter().map(MpcFillFavorite::from).collect())
    }

    /// Stars an image for a face, or stars it again as the newest
    #[instrument(name = "MpcFillFavorite::star", skip(tx))]
    pub async fn star(
        tx: &mut Transaction,
        owner: AccountUuid,
        face: Option<MaxStr<255>>,
        image: MpcFillFavoriteImage,
    ) -> Result<MpcFillFavorite, rorm::Error> {
        for known in Self::starred_as(&mut *tx, owner, face.as_deref(), &image.drive_id).await? {
            Self::unstar(&mut *tx, owner, known).await?;
        }

        let row = rorm::insert(&mut *tx, MpcFillFavoriteModel)
            .single(&MpcFillFavoriteInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                face,
                drive_id: image.drive_id,
                file_name: image.file_name,
                source: image.source,
            })
            .await?;
        Ok(MpcFillFavorite::from(row))
    }

    /// Takes the star off an image
    #[instrument(name = "MpcFillFavorite::unstar", skip(tx))]
    pub async fn unstar(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: MpcFillFavoriteUuid,
    ) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, MpcFillFavoriteModel)
            .condition(rorm::and![
                MpcFillFavoriteModel.owner.equals(owner.into_inner()),
                MpcFillFavoriteModel.uuid.equals(uuid.0),
            ])
            .await?;
        Ok(())
    }

    /// Moves a star to the file that replaced its image, keeping when it was starred
    ///
    /// A star the face already had on that file is dropped in its favor.
    #[instrument(name = "MpcFillFavorite::replace", skip(tx))]
    pub async fn replace(
        tx: &mut Transaction,
        owner: AccountUuid,
        uuid: MpcFillFavoriteUuid,
        image: MpcFillFavoriteImage,
    ) -> Result<(), rorm::Error> {
        let Some(face) = rorm::query(&mut *tx, MpcFillFavoriteModel.face)
            .condition(rorm::and![
                MpcFillFavoriteModel.owner.equals(owner.into_inner()),
                MpcFillFavoriteModel.uuid.equals(uuid.0),
            ])
            .optional()
            .await?
        else {
            return Ok(());
        };

        for known in Self::starred_as(&mut *tx, owner, face.as_deref(), &image.drive_id).await? {
            if known != uuid {
                Self::unstar(&mut *tx, owner, known).await?;
            }
        }

        rorm::update(&mut *tx, MpcFillFavoriteModel)
            .set(MpcFillFavoriteModel.drive_id, image.drive_id)
            .set(MpcFillFavoriteModel.file_name, image.file_name)
            .set(MpcFillFavoriteModel.source, image.source)
            .condition(rorm::and![
                MpcFillFavoriteModel.owner.equals(owner.into_inner()),
                MpcFillFavoriteModel.uuid.equals(uuid.0),
            ])
            .await?;
        Ok(())
    }

    /// The account's stars on one file for one face
    async fn starred_as(
        tx: &mut Transaction,
        owner: AccountUuid,
        face: Option<&str>,
        drive_id: &str,
    ) -> Result<Vec<MpcFillFavoriteUuid>, rorm::Error> {
        let rows = rorm::query(
            &mut *tx,
            (MpcFillFavoriteModel.uuid, MpcFillFavoriteModel.face),
        )
        .condition(rorm::and![
            MpcFillFavoriteModel.owner.equals(owner.into_inner()),
            MpcFillFavoriteModel.drive_id.equals(drive_id),
        ])
        .all()
        .await?;
        Ok(rows
            .into_iter()
            .filter(|(_, known)| known.as_deref() == face)
            .map(|(uuid, _)| MpcFillFavoriteUuid(uuid))
            .collect())
    }
}

impl From<MpcFillFavoriteModel> for MpcFillFavorite {
    fn from(row: MpcFillFavoriteModel) -> Self {
        Self {
            uuid: MpcFillFavoriteUuid(row.uuid),
            face: row.face,
            image: MpcFillFavoriteImage {
                drive_id: row.drive_id,
                file_name: row.file_name,
                source: row.source,
            },
            starred_at: row.starred_at,
        }
    }
}

/// The drives an account starred, in its own order
pub struct MpcFillFavoriteDrives;

impl MpcFillFavoriteDrives {
    /// The starred drives, first one first
    #[instrument(name = "MpcFillFavoriteDrives::all_for", skip(tx))]
    pub async fn all_for(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<MaxStr<255>>, rorm::Error> {
        rorm::query(&mut *tx, MpcFillFavoriteDriveModel.source)
            .condition(MpcFillFavoriteDriveModel.owner.equals(owner.into_inner()))
            .order_asc(MpcFillFavoriteDriveModel.position)
            .all()
            .await
    }

    /// Replaces the starred drives, a repeated name kept once at its first place
    #[instrument(name = "MpcFillFavoriteDrives::set", skip(tx))]
    pub async fn set(
        tx: &mut Transaction,
        owner: AccountUuid,
        sources: Vec<MaxStr<255>>,
    ) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, MpcFillFavoriteDriveModel)
            .condition(MpcFillFavoriteDriveModel.owner.equals(owner.into_inner()))
            .await?;

        let mut kept: Vec<MaxStr<255>> = Vec::new();
        for source in sources {
            if !kept.iter().any(|known| **known == *source) {
                kept.push(source);
            }
        }
        if kept.is_empty() {
            return Ok(());
        }

        let rows: Vec<MpcFillFavoriteDriveInsertPatch> = kept
            .into_iter()
            .zip(0..)
            .map(|(source, position)| MpcFillFavoriteDriveInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                source,
                position,
            })
            .collect();
        rorm::insert(&mut *tx, MpcFillFavoriteDriveModel)
            .return_nothing()
            .bulk(&rows)
            .await
    }
}
