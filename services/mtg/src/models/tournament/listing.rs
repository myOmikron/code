//! Lists of Tournaments: the public overview and "my Tournaments"

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::account::db::AccountModel;
use crate::models::tournament::Tournament;
use crate::models::tournament::db::TournamentModel;
use crate::models::visibility::Visibility;

/// How many Tournaments the public overview shows at most
pub const OVERVIEW_LIMIT: u64 = 100;

/// A Tournament in a list, with the name of its Owner
#[derive(Debug, Clone)]
pub struct ListedTournament {
    /// The Tournament
    pub tournament: Tournament,
    /// Its Owner's username, `None` while the Tombstone holds it
    pub owner: Option<Username>,
}

impl ListedTournament {
    /// The public Tournaments, latest start first
    ///
    /// Newer Tournaments break ties, so the order is total. Reads through the
    /// `tournament_overview` index and stops at [`OVERVIEW_LIMIT`].
    #[instrument(name = "ListedTournament::public", skip(tx))]
    pub async fn public(tx: &mut Transaction) -> Result<Vec<ListedTournament>, rorm::Error> {
        let rows = rorm::query(
            &mut *tx,
            (
                TournamentModel,
                TournamentModel.owner.username,
                TournamentModel.owner.tombstone,
            ),
        )
        .condition(TournamentModel.visibility.equals(Visibility::Public))
        .order_desc(TournamentModel.starts_at)
        .order_desc(TournamentModel.uuid)
        .limit(OVERVIEW_LIMIT)
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

impl Tournament {
    /// The Tournaments `account` owns, latest start first
    #[instrument(name = "Tournament::owned_by", skip(tx))]
    pub async fn owned_by(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<Tournament>, rorm::Error> {
        let rows = rorm::query(&mut *tx, TournamentModel)
            .condition(TournamentModel.owner.equals(account.into_inner()))
            .order_desc(TournamentModel.starts_at)
            .order_desc(TournamentModel.uuid)
            .all()
            .await?;
        Ok(rows.into_iter().map(Tournament::from).collect())
    }

    /// The username of this Tournament's Owner, `None` while the Tombstone holds it
    #[instrument(name = "Tournament::owner_name", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn owner_name(&self, tx: &mut Transaction) -> Result<Option<Username>, rorm::Error> {
        let (username, tombstone) =
            rorm::query(&mut *tx, (AccountModel.username, AccountModel.tombstone))
                .condition(AccountModel.uuid.equals(self.owner.into_inner()))
                .one()
                .await?;
        Ok((!tombstone).then(|| Username::new_from_field(username)))
    }
}
