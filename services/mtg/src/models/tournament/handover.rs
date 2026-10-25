//! Handing a Tournament on: the Owner offers it to an Account, which accepts or declines
//!
//! Nothing changes until the Account accepts. Then it becomes the Owner and
//! the former Owner stays as a Co-organizer. A Tournament has at most one
//! pending offer; the Owner replaces or withdraws it.

use galvyn::rorm;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentHandoverInsertPatch;
use crate::models::tournament::db::TournamentHandoverModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::listing::ListedTournament;
use crate::models::tournament::organizer::insert_co_organizer;

/// The Account a Tournament is offered to
#[derive(Debug, Clone)]
pub struct Handover {
    /// The Account
    pub offered_to: AccountUuid,
    /// The Account's username as it is now
    pub username: Username,
}

impl Tournament {
    /// The pending offer to hand this Tournament on, `None` for none
    #[instrument(name = "Tournament::handover", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn handover(&self, tx: &mut Transaction) -> Result<Option<Handover>, rorm::Error> {
        let row = rorm::query(
            &mut *tx,
            (
                TournamentHandoverModel.offered_to,
                TournamentHandoverModel.offered_to.username,
            ),
        )
        .condition(
            TournamentHandoverModel
                .tournament
                .equals(self.uuid.into_inner()),
        )
        .optional()
        .await?;
        Ok(row.map(|(offered_to, username)| Handover {
            offered_to: AccountUuid::new_from_field(offered_to),
            username: Username::new_from_field(username),
        }))
    }

    /// Offer this Tournament to `account`, replacing a pending offer
    ///
    /// The caller made sure `account` is not the Owner.
    #[instrument(name = "Tournament::offer_handover", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn offer_handover(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<(), rorm::Error> {
        self.withdraw_handover(tx).await?;
        rorm::insert(&mut *tx, TournamentHandoverModel)
            .return_nothing()
            .single(&TournamentHandoverInsertPatch {
                uuid: Uuid::now_v7(),
                tournament: ForeignModelByField(self.uuid.into_inner()),
                offered_to: ForeignModelByField(account.into_inner()),
            })
            .await
    }

    /// Withdraw the pending offer to hand this Tournament on, if there is one
    #[instrument(name = "Tournament::withdraw_handover", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn withdraw_handover(&self, tx: &mut Transaction) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, TournamentHandoverModel)
            .condition(
                TournamentHandoverModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            )
            .await?;
        Ok(())
    }

    /// Take over a Tournament offered to `account`
    ///
    /// `account` becomes the Owner, no longer a Co-organizer if it was one,
    /// and the former Owner becomes a Co-organizer. `None` when the
    /// Tournament is not offered to `account` (any more).
    #[instrument(name = "Tournament::accept_handover", skip(tx))]
    pub async fn accept_handover(
        tx: &mut Transaction,
        tournament: TournamentUuid,
        account: AccountUuid,
    ) -> Result<Option<Tournament>, rorm::Error> {
        if !take_offer(tx, tournament, account).await? {
            return Ok(None);
        }
        let Some(tournament) = Self::get(tx, tournament).await? else {
            return Ok(None);
        };
        let former = tournament.owner;
        tournament.remove_co_organizer(tx, account).await?;
        rorm::update(&mut *tx, TournamentModel)
            .set(
                TournamentModel.owner,
                ForeignModelByField(account.into_inner()),
            )
            .condition(TournamentModel.uuid.equals(tournament.uuid.into_inner()))
            .await?;
        let tournament = Tournament {
            owner: account,
            ..tournament
        };
        insert_co_organizer(tx, &tournament, former).await?;
        Ok(Some(tournament))
    }

    /// Turn down a Tournament offered to `account`, which leaves it as it was
    ///
    /// `false` when the Tournament is not offered to `account` (any more).
    #[instrument(name = "Tournament::decline_handover", skip(tx))]
    pub async fn decline_handover(
        tx: &mut Transaction,
        tournament: TournamentUuid,
        account: AccountUuid,
    ) -> Result<bool, rorm::Error> {
        take_offer(tx, tournament, account).await
    }
}

impl ListedTournament {
    /// The Tournaments offered to `account` to take over, latest start first
    #[instrument(name = "ListedTournament::offered_to", skip(tx))]
    pub async fn offered_to(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<ListedTournament>, rorm::Error> {
        let offered = rorm::query(&mut *tx, TournamentHandoverModel.tournament)
            .condition(
                TournamentHandoverModel
                    .offered_to
                    .equals(account.into_inner()),
            )
            .all()
            .await?;
        if offered.is_empty() {
            return Ok(Vec::new());
        }
        let rows = rorm::query(
            &mut *tx,
            (
                TournamentModel,
                TournamentModel.owner.username,
                TournamentModel.owner.tombstone,
            ),
        )
        .condition(DynamicCollection::or_unchecked(
            offered
                .into_iter()
                .map(|tournament| TournamentModel.uuid.equals(tournament.0))
                .collect(),
        ))
        .order_desc(TournamentModel.starts_at)
        .order_desc(TournamentModel.uuid)
        .all()
        .await?;
        Ok(rows
            .into_iter()
            .map(|(tournament, username, tombstone)| ListedTournament {
                tournament: Tournament::from(tournament),
                owner: (!tombstone).then(|| Username::new_from_field(username)),
            })
            .collect())
    }
}

/// Delete the offer of `tournament` to `account`, whether it existed
async fn take_offer(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    account: AccountUuid,
) -> Result<bool, rorm::Error> {
    let deleted = rorm::delete(&mut *tx, TournamentHandoverModel)
        .condition(rorm::and![
            TournamentHandoverModel
                .tournament
                .equals(tournament.into_inner()),
            TournamentHandoverModel
                .offered_to
                .equals(account.into_inner()),
        ])
        .await?;
    Ok(deleted > 0)
}
