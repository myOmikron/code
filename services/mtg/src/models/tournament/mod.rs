//! Tournaments: their settings, their state and who runs them
//!
//! The rows only. How Rounds are paired and ranked is the pure engine's
//! business, see [`crate::tournament`].

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
use crate::models::share::generate_share_token;
use crate::models::tournament::db::TournamentInsertPatch;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::settings::TournamentSettings;
use crate::models::visibility::Visibility;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::ruleset::TableSize;

pub mod access;
pub(in crate::models) mod db;
pub mod listing;
pub mod participant;
pub mod settings;

custom_db_enum! {
    enum: Ruleset,
    variants: [Mtr, TopDeck, MultiplayerAddendum],
    decoder: RulesetDecoder,
}

/// Where a Tournament stands
///
/// Registration, Swiss, Top cut, then Finished; Cancelled can follow any of
/// them and keeps the Rounds played so far.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum TournamentState {
    /// Before the first Round starts
    #[default]
    Registration,
    /// While Swiss Rounds are played
    Swiss,
    /// During the playoff
    TopCut,
    /// Over, with its standings final
    Finished,
    /// Called off; the Rounds played so far stay
    Cancelled,
}
custom_db_enum! {
    enum: TournamentState,
    variants: [Registration, Swiss, TopCut, Finished, Cancelled],
    decoder: TournamentStateDecoder,
}

/// One event of Rounds played under one Ruleset at one Table size
#[derive(Debug, Clone)]
pub struct Tournament {
    /// Primary key
    pub uuid: TournamentUuid,
    /// The Account the Tournament belongs to
    pub owner: AccountUuid,
    /// What the Tournament is called
    pub name: MaxStr<128>,
    /// What Participants should know beforehand
    pub description: Option<MaxStr<4096>>,
    /// Where it takes place, as free text
    pub location: Option<MaxStr<255>>,
    /// When it is announced to start
    pub starts_at: OffsetDateTime,
    /// How many Participants a full Match seats
    pub table_size: TableSize,
    /// The Ruleset it follows
    pub ruleset: Ruleset,
    /// The format played, `None` for any
    pub format: Option<MaxStr<32>>,
    /// Who may see it
    pub visibility: Visibility,
    /// Secret of the share link, set exactly while it is Unlisted
    pub share_token: Option<MaxStr<64>>,
    /// How many Participants self sign-up admits at most, `None` for no limit
    pub participant_limit: Option<i32>,
    /// Whether Accounts may sign up themselves
    pub self_sign_up: bool,
    /// Where it stands
    pub state: TournamentState,
    /// The point in time it was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of a [`Tournament`]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct TournamentUuid(Uuid);

impl TournamentUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

impl Tournament {
    /// Create a Tournament owned by `owner`, in Registration
    #[instrument(name = "Tournament::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        owner: AccountUuid,
        settings: TournamentSettings,
    ) -> Result<Tournament, rorm::Error> {
        let share_token = match settings.visibility {
            Visibility::Unlisted => Some(generate_share_token()),
            Visibility::Private | Visibility::Public => None,
        };
        let tournament = rorm::insert(&mut *tx, TournamentModel)
            .single(&TournamentInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                name: settings.name,
                description: settings.description,
                location: settings.location,
                starts_at: settings.starts_at,
                table_size: settings.table_size.get(),
                ruleset: settings.ruleset,
                format: settings.format,
                visibility: settings.visibility,
                share_token,
                participant_limit: settings.participant_limit,
                self_sign_up: settings.self_sign_up,
                state: TournamentState::Registration,
            })
            .await?;
        Ok(Tournament::from(tournament))
    }

    /// Replace the settings of this Tournament
    ///
    /// Becoming Unlisted mints a share token and staying Unlisted keeps it;
    /// leaving Unlisted drops it, so every link handed out stops working.
    #[instrument(name = "Tournament::update_settings", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn update_settings(
        self,
        tx: &mut Transaction,
        settings: TournamentSettings,
    ) -> Result<Tournament, rorm::Error> {
        let share_token = match (settings.visibility, self.share_token) {
            (Visibility::Unlisted, Some(token)) => Some(token),
            (Visibility::Unlisted, None) => Some(generate_share_token()),
            (Visibility::Private | Visibility::Public, _) => None,
        };
        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.name, settings.name.clone())
            .set(TournamentModel.description, settings.description.clone())
            .set(TournamentModel.location, settings.location.clone())
            .set(TournamentModel.starts_at, settings.starts_at)
            .set(TournamentModel.table_size, settings.table_size.get())
            .set(TournamentModel.ruleset, settings.ruleset)
            .set(TournamentModel.format, settings.format.clone())
            .set(TournamentModel.visibility, settings.visibility)
            .set(TournamentModel.share_token, share_token.clone())
            .set(
                TournamentModel.participant_limit,
                settings.participant_limit,
            )
            .set(TournamentModel.self_sign_up, settings.self_sign_up)
            .condition(TournamentModel.uuid.equals(self.uuid.0))
            .await?;
        Ok(Tournament {
            name: settings.name,
            description: settings.description,
            location: settings.location,
            starts_at: settings.starts_at,
            table_size: settings.table_size,
            ruleset: settings.ruleset,
            format: settings.format,
            visibility: settings.visibility,
            share_token,
            participant_limit: settings.participant_limit,
            self_sign_up: settings.self_sign_up,
            ..self
        })
    }

    /// Delete this Tournament and everything in it
    #[instrument(name = "Tournament::delete", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn delete(self, tx: &mut Transaction) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, TournamentModel)
            .condition(TournamentModel.uuid.equals(self.uuid.0))
            .await?;
        Ok(())
    }
}

impl From<TournamentModel> for Tournament {
    fn from(value: TournamentModel) -> Self {
        Self {
            uuid: TournamentUuid(value.uuid),
            owner: AccountUuid::new_from_field(value.owner),
            name: value.name,
            description: value.description,
            location: value.location,
            starts_at: value.starts_at,
            table_size: TableSize::new(value.table_size).unwrap_or_else(|| {
                unreachable!("table size {} was checked on the way in", value.table_size)
            }),
            ruleset: value.ruleset,
            format: value.format,
            visibility: value.visibility,
            share_token: value.share_token,
            participant_limit: value.participant_limit,
            self_sign_up: value.self_sign_up,
            state: value.state,
            created_at: value.created_at,
        }
    }
}
