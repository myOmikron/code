//! Plan a date: a Commander and an account take turns setting a deck's theme levels

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::dating::db::DatingDateInsertPatch;
use crate::models::dating::db::DatingDateModel;
use crate::models::deck::Deck;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckUuid;
use crate::models::deck::advisor::ThemeLevel;

/// Turns per date: three for the Commander, three for the account
pub const TURNS: usize = 6;

/// Chemistry a date starts at
pub const START_CHEMISTRY: i32 = 50;

/// Chemistry after "No, come back"
pub const COME_BACK_CHEMISTRY: i32 = 25;

/// How many themes the account may choose from on its turn
pub const PALETTE_SIZE: usize = 8;

/// How many unsupported palette themes a pick swaps for fresh ones
pub const ROTATE: usize = 2;

/// Where a date stands
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum DateProgress {
    /// Turns are still to be taken
    Active,
    /// Chemistry hit zero and the Commander left
    Left,
    /// Planned; the theme levels are on the deck
    Done,
}
custom_db_enum! {
    enum: DateProgress,
    variants: [Active, Left, Done],
    decoder: DateProgressDecoder,
}

/// Whose turn it was
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum TurnBy {
    /// The Commander proposed, the account answered
    Commander,
    /// The account brought a theme
    Player,
}

/// How much a Commander supports a theme
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Support {
    /// Many of its usual cards fit
    High,
    /// Some do
    Mid,
    /// Hardly any
    Low,
}

/// A theme on a date
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DateTheme {
    /// Advisor theme id
    pub theme: String,
    /// The theme's label
    pub label: String,
    /// How much the Commander supports it
    pub tier: Support,
}

/// One turn taken
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DateTurn {
    /// Whose turn it was
    pub by: TurnBy,
    /// The theme it was about
    pub theme: DateTheme,
    /// The level it ended at
    pub level: ThemeLevel,
    /// What it did to the chemistry
    pub delta: i32,
}

/// Everything a date remembers
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DateState {
    /// 0 to 100; at 0 the Commander leaves
    pub chemistry: i32,
    /// What the Commander proposes, one per Commander turn
    pub proposals: Vec<DateTheme>,
    /// What the account may bring
    pub palette: Vec<DateTheme>,
    /// What refills the palette after a pick, best supported first
    #[serde(default)]
    pub reserve: Vec<DateTheme>,
    /// The turns so far
    pub turns: Vec<DateTurn>,
}

/// Why a move was refused
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateMoveError {
    /// The date is over or the Commander left
    NotActive,
    /// It is the other side's turn
    NotYourTurn,
    /// The theme is not on the palette, or already planned
    UnknownTheme,
    /// The account may only bring a theme it wants
    AvoidNotAllowed,
}

impl DateState {
    /// A fresh date
    pub fn new(
        proposals: Vec<DateTheme>,
        (palette, reserve): (Vec<DateTheme>, Vec<DateTheme>),
    ) -> Self {
        Self {
            chemistry: START_CHEMISTRY,
            proposals,
            palette,
            reserve,
            turns: Vec::new(),
        }
    }

    /// Whose turn is next, `None` once every turn is taken
    pub fn next(&self) -> Option<TurnBy> {
        let turn = self.turns.len();
        if turn >= TURNS || turn / 2 >= self.proposals.len() && turn.is_multiple_of(2) {
            return None;
        }
        Some(if turn.is_multiple_of(2) {
            TurnBy::Commander
        } else {
            TurnBy::Player
        })
    }

    /// What the Commander is proposing right now
    pub fn proposal(&self) -> Option<&DateTheme> {
        match self.next() {
            Some(TurnBy::Commander) => self.proposals.get(self.turns.len() / 2),
            _ => None,
        }
    }

    /// Palette themes not yet planned
    pub fn open_palette(&self) -> Vec<&DateTheme> {
        self.palette
            .iter()
            .filter(|theme| !self.planned(&theme.theme))
            .collect()
    }

    fn planned(&self, theme: &str) -> bool {
        self.turns.iter().any(|turn| turn.theme.theme == theme)
    }

    fn take(
        &mut self,
        by: TurnBy,
        theme: DateTheme,
        level: ThemeLevel,
        delta: i32,
    ) -> DateProgress {
        self.chemistry = (self.chemistry + delta).clamp(0, 100);
        self.turns.push(DateTurn {
            by,
            theme,
            level,
            delta,
        });
        if self.chemistry == 0 {
            DateProgress::Left
        } else if self.next().is_none() {
            DateProgress::Done
        } else {
            DateProgress::Active
        }
    }

