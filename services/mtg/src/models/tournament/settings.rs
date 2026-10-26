//! The settings an Owner gives a Tournament, checked before they are stored

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::fields::types::MaxStr;

use crate::models::format::rules_for;
use crate::models::tournament::Tournament;
use crate::models::visibility::Visibility;
use crate::tournament::ruleset::BestOf;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::ruleset::TableSize;
use crate::tournament::top_cut::TopCut;

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
    /// The Top cut after the Swiss Rounds, `None` for none
    pub top_cut: Option<TopCut>,
    /// How many Games a Top cut Match is played to
    pub top_cut_best_of: Option<BestOf>,
    /// What playing costs, `None` for nothing
    pub entry_fee: Option<EntryFee>,
}

/// What playing in a Tournament costs
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryFee {
    /// The amount in the currency's smallest unit, cents for euros; above zero
    pub amount: i32,
    /// The ISO 4217 code of the currency, three capital letters like `EUR`
    pub currency: MaxStr<3>,
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
    /// The Top cut after the Swiss Rounds, one fitting [`Self::table_size`]; `None` for none
    pub top_cut: Option<TopCut>,
    /// How many Games a Top cut Match is played to; set exactly with [`Self::top_cut`]
    pub top_cut_best_of: Option<BestOf>,
    /// What playing costs, `None` for nothing
    ///
    /// With a fee every Participant starts unpaid and is left out of the
    /// pairing until an Organizer marks it paid.
    pub entry_fee: Option<EntryFee>,
}

impl TournamentSettings {
    /// Whether these settings change the Top cut of `tournament`
    ///
    /// Its size and Match length stay open until the Swiss Rounds are over.
    pub fn changes_top_cut_of(&self, tournament: &Tournament) -> bool {
        self.top_cut != tournament.top_cut || self.top_cut_best_of != tournament.top_cut_best_of
    }

