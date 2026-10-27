//! Lists of Tournaments: the public overview, "my Tournaments" and a profile's

use std::borrow::Cow;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::conditions::Binary;
use galvyn::rorm::conditions::BinaryOperator;
use galvyn::rorm::conditions::Column;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::conditions::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::account::db::AccountModel;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentCoOrganizerModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::visibility::Visibility;

/// How many Tournaments the public overview shows at most
pub const OVERVIEW_LIMIT: u64 = 100;

/// How many Tournaments a profile shows at most
pub const PROFILE_LIMIT: u64 = 50;

/// A Tournament in a list, with the name of its Owner
#[derive(Debug, Clone)]
pub struct ListedTournament {
    /// The Tournament
    pub tournament: Tournament,
    /// Its Owner's username, `None` while the Tombstone holds it
    pub owner: Option<Username>,
}

/// Whether a Tournament is still ahead or already over
///
/// A running Tournament is upcoming and a finished or cancelled one is past,
/// whatever their start. One still in Registration is upcoming until its start
/// has passed.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum Timeframe {
    /// Not started yet or running now, the soonest start first
    Upcoming,
    /// Over, or never started although its start has passed, the latest start first
    Past,
}

/// What the public overview narrows its Tournaments down to
#[derive(Debug, Clone, Default)]
pub struct OverviewFilter {
    /// Only upcoming or only past Tournaments, `None` for both
    pub timeframe: Option<Timeframe>,
    /// Only Tournaments of this format, by its slug
    pub format: Option<MaxStr<32>>,
    /// Only Tournaments whose location contains this text, case ignored
    pub location: Option<String>,
}

impl ListedTournament {
    /// The public Tournaments the filter lets through
    ///
    /// Past and unfiltered lists show the latest start first, upcoming ones
    /// the soonest; the newer Tournament breaks ties, so the order is total.
    /// Reads through the `tournament_overview` index and stops at
    /// [`OVERVIEW_LIMIT`].
    #[instrument(name = "ListedTournament::public", skip(tx))]
    pub async fn public(
        tx: &mut Transaction,
        filter: &OverviewFilter,
        now: OffsetDateTime,
    ) -> Result<Vec<ListedTournament>, rorm::Error> {
        let mut conditions = vec![
            TournamentModel
                .visibility
                .equals(Visibility::Public)
                .boxed(),
        ];
        if let Some(timeframe) = filter.timeframe {
            conditions.push(in_timeframe(timeframe, now));
        }
        if let Some(format) = &filter.format {
            conditions.push(TournamentModel.format.equals(Some(&**format)).boxed());
        }
        if let Some(pattern) = filter.location.as_deref().and_then(location_pattern) {
            conditions.push(
                Binary {
                    operator: BinaryOperator::ILike,
                    fst_arg: Column(TournamentModel.location),
                    snd_arg: Value::String(Cow::Owned(pattern)),
                }
                .boxed(),
            );
        }

        let query = rorm::query(
            &mut *tx,
            (
                TournamentModel,
                TournamentModel.owner.username,
                TournamentModel.owner.tombstone,
            ),
        )
        .condition(DynamicCollection::and_unchecked(conditions));
        let query = if filter.timeframe == Some(Timeframe::Upcoming) {
            query
                .order_asc(TournamentModel.starts_at)
                .order_asc(TournamentModel.uuid)
        } else {
            query
                .order_desc(TournamentModel.starts_at)
                .order_desc(TournamentModel.uuid)
        };
        let rows = query.limit(OVERVIEW_LIMIT).all().await?;
        Ok(rows.into_iter().map(listed).collect())
    }

