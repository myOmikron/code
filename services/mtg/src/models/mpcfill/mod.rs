//! The MPCFill art an account starred
//!
//! A favorite image is kept with what it was found as (drive, file name, size),
//! so a client can recognise it after the drive re-uploads it under a new id.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::mpcfill::db::MpcFillFavoriteDriveInsertPatch;
use crate::models::mpcfill::db::MpcFillFavoriteDriveModel;
use crate::models::mpcfill::db::MpcFillFavoriteInsertPatch;
use crate::models::mpcfill::db::MpcFillFavoriteModel;

pub mod db;

/// One MPCFill image, as it was found when it was starred
#[derive(Debug, Clone)]
pub struct MpcFillImage {
    /// The Google Drive file id
    pub drive_id: MaxStr<128>,
    /// The file's name in its drive
    pub file_name: MaxStr<255>,
    /// The drive it lies in
    pub source: MaxStr<255>,
    /// Its resolution
    pub dpi: i64,
    /// Its size in bytes
    pub size: i64,
}

/// An image an account starred
#[derive(Debug, Clone)]
pub struct MpcFillFavorite {
    /// The card face it was starred for, `None` for a cardback
    pub face: Option<MaxStr<255>>,
    /// The image
    pub image: MpcFillImage,
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

    /// Stars an image, or stars it again as the newest
    #[instrument(name = "MpcFillFavorite::star", skip(tx))]
    pub async fn star(
        tx: &mut Transaction,
        owner: AccountUuid,
        face: Option<MaxStr<255>>,
        image: MpcFillImage,
    ) -> Result<(), rorm::Error> {
        Self::unstar(&mut *tx, owner, &image.drive_id).await?;
        rorm::insert(&mut *tx, MpcFillFavoriteModel)
            .return_nothing()
            .single(&MpcFillFavoriteInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                face,
                drive_id: image.drive_id,
                file_name: image.file_name,
                source: image.source,
                dpi: image.dpi,
                size: image.size,
            })
            .await
    }

    /// Takes the star off an image
    #[instrument(name = "MpcFillFavorite::unstar", skip(tx))]
    pub async fn unstar(
        tx: &mut Transaction,
        owner: AccountUuid,
        drive_id: &str,
    ) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, MpcFillFavoriteModel)
            .condition(rorm::and![
                MpcFillFavoriteModel.owner.equals(owner.into_inner()),
                MpcFillFavoriteModel.drive_id.equals(drive_id),
            ])
            .await?;
        Ok(())
    }

    /// Moves a star to the file that replaced the starred one, keeping when it was starred
    #[instrument(name = "MpcFillFavorite::replace", skip(tx))]
    pub async fn replace(
        tx: &mut Transaction,
        owner: AccountUuid,
        old: &str,
        image: MpcFillImage,
    ) -> Result<(), rorm::Error> {
        if &*image.drive_id != old {
            let taken = rorm::query(&mut *tx, MpcFillFavoriteModel.uuid)
                .condition(rorm::and![
                    MpcFillFavoriteModel.owner.equals(owner.into_inner()),
                    MpcFillFavoriteModel.drive_id.equals(&*image.drive_id),
                ])
                .optional()
                .await?;
            if taken.is_some() {
                return Self::unstar(&mut *tx, owner, old).await;
            }
        }

        rorm::update(&mut *tx, MpcFillFavoriteModel)
            .set(MpcFillFavoriteModel.drive_id, image.drive_id)
            .set(MpcFillFavoriteModel.file_name, image.file_name)
            .set(MpcFillFavoriteModel.source, image.source)
            .set(MpcFillFavoriteModel.dpi, image.dpi)
            .set(MpcFillFavoriteModel.size, image.size)
            .condition(rorm::and![
                MpcFillFavoriteModel.owner.equals(owner.into_inner()),
                MpcFillFavoriteModel.drive_id.equals(old),
            ])
            .await?;
        Ok(())
    }
}

impl From<MpcFillFavoriteModel> for MpcFillFavorite {
    fn from(row: MpcFillFavoriteModel) -> Self {
        Self {
            face: row.face,
            image: MpcFillImage {
                drive_id: row.drive_id,
                file_name: row.file_name,
                source: row.source,
                dpi: row.dpi,
                size: row.size,
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
        let rows = rorm::query(&mut *tx, MpcFillFavoriteDriveModel.source)
            .condition(MpcFillFavoriteDriveModel.owner.equals(owner.into_inner()))
            .order_asc(MpcFillFavoriteDriveModel.position)
            .all()
            .await?;
        Ok(rows)
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