    /// Whether these settings change how `tournament` is played
    ///
    /// Table size, Ruleset and best-of are fixed once the first Round started,
    /// and so is whether there is an entry fee: taking one up would leave every
    /// Participant out of the next pairing, dropping one would pair the unpaid.
    /// Amount and currency stay editable.
    pub fn changes_rules_of(&self, tournament: &Tournament) -> bool {
        self.table_size != tournament.table_size
            || self.ruleset != tournament.ruleset
            || self.best_of != tournament.best_of
            || self.entry_fee.is_some() != tournament.entry_fee.is_some()
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
    /// The Top cut is not played at the Table size
    pub top_cut_mismatch: bool,
    /// The Top cut's best-of is missing with a Top cut or given without one
    pub top_cut_best_of_mismatch: bool,
    /// The entry fee is zero or less
    pub entry_fee_not_positive: bool,
    /// The entry fee's currency is not three capital letters
    pub unknown_currency: bool,
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
            refusal.top_cut_mismatch = raw.top_cut.is_some_and(|top_cut| !top_cut.fits(table_size));
        }
        refusal.top_cut_best_of_mismatch = raw.top_cut.is_some() != raw.top_cut_best_of.is_some();
        if let Some(fee) = &raw.entry_fee {
            refusal.entry_fee_not_positive = fee.amount <= 0;
            refusal.unknown_currency = !(fee.currency.len() == 3
                && fee.currency.bytes().all(|byte| byte.is_ascii_uppercase()));
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
                top_cut: raw.top_cut,
                top_cut_best_of: raw.top_cut_best_of,
                entry_fee: raw.entry_fee,
            }),
            _ => Err(refusal),
        }
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::time::OffsetDateTime;
    use galvyn::rorm::fields::types::MaxStr;

    use super::EntryFee;
    use super::RawTournamentSettings;
    use super::TournamentSettings;
    use crate::models::tournament::Tournament;
    use crate::models::visibility::Visibility;
    use crate::tournament::ruleset::BestOf;
    use crate::tournament::ruleset::Ruleset;
    use crate::tournament::top_cut::TopCut;

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
            top_cut: None,
            top_cut_best_of: None,
            entry_fee: None,
        }
    }

    fn fee(amount: i32, currency: &str) -> Option<EntryFee> {
        Some(EntryFee {
            amount,
            currency: MaxStr::new(currency.to_string()).expect("short"),
        })
    }

    #[test]
    fn taking_up_or_dropping_an_entry_fee_changes_the_rules_but_a_new_amount_does_not() {
        let mut tournament_settings = raw(Visibility::Public);
        tournament_settings.entry_fee = fee(500, "EUR");
        let tournament = Tournament::from_settings_for_test(
            TournamentSettings::check(tournament_settings.clone()).expect("valid"),
        );
        for (entry_fee, changes) in [
            (fee(500, "EUR"), false),
            (fee(800, "CHF"), false),
            (None, true),
        ] {
            let settings = TournamentSettings::check(RawTournamentSettings {
                entry_fee: entry_fee.clone(),
                ..tournament_settings.clone()
            })
            .expect("valid");
            assert_eq!(
                settings.changes_rules_of(&tournament),
                changes,
                "{entry_fee:?}"
            );
        }
        let free = Tournament::from_settings_for_test(
            TournamentSettings::check(raw(Visibility::Public)).expect("valid"),
        );
        let settings = TournamentSettings::check(tournament_settings).expect("valid");
        assert!(settings.changes_rules_of(&free));
    }

    #[test]
    fn a_tournament_needs_no_entry_fee() {
        let settings = TournamentSettings::check(raw(Visibility::Public)).expect("valid");
        assert_eq!(settings.entry_fee, None);
    }

    #[test]
    fn an_entry_fee_is_a_positive_amount_in_cents() {
        for (amount, valid) in [(-500, false), (0, false), (1, true), (500, true)] {
            let settings = RawTournamentSettings {
                entry_fee: fee(amount, "EUR"),
                ..raw(Visibility::Public)
            };
            match TournamentSettings::check(settings) {
                Ok(settings) => {
                    assert!(valid, "{amount}");
                    assert_eq!(settings.entry_fee, fee(amount, "EUR"));
                }
                Err(refusal) => {
                    assert!(!valid, "{amount}");
                    assert!(refusal.entry_fee_not_positive, "{amount}");
                }
            }
        }
    }

    #[test]
    fn an_entry_fee_is_in_a_currency_named_by_three_capital_letters() {
        for (currency, valid) in [
            ("EUR", true),
            ("CHF", true),
            ("eur", false),
            ("EU", false),
            ("", false),
            ("E1R", false),
        ] {
            let settings = RawTournamentSettings {
                entry_fee: fee(500, currency),
                ..raw(Visibility::Public)
            };
            match TournamentSettings::check(settings) {
                Ok(_) => assert!(valid, "{currency}"),
                Err(refusal) => {
                    assert!(!valid, "{currency}");
                    assert!(refusal.unknown_currency, "{currency}");
                }
            }
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

    #[test]
    fn a_top_cut_is_played_one_on_one_with_its_own_best_of() {
        for (table_size, ruleset, top_cut, top_cut_best_of, valid) in [
            (2, Ruleset::Mtr, None, None, true),
            (
                2,
                Ruleset::Mtr,
                Some(TopCut::Top8),
                Some(BestOf::Three),
                true,
            ),
            (2, Ruleset::Mtr, Some(TopCut::Top4), Some(BestOf::One), true),
            (2, Ruleset::Mtr, Some(TopCut::Top8), None, false),
            (2, Ruleset::Mtr, None, Some(BestOf::Three), false),
            (
                4,
                Ruleset::TopDeck,
                Some(TopCut::Top4),
                Some(BestOf::One),
                false,
            ),
        ] {
            let best_of = (table_size == 2).then_some(BestOf::One);
            let settings = RawTournamentSettings {
                table_size,
                ruleset,
                best_of,
                top_cut,
                top_cut_best_of,
                ..raw(Visibility::Public)
            };
            match TournamentSettings::check(settings) {
                Ok(settings) => {
                    assert!(valid, "{table_size} {top_cut:?} {top_cut_best_of:?}");
                    assert_eq!(settings.top_cut, top_cut);
                    assert_eq!(settings.top_cut_best_of, top_cut_best_of);
                }
                Err(refusal) => {
                    assert!(!valid, "{table_size} {top_cut:?} {top_cut_best_of:?}");
                    assert!(
                        refusal.top_cut_mismatch || refusal.top_cut_best_of_mismatch,
                        "{table_size} {top_cut:?} {top_cut_best_of:?}"
                    );
                }
            }
        }
    }
}