    /// Answer the Commander's proposal
    pub fn answer(&mut self, level: ThemeLevel) -> Result<DateProgress, DateMoveError> {
        let index = self.turns.len() / 2;
        let theme = self.proposal().cloned().ok_or(DateMoveError::NotYourTurn)?;
        let delta = match level {
            ThemeLevel::AllIn => 20,
            ThemeLevel::Core => 15,
            ThemeLevel::Light => 5,
            ThemeLevel::Avoid if index == 0 => -40,
            ThemeLevel::Avoid => -30,
        };
        Ok(self.take(TurnBy::Commander, theme, level, delta))
    }

    /// Bring a theme of the account's own
    pub fn bring(&mut self, theme: &str, level: ThemeLevel) -> Result<DateProgress, DateMoveError> {
        if self.next() != Some(TurnBy::Player) {
            return Err(DateMoveError::NotYourTurn);
        }
        if level == ThemeLevel::Avoid {
            return Err(DateMoveError::AvoidNotAllowed);
        }
        let theme = self
            .open_palette()
            .into_iter()
            .find(|candidate| candidate.theme == theme)
            .cloned()
            .ok_or(DateMoveError::UnknownTheme)?;
        let delta = match (theme.tier, level) {
            (Support::High, ThemeLevel::Light) => 10,
            (Support::High, _) => 15,
            (Support::Mid, _) => 5,
            (Support::Low, ThemeLevel::AllIn) => -25,
            (Support::Low, ThemeLevel::Core) => -10,
            (Support::Low, _) => 0,
        };
        let progress = self.take(TurnBy::Player, theme, level, delta);
        self.restock();
        Ok(progress)
    }

    /// Swap the last unsupported palette themes for fresh ones and refill the palette
    fn restock(&mut self) {
        let planned: Vec<String> = self
            .turns
            .iter()
            .map(|turn| turn.theme.theme.clone())
            .collect();
        self.palette.retain(|theme| !planned.contains(&theme.theme));
        self.reserve.retain(|theme| !planned.contains(&theme.theme));

        let mut rotated = Vec::new();
        for slot in (0..self.palette.len()).rev() {
            if rotated.len() == ROTATE || self.reserve.is_empty() {
                break;
            }
            if self.palette[slot].tier == Support::Low {
                let fresh = self.reserve.remove(0);
                rotated.push(std::mem::replace(&mut self.palette[slot], fresh));
            }
        }
        let missing = PALETTE_SIZE
            .saturating_sub(self.palette.len())
            .min(self.reserve.len());
        self.palette.extend(self.reserve.drain(..missing));
        self.reserve.extend(rotated);
    }

    /// End the date early on the account's turn: "That's all, date night"
    pub fn date_night(&self) -> Result<DateProgress, DateMoveError> {
        if self.next() != Some(TurnBy::Player) {
            return Err(DateMoveError::NotYourTurn);
        }
        Ok(DateProgress::Done)
    }

    /// The theme levels the date agreed on
    pub fn levels(&self) -> Vec<(String, ThemeLevel)> {
        self.turns
            .iter()
            .map(|turn| (turn.theme.theme.clone(), turn.level))
            .collect()
    }
}

/// The themes the account may bring: its own strongest first, then what the Commander supports;
/// the rest is the reserve
pub fn palette(
    proposals: &[DateTheme],
    rated: &[DateTheme],
    own: &[String],
) -> (Vec<DateTheme>, Vec<DateTheme>) {
    let mut out: Vec<DateTheme> = Vec::new();
    let taken = |out: &Vec<DateTheme>, id: &str| {
        proposals.iter().any(|theme| theme.theme == id) || out.iter().any(|theme| theme.theme == id)
    };
    for id in own.iter().take(PALETTE_SIZE / 2) {
        if let Some(theme) = rated.iter().find(|theme| &theme.theme == id)
            && !taken(&out, id)
        {
            out.push(theme.clone());
        }
    }
    for theme in rated {
        if out.len() >= PALETTE_SIZE {
            break;
        }
        if !taken(&out, &theme.theme) {
            out.push(theme.clone());
        }
    }
    let reserve = rated
        .iter()
        .filter(|theme| !taken(&out, &theme.theme))
        .cloned()
        .collect();
    (out, reserve)
}