    /// The Tournaments `account` organizes, latest start first
    ///
    /// The ones it owns or is a Co-organizer of, whatever their Visibility.
    /// An Account is never both, so no Tournament shows twice.
    #[instrument(name = "ListedTournament::organized_by", skip(tx))]
    pub async fn organized_by(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<ListedTournament>, rorm::Error> {
        let owned = rorm::query(
            &mut *tx,
            (
                TournamentModel,
                TournamentModel.owner.username,
                TournamentModel.owner.tombstone,
            ),
        )
        .condition(TournamentModel.owner.equals(account.into_inner()))
        .all()
        .await?;
        let co_organized = rorm::query(
            &mut *tx,
            (
                TournamentCoOrganizerModel
                    .tournament
                    .query_as(TournamentModel),
                TournamentCoOrganizerModel.tournament.owner.username,
                TournamentCoOrganizerModel.tournament.owner.tombstone,
            ),
        )
        .condition(
            TournamentCoOrganizerModel
                .account
                .equals(account.into_inner()),
        )
        .all()
        .await?;

        let mut tournaments: Vec<_> = owned.into_iter().chain(co_organized).map(listed).collect();
        tournaments.sort_by(|a, b| {
            (b.tournament.starts_at, b.tournament.uuid.into_inner())
                .cmp(&(a.tournament.starts_at, a.tournament.uuid.into_inner()))
        });
        Ok(tournaments)
    }

    /// The Tournaments `account` takes part in as a Participant, latest start first
    ///
    /// Whatever their Visibility: a Participant sees the Tournament it plays in.
    /// Reads through the index on the Participant's Account.
    #[instrument(name = "ListedTournament::played_in_by", skip(tx))]
    pub async fn played_in_by(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<ListedTournament>, rorm::Error> {
        let rows = rorm::query(
            &mut *tx,
            (
                TournamentParticipantModel
                    .tournament
                    .query_as(TournamentModel),
                TournamentParticipantModel.tournament.owner.username,
                TournamentParticipantModel.tournament.owner.tombstone,
            ),
        )
        .condition(
            TournamentParticipantModel
                .account
                .equals(Some(account.into_inner())),
        )
        .order_desc(TournamentParticipantModel.tournament.starts_at)
        .order_desc(TournamentParticipantModel.tournament.uuid)
        .all()
        .await?;
        Ok(rows.into_iter().map(listed).collect())
    }

    /// The ongoing Tournaments in which the Account participates without having Dropped
    #[instrument(name = "ListedTournament::ongoing_participations", skip(tx))]
    pub async fn ongoing_participations(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<TournamentUuid>, rorm::Error> {
        let ids = rorm::query(&mut *tx, TournamentParticipantModel.tournament.uuid)
            .condition(rorm::and![
                TournamentParticipantModel
                    .account
                    .equals(Some(account.into_inner())),
                TournamentParticipantModel
                    .dropped_after_round
                    .equals(None::<i16>),
                rorm::or![
                    TournamentParticipantModel
                        .tournament
                        .state
                        .equals(TournamentState::Registration),
                    TournamentParticipantModel
                        .tournament
                        .state
                        .equals(TournamentState::Swiss),
                    TournamentParticipantModel
                        .tournament
                        .state
                        .equals(TournamentState::TopCut),
                ],
            ])
            .order_asc(TournamentParticipantModel.tournament.uuid)
            .all()
            .await?;
        Ok(ids.into_iter().map(TournamentUuid).collect())
    }

    /// The public Tournaments `account` owns or plays in, latest start first
    ///
    /// What its profile shows to anyone, itself included; unlisted and private
    /// ones stay off it. Stops at [`PROFILE_LIMIT`].
    #[instrument(name = "ListedTournament::on_profile", skip(tx))]
    pub async fn on_profile(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<ListedTournament>, rorm::Error> {
        let owned = rorm::query(
            &mut *tx,
            (
                TournamentModel,
                TournamentModel.owner.username,
                TournamentModel.owner.tombstone,
            ),
        )
        .condition(rorm::and![
            TournamentModel.owner.equals(account.into_inner()),
            TournamentModel.visibility.equals(Visibility::Public),
        ])
        .order_desc(TournamentModel.starts_at)
        .order_desc(TournamentModel.uuid)
        .limit(PROFILE_LIMIT)
        .all()
        .await?;
        let played = rorm::query(
            &mut *tx,
            (
                TournamentParticipantModel
                    .tournament
                    .query_as(TournamentModel),
                TournamentParticipantModel.tournament.owner.username,
                TournamentParticipantModel.tournament.owner.tombstone,
            ),
        )
        .condition(rorm::and![
            TournamentParticipantModel
                .account
                .equals(Some(account.into_inner())),
            TournamentParticipantModel
                .tournament
                .visibility
                .equals(Visibility::Public),
        ])
        .order_desc(TournamentParticipantModel.tournament.starts_at)
        .order_desc(TournamentParticipantModel.tournament.uuid)
        .limit(PROFILE_LIMIT)
        .all()
        .await?;

        let mut tournaments: Vec<_> = owned.into_iter().map(listed).collect();
        for tournament in played.into_iter().map(listed) {
            let known = tournaments
                .iter()
                .any(|listed| listed.tournament.uuid == tournament.tournament.uuid);
            if !known {
                tournaments.push(tournament);
            }
        }
        tournaments.sort_by(|a, b| {
            (b.tournament.starts_at, b.tournament.uuid.into_inner())
                .cmp(&(a.tournament.starts_at, a.tournament.uuid.into_inner()))
        });
        tournaments.truncate(PROFILE_LIMIT as usize);
        Ok(tournaments)
    }
}

impl Tournament {
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

/// A row of a Tournament list with its Owner's username and Tombstone flag
fn listed(
    (tournament, username, tombstone): (TournamentModel, MaxStr<32>, bool),
) -> ListedTournament {
    ListedTournament {
        tournament: Tournament::from(tournament),
        owner: (!tombstone).then(|| Username::new_from_field(username)),
    }
}

/// The condition for the Tournaments in `timeframe` at `now`, see [`Timeframe`]
fn in_timeframe<'a>(timeframe: Timeframe, now: OffsetDateTime) -> Box<dyn Condition<'a>> {
    match timeframe {
        Timeframe::Upcoming => rorm::or![
            TournamentModel.state.equals(TournamentState::Swiss),
            TournamentModel.state.equals(TournamentState::TopCut),
            rorm::and![
                TournamentModel.state.equals(TournamentState::Registration),
                TournamentModel.starts_at.greater_equals(now),
            ],
        ]
        .boxed(),
        Timeframe::Past => rorm::or![
            TournamentModel.state.equals(TournamentState::Finished),
            TournamentModel.state.equals(TournamentState::Cancelled),
            rorm::and![
                TournamentModel.state.equals(TournamentState::Registration),
                TournamentModel.starts_at.less_than(now),
            ],
        ]
        .boxed(),
    }
}

/// An `ILIKE` pattern matching a location that contains `text`, `None` for blank text
///
/// Surrounding blanks are dropped, and `LIKE` wildcards in `text` match only themselves.
fn location_pattern(text: &str) -> Option<String> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let mut pattern = String::with_capacity(text.len() + 2);
    pattern.push('%');
    for char in text.chars() {
        if matches!(char, '%' | '_' | '\\') {
            pattern.push('\\');
        }
        pattern.push(char);
    }
    pattern.push('%');
    Some(pattern)
}

#[cfg(test)]
mod tests {
    use super::location_pattern;

    #[test]
    fn a_location_matches_anywhere_in_the_text() {
        assert_eq!(location_pattern("Berlin").as_deref(), Some("%Berlin%"));
    }

    #[test]
    fn surrounding_blanks_are_dropped_and_blank_text_filters_nothing() {
        assert_eq!(location_pattern("  Kiel ").as_deref(), Some("%Kiel%"));
        assert_eq!(location_pattern("   "), None);
        assert_eq!(location_pattern(""), None);
    }

    #[test]
    fn like_wildcards_in_the_location_match_only_themselves() {
        assert_eq!(
            location_pattern("100%_ok\\").as_deref(),
            Some("%100\\%\\_ok\\\\%")
        );
    }
}
