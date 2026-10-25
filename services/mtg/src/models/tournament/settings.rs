//! The settings an Owner gives a Tournament, checked before they are stored

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::fields::types::MaxStr;

use crate::models::format::rules_for;
use crate::models::visibility::Visibility;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::ruleset::TableSize;

/// A Tournament's settings as they arrive, not yet checked
#[derive(Debug, Clone)]
pub struct RawTournamentSettings {
    /// What the Tournament is called
    pub name: MaxStr<128>,
    /// What Participants should know beforehand
    pub description: Option<MaxStr<4096>>,
    /// Where it takes place, as free text
    pub location: Option<MaxStr<255>>,
    /// When it is announced to start
    pub starts_at: OffsetDateTime,
    /// How many Participants a full Match seats
    pub table_size: i16,
    /// The Ruleset to follow
    pub ruleset: Ruleset,
    /// The format played, `None` for any
    pub format: Option<MaxStr<32>>,
    /// Who may see the Tournament
    pub visibility: Visibility,
}

/// A Tournament's settings that passed [`TournamentSettings::check`]
#[derive(Debug, Clone)]
pub struct TournamentSettings {
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
    /// The Ruleset to follow, one fitting [`Self::table_size`]
    pub ruleset: Ruleset,
    /// The format played, one on offer, `None` for any
    pub format: Option<MaxStr<32>>,
    /// Who may see the Tournament
    pub visibility: Visibility,
}

/// Why settings were refused; several can hold at once
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SettingsRefusal {
    /// The Table size is outside 2 to 5
    pub table_size_out_of_range: bool,
    /// The Ruleset is not played at the Table size
    pub ruleset_mismatch: bool,
    /// The format is not one a deck can be built for
    pub unknown_format: bool,
}

impl TournamentSettings {
    /// Check settings, naming everything wrong with them at once
    pub fn check(raw: RawTournamentSettings) -> Result<Self, SettingsRefusal> {
        let mut refusal = SettingsRefusal::default();
        let table_size = TableSize::new(raw.table_size);
        match table_size {
            None => refusal.table_size_out_of_range = true,
            Some(table_size) => refusal.ruleset_mismatch = !raw.ruleset.fits(table_size),
        }
        refusal.unknown_format = raw
            .format
            .as_ref()
            .is_some_and(|format| rules_for(format).is_none());

        match table_size {
            Some(table_size) if refusal == SettingsRefusal::default() => Ok(Self {
                name: raw.name,
                description: raw.description,
                location: raw.location,
                starts_at: raw.starts_at,
                table_size,
                ruleset: raw.ruleset,
                format: raw.format,
                visibility: raw.visibility,
            }),
            _ => Err(refusal),
        }
    }
}