/// A date as stored
#[derive(Debug, Clone)]
pub struct DatingDate {
    /// The deck being planned
    pub deck: DeckUuid,
    /// The Commander's oracle id
    pub commander: Uuid,
    /// Where the date stands
    pub status: DateProgress,
    /// Turns and chemistry
    pub state: DateState,
}

impl From<DatingDateModel> for DatingDate {
    fn from(model: DatingDateModel) -> Self {
        Self {
            deck: DeckUuid::from_uuid(model.deck.0),
            commander: model.commander,
            status: model.status,
            state: model.state.into_inner(),
        }
    }
}

impl DatingDate {
    /// The date planning `deck`, `None` without one
    #[instrument(name = "DatingDate::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        owner: AccountUuid,
        deck: DeckUuid,
    ) -> Result<Option<DatingDate>, rorm::Error> {
        let model = rorm::query(&mut *tx, DatingDateModel)
            .condition(rorm::and![
                DatingDateModel.owner.equals(owner.into_inner()),
                DatingDateModel.deck.equals(deck.into_inner()),
            ])
            .optional()
            .await?;
        Ok(model.map(Self::from))
    }

    /// Every date of the account that is not done, to resume them
    #[instrument(name = "DatingDate::open", skip(tx))]
    pub async fn open(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<DatingDate>, rorm::Error> {
        let models = rorm::query(&mut *tx, DatingDateModel)
            .condition(rorm::and![
                DatingDateModel.owner.equals(owner.into_inner()),
                DatingDateModel.status.not_equals(DateProgress::Done),
            ])
            .all()
            .await?;
        Ok(models.into_iter().map(Self::from).collect())
    }

    /// Start a date on one of the account's decks, replacing an earlier one
    #[instrument(name = "DatingDate::start", skip(tx, state))]
    pub async fn start(
        tx: &mut Transaction,
        owner: AccountUuid,
        deck: DeckUuid,
        commander: Uuid,
        state: DateState,
    ) -> Result<DeckAccess<DatingDate>, rorm::Error> {
        if let DeckAccess::Denied = Deck::advisor_settings(tx, owner, deck).await? {
            return Ok(DeckAccess::Denied);
        }
        rorm::delete(&mut *tx, DatingDateModel)
            .condition(DatingDateModel.deck.equals(deck.into_inner()))
            .await?;
        let model = rorm::insert(&mut *tx, DatingDateModel)
            .single(&DatingDateInsertPatch {
                uuid: Uuid::now_v7(),
                owner: ForeignModelByField(owner.into_inner()),
                deck: ForeignModelByField(deck.into_inner()),
                commander,
                status: DateProgress::Active,
                state: Json(state),
            })
            .await?;
        Ok(DeckAccess::Granted(DatingDate::from(model)))
    }

    /// Store the date's state; a finished date writes its levels onto the deck
    #[instrument(name = "DatingDate::save", skip(tx, self))]
    pub async fn save(
        &self,
        tx: &mut Transaction,
        owner: AccountUuid,
        bracket: Option<i16>,
    ) -> Result<(), rorm::Error> {
        rorm::update(&mut *tx, DatingDateModel)
            .set(DatingDateModel.status, self.status)
            .set(DatingDateModel.state, Json(self.state.clone()))
            .condition(rorm::and![
                DatingDateModel.owner.equals(owner.into_inner()),
                DatingDateModel.deck.equals(self.deck.into_inner()),
            ])
            .await?;

        if self.status != DateProgress::Done {
            return Ok(());
        }
        let DeckAccess::Granted(mut settings) =
            Deck::advisor_settings(tx, owner, self.deck).await?
        else {
            return Ok(());
        };
        for (theme, level) in self.state.levels() {
            settings.themes.levels.insert(theme, level);
        }
        settings.setup_done = true;
        Deck::set_advisor_settings(tx, owner, self.deck, settings).await?;
        if let Some(bracket) = bracket {
            Deck::set_bracket(tx, owner, self.deck, Some(bracket)).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::DateMoveError;
    use super::DateProgress;
    use super::DateState;
    use super::DateTheme;
    use super::Support;
    use super::TurnBy;
    use crate::models::deck::advisor::ThemeLevel;

    fn theme(id: &str, tier: Support) -> DateTheme {
        DateTheme {
            theme: id.to_string(),
            label: id.to_string(),
            tier,
        }
    }

    fn date() -> DateState {
        DateState::new(
            vec![
                theme("tribal", Support::High),
                theme("tokens", Support::High),
                theme("aggro", Support::High),
            ],
            (
                vec![
                    theme("treasure", Support::Mid),
                    theme("lifegain", Support::Low),
                    theme("aristocrats", Support::High),
                ],
                Vec::new(),
            ),
        )
    }

    #[test]
    fn turns_alternate_and_end_after_six() {
        let mut date = date();
        assert_eq!(date.next(), Some(TurnBy::Commander));
        date.answer(ThemeLevel::AllIn).unwrap();
        assert_eq!(date.next(), Some(TurnBy::Player));
        date.bring("aristocrats", ThemeLevel::Core).unwrap();
        date.answer(ThemeLevel::Core).unwrap();
        date.bring("treasure", ThemeLevel::Light).unwrap();
        date.answer(ThemeLevel::Light).unwrap();
        let progress = date.bring("lifegain", ThemeLevel::Light).unwrap();

        assert_eq!(progress, DateProgress::Done);
        assert_eq!(date.chemistry, 100, "capped at 100");
        assert_eq!(date.levels().len(), 6);
    }

    #[test]
    fn refusing_the_top_interest_costs_the_most() {
        let mut date = date();
        date.answer(ThemeLevel::Avoid).unwrap();

        assert_eq!(date.chemistry, 10);
    }

    #[test]
    fn chemistry_at_zero_ends_the_date() {
        let mut date = date();
        date.answer(ThemeLevel::Avoid).unwrap();
        let progress = date.bring("lifegain", ThemeLevel::AllIn).unwrap();

        assert_eq!(progress, DateProgress::Left);
        assert_eq!(date.chemistry, 0);
    }

    #[test]
    fn moves_out_of_turn_are_refused() {
        let mut date = date();
        assert_eq!(
            date.bring("treasure", ThemeLevel::Core),
            Err(DateMoveError::NotYourTurn)
        );
        date.answer(ThemeLevel::Core).unwrap();
        assert_eq!(
            date.answer(ThemeLevel::Core),
            Err(DateMoveError::NotYourTurn)
        );
        assert_eq!(
            date.bring("treasure", ThemeLevel::Avoid),
            Err(DateMoveError::AvoidNotAllowed)
        );
        assert_eq!(
            date.bring("mill", ThemeLevel::Core),
            Err(DateMoveError::UnknownTheme)
        );
    }

    #[test]
    fn the_palette_leads_with_own_themes_and_skips_proposals() {
        let rated = vec![
            theme("tokens", Support::High),
            theme("treasure", Support::Mid),
            theme("mill", Support::Low),
            theme("lifegain", Support::Low),
        ];
        let proposals = vec![theme("tokens", Support::High)];
        let own = vec!["mill".to_string(), "tokens".to_string()];

        let (palette, reserve) = super::palette(&proposals, &rated, &own);
        let ids: Vec<String> = palette.into_iter().map(|t| t.theme).collect();

        assert_eq!(ids, ["mill", "treasure", "lifegain"]);
        assert!(reserve.is_empty());
    }

    #[test]
    fn a_planned_theme_leaves_the_palette() {
        let mut date = date();
        date.answer(ThemeLevel::Core).unwrap();
        date.bring("treasure", ThemeLevel::Core).unwrap();

        assert!(date.open_palette().iter().all(|t| t.theme != "treasure"));
    }

    #[test]
    fn a_pick_refills_the_palette_and_rotates_unsupported_themes() {
        let mut date = DateState::new(
            vec![
                theme("tribal", Support::High),
                theme("tokens", Support::High),
            ],
            (
                vec![
                    theme("treasure", Support::High),
                    theme("mill", Support::Low),
                    theme("lifegain", Support::Low),
                    theme("voltron", Support::Low),
                ],
                vec![theme("blink", Support::Mid), theme("wheels", Support::Low)],
            ),
        );
        date.answer(ThemeLevel::Core).unwrap();
        date.bring("treasure", ThemeLevel::Core).unwrap();

        let ids: Vec<&str> = date.palette.iter().map(|t| t.theme.as_str()).collect();
        let reserve: Vec<&str> = date.reserve.iter().map(|t| t.theme.as_str()).collect();
        assert_eq!(
            ids,
            ["mill", "wheels", "blink"],
            "the last two unsupported swapped out"
        );
        assert_eq!(
            reserve,
            ["voltron", "lifegain"],
            "rotated themes can come back"
        );
    }
}
