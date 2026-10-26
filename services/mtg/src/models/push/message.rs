//! What a tournament push says, in the language of the device it goes to

use crate::models::push::PushLanguage;
use crate::models::tournament::TournamentUuid;
use crate::modules::web_push::PushMessage;

/// A push about a Tournament
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TournamentPush {
    /// A Round started, and where the Participant plays in it
    RoundPaired {
        /// The Tournament
        tournament: TournamentUuid,
        /// Its name
        name: String,
        /// The Round's number
        round: i16,
        /// Where the Participant plays
        place: RoundPlace,
    },
}

/// Where a Participant plays in a Round
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoundPlace {
    /// At a table, in a Seat
    Table {
        /// The table number
        table: i16,
        /// The Seat, 1 takes the first turn
        seat: i16,
    },
    /// Nowhere: it has a Bye
    Bye,
}

impl TournamentPush {
    /// The push as a device in `language` shows it
    pub fn render(&self, language: PushLanguage) -> PushMessage {
        match self {
            TournamentPush::RoundPaired {
                tournament,
                name,
                round,
                place,
            } => {
                let body = match (language, place) {
                    (PushLanguage::De, RoundPlace::Table { table, seat }) => {
                        format!("Runde {round} ist gepaart: Tisch {table}, Sitz {seat}.")
                    }
                    (PushLanguage::De, RoundPlace::Bye) => {
                        format!("Runde {round} ist gepaart: Du hast ein Bye.")
                    }
                    (PushLanguage::En, RoundPlace::Table { table, seat }) => {
                        format!("Round {round} is paired: table {table}, seat {seat}.")
                    }
                    (PushLanguage::En, RoundPlace::Bye) => {
                        format!("Round {round} is paired: you have a Bye.")
                    }
                };
                let tournament = tournament.into_inner();
                PushMessage {
                    title: name.clone(),
                    body,
                    url: format!("/tournaments/{tournament}/rounds"),
                    tag: format!("tournament-{tournament}-round"),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_paired(place: RoundPlace) -> TournamentPush {
        TournamentPush::RoundPaired {
            tournament: serde_json::from_str("\"00000000-0000-0000-0000-000000000007\"")
                .expect("a tournament uuid"),
            name: "Friday Night Magic".to_string(),
            round: 2,
            place,
        }
    }

    #[test]
    fn round_paired_names_table_and_seat_in_german() {
        let message =
            round_paired(RoundPlace::Table { table: 3, seat: 1 }).render(PushLanguage::De);
        assert_eq!(message.title, "Friday Night Magic");
        assert_eq!(message.body, "Runde 2 ist gepaart: Tisch 3, Sitz 1.");
    }

    #[test]
    fn round_paired_names_table_and_seat_in_english() {
        let message =
            round_paired(RoundPlace::Table { table: 4, seat: 2 }).render(PushLanguage::En);
        assert_eq!(message.body, "Round 2 is paired: table 4, seat 2.");
    }

    #[test]
    fn round_paired_tells_of_a_bye() {
        assert_eq!(
            round_paired(RoundPlace::Bye).render(PushLanguage::De).body,
            "Runde 2 ist gepaart: Du hast ein Bye."
        );
        assert_eq!(
            round_paired(RoundPlace::Bye).render(PushLanguage::En).body,
            "Round 2 is paired: you have a Bye."
        );
    }

    #[test]
    fn round_paired_opens_the_rounds_and_replaces_the_last_round_push() {
        let message = round_paired(RoundPlace::Bye).render(PushLanguage::En);
        assert_eq!(
            message.url,
            "/tournaments/00000000-0000-0000-0000-000000000007/rounds"
        );
        assert_eq!(
            message.tag,
            "tournament-00000000-0000-0000-0000-000000000007-round"
        );
    }
}
