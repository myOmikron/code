//! The settings an Owner gives a Tournament, checked before they are stored

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::fields::types::MaxStr;

use crate::models::format::rules_for;
use crate::models::tournament::Tournament;
use crate::models::visibility::Visibility;
use crate::tournament::ruleset::BestOf;
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
    /// How many Participants self sign-up admits at most, `None` for no limit
    pub participant_limit: Option<i32>,
    /// Whether Accounts may sign up themselves
    pub self_sign_up: bool,
    /// How many Games a one-on-one Match is played to
    pub best_of: Option<BestOf>,
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
    /// How many Participants self sign-up admits at most, two or more; `None` for no limit
    ///
    /// Organizers add Participants past it: the limit only closes self sign-up.
    pub participant_limit: Option<i32>,
    /// Whether Accounts may sign up themselves, only while Public or Unlisted
    pub self_sign_up: bool,
    /// How many Games a one-on-one Match is played to; set exactly at Table size 2
    pub best_of: Option<BestOf>,
}

impl TournamentSettings {
    /// Whether these settings change how `tournament` is played
    ///
    /// Table size, Ruleset and best-of are fixed once the first Round started.
    pub fn changes_rules_of(&self, tournament: &Tournament) -> bool {
        self.table_size != tournament.table_size
            || self.ruleset != tournament.ruleset
            || self.best_of != tournament.best_of
    }
}

/// The smallest participant limit: a Tournament takes at least two Participants
pub const MIN_PARTICIPANT_LIMIT: i32 = 2;

/// Why settings were refused; several can hold at once
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SettingsRefusal {
    /// The Table size is outside 2 to 5
    pub table_size_out_of_range: bool,
    /// The Ruleset is not played at the Table size
    pub ruleset_mismatch: bool,
    /// The format is not one a deck can be built for
    pub unknown_format: bool,
    /// The participant limit is below [`MIN_PARTICIPANT_LIMIT`]
    pub participant_limit_too_small: bool,
    /// Self sign-up is on for a private Tournament, which nobody else sees
    pub self_sign_up_needs_visibility: bool,
    /// Best-of is missing one-on-one or given for a multiplayer Tournament
    pub best_of_mismatch: bool,
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
        refusal.participant_limit_too_small = raw
            .participant_limit
            .is_some_and(|limit| limit < MIN_PARTICIPANT_LIMIT);
        refusal.self_sign_up_needs_visibility =
            raw.self_sign_up && raw.visibility == Visibility::Private;
        if let Some(table_size) = table_size {
            refusal.best_of_mismatch = (table_size.get() == 2) != raw.best_of.is_some();
        }

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
                participant_limit: raw.participant_limit,
                self_sign_up: raw.self_sign_up,
                best_of: raw.best_of,
            }),
            _ => Err(refusal),
        }
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::time::OffsetDateTime;
    use galvyn::rorm::fields::types::MaxStr;

    use super::RawTournamentSettings;
    use super::TournamentSettings;
    use crate::models::visibility::Visibility;
    use crate::tournament::ruleset::BestOf;
    use crate::tournament::ruleset::Ruleset;

    fn raw(visibility: Visibility) -> RawTournamentSettings {
        RawTournamentSettings {
            name: MaxStr::new("Friday Night Commander".to_string()).expect("short"),
            description: None,
            location: None,
            starts_at: OffsetDateTime::UNIX_EPOCH,
            table_size: 4,
            ruleset: Ruleset::TopDeck,
            format: None,
            visibility,
            participant_limit: None,
            self_sign_up: false,
            best_of: None,
        }
    }

    #[test]
    fn a_one_on_one_tournament_is_best_of_one_or_three_and_a_multiplayer_one_neither() {
        for (table_size, ruleset, best_of, valid) in [
            (2, Ruleset::Mtr, Some(BestOf::One), true),
            (2, Ruleset::Mtr, Some(BestOf::Three), true),
            (2, Ruleset::Mtr, None, false),
            (4, Ruleset::TopDeck, None, true),
            (4, Ruleset::TopDeck, Some(BestOf::Three), false),
        ] {
            let settings = RawTournamentSettings {
                table_size,
                ruleset,
                best_of,
                ..raw(Visibility::Public)
            };
            match TournamentSettings::check(settings) {
                Ok(settings) => {
                    assert!(valid, "{table_size} {best_of:?}");
                    assert_eq!(settings.best_of, best_of);
                }
                Err(refusal) => {
                    assert!(!valid, "{table_size} {best_of:?}");
                    assert!(refusal.best_of_mismatch, "{table_size} {best_of:?}");
                }
            }
        }
    }

    #[test]
    fn a_tournament_needs_no_participant_limit() {
        let settings = TournamentSettings::check(raw(Visibility::Public)).expect("valid");
        assert_eq!(settings.participant_limit, None);
    }

    #[test]
    fn a_participant_limit_takes_at_least_two() {
        for (limit, valid) in [(0, false), (1, false), (2, true), (64, true)] {
            let mut settings = raw(Visibility::Public);
            settings.participant_limit = Some(limit);
            match TournamentSettings::check(settings) {
                Ok(settings) => {
                    assert!(valid, "{limit}");
                    assert_eq!(settings.participant_limit, Some(limit));
                }
                Err(refusal) => {
                    assert!(!valid, "{limit}");
                    assert!(refusal.participant_limit_too_small, "{limit}");
                }
            }
        }
    }

    #[test]
    fn self_sign_up_needs_a_public_or_unlisted_tournament() {
        for (visibility, valid) in [
            (Visibility::Public, true),
            (Visibility::Unlisted, true),
            (Visibility::Private, false),
        ] {
            let mut settings = raw(visibility);
            settings.self_sign_up = true;
            match TournamentSettings::check(settings) {
                Ok(settings) => {
                    assert!(valid, "{visibility:?}");
                    assert!(settings.self_sign_up);
                }
                Err(refusal) => {
                    assert!(!valid, "{visibility:?}");
                    assert!(refusal.self_sign_up_needs_visibility, "{visibility:?}");
                }
            }
        }
    }
}
