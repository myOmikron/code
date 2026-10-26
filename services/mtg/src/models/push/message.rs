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
    /// A Participant disputed the Result of a Match
    ResultDisputed {
        /// The Tournament
        tournament: TournamentUuid,
        /// Its name
        name: String,
        /// The number of the Round the Match is played in
        round: i16,
        /// The Match's table number
        table: i16,
        /// Whether the push goes to a Participant of the Match or to an Organizer
        to: DisputeRecipient,
    },
    /// An Organizer settled the disputed Result of the Participant's Match
    ResultSettled {
        /// The Tournament
        tournament: TournamentUuid,
        /// Its name
        name: String,
        /// The number of the Round the Match is played in
        round: i16,
        /// The Match's table number
        table: i16,
    },
    /// The Participant plays in the Top cut, whose first Round just started
    ReachedTopCut {
        /// The Tournament
        tournament: TournamentUuid,
        /// Its name
        name: String,
    },
}

/// Who a push about a disputed Result goes to
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisputeRecipient {
    /// A Participant of the Match: an Organizer settles it
    Player,
    /// An Organizer: it is to settle it
    Organizer,
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
            TournamentPush::ResultDisputed {
                tournament,
                name,
                round,
                table,
                to,
            } => {
                let body = match (language, to) {
                    (PushLanguage::De, DisputeRecipient::Player) => format!(
                        "Euer Ergebnis an Tisch {table} in Runde {round} wurde angefochten. Ein Organisator legt es fest."
                    ),
                    (PushLanguage::De, DisputeRecipient::Organizer) => format!(
                        "Das Ergebnis an Tisch {table} in Runde {round} wurde angefochten. Lege es fest."
                    ),
                    (PushLanguage::En, DisputeRecipient::Player) => format!(
                        "Your result at table {table} in Round {round} was disputed. An organizer settles it."
                    ),
                    (PushLanguage::En, DisputeRecipient::Organizer) => format!(
                        "The result at table {table} in Round {round} was disputed. Settle it."
                    ),
                };
                let tournament = tournament.into_inner();
                PushMessage {
                    title: name.clone(),
                    body,
                    url: format!("/tournaments/{tournament}/rounds"),
                    tag: format!("tournament-{tournament}-round-{round}-table-{table}-disputed"),
                }
            }
            TournamentPush::ResultSettled {
                tournament,
                name,
                round,
                table,
            } => {
                let body = match language {
                    PushLanguage::De => {
                        format!("Das Ergebnis an Tisch {table} in Runde {round} wurde festgelegt.")
                    }
                    PushLanguage::En => {
                        format!("The result at table {table} in Round {round} was set.")
                    }
                };
                let tournament = tournament.into_inner();
                PushMessage {
                    title: name.clone(),
                    body,
                    url: format!("/tournaments/{tournament}/rounds"),
                    tag: format!("tournament-{tournament}-round-{round}-table-{table}-disputed"),
                }
            }
            TournamentPush::ReachedTopCut { tournament, name } => {
                let body = match language {
                    PushLanguage::De => "Du hast den Top Cut erreicht. Bleib in der Nähe!",
                    PushLanguage::En => "You reached the top cut. Stay around!",
                };
                let tournament = tournament.into_inner();
                PushMessage {
                    title: name.clone(),
                    body: body.to_string(),
                    url: format!("/tournaments/{tournament}/top-cut"),
                    tag: format!("tournament-{tournament}-top-cut"),
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

    fn result_disputed(to: DisputeRecipient) -> TournamentPush {
        TournamentPush::ResultDisputed {
            tournament: serde_json::from_str("\"00000000-0000-0000-0000-000000000007\"")
                .expect("a tournament uuid"),
            name: "Friday Night Magic".to_string(),
            round: 3,
            table: 5,
            to,
        }
    }

    #[test]
    fn a_disputed_result_tells_the_players_an_organizer_settles_it() {
        let message = result_disputed(DisputeRecipient::Player).render(PushLanguage::De);
        assert_eq!(message.title, "Friday Night Magic");
        assert_eq!(
            message.body,
            "Euer Ergebnis an Tisch 5 in Runde 3 wurde angefochten. Ein Organisator legt es fest."
        );
        assert_eq!(
            result_disputed(DisputeRecipient::Player)
                .render(PushLanguage::En)
                .body,
            "Your result at table 5 in Round 3 was disputed. An organizer settles it."
        );
    }

    #[test]
    fn a_disputed_result_asks_the_organizers_to_settle_it() {
        assert_eq!(
            result_disputed(DisputeRecipient::Organizer)
                .render(PushLanguage::De)
                .body,
            "Das Ergebnis an Tisch 5 in Runde 3 wurde angefochten. Lege es fest."
        );
        assert_eq!(
            result_disputed(DisputeRecipient::Organizer)
                .render(PushLanguage::En)
                .body,
            "The result at table 5 in Round 3 was disputed. Settle it."
        );
    }

    #[test]
    fn each_disputed_table_keeps_its_own_push() {
        let message = result_disputed(DisputeRecipient::Organizer).render(PushLanguage::En);
        assert_eq!(
            message.url,
            "/tournaments/00000000-0000-0000-0000-000000000007/rounds"
        );
        assert_eq!(
            message.tag,
            "tournament-00000000-0000-0000-0000-000000000007-round-3-table-5-disputed"
        );
    }

    fn result_settled() -> TournamentPush {
        TournamentPush::ResultSettled {
            tournament: serde_json::from_str("\"00000000-0000-0000-0000-000000000007\"")
                .expect("a tournament uuid"),
            name: "Friday Night Magic".to_string(),
            round: 3,
            table: 5,
        }
    }

    #[test]
    fn a_settled_result_names_its_table_and_replaces_the_dispute_push() {
        let message = result_settled().render(PushLanguage::De);
        assert_eq!(message.title, "Friday Night Magic");
        assert_eq!(
            message.body,
            "Das Ergebnis an Tisch 5 in Runde 3 wurde festgelegt."
        );
        assert_eq!(
            result_settled().render(PushLanguage::En).body,
            "The result at table 5 in Round 3 was set."
        );
        assert_eq!(
            message.tag,
            "tournament-00000000-0000-0000-0000-000000000007-round-3-table-5-disputed"
        );
    }

    fn reached_top_cut() -> TournamentPush {
        TournamentPush::ReachedTopCut {
            tournament: serde_json::from_str("\"00000000-0000-0000-0000-000000000007\"")
                .expect("a tournament uuid"),
            name: "Friday Night Magic".to_string(),
        }
    }

    #[test]
    fn reaching_the_top_cut_tells_to_stay_around() {
        let message = reached_top_cut().render(PushLanguage::De);
        assert_eq!(message.title, "Friday Night Magic");
        assert_eq!(
            message.body,
            "Du hast den Top Cut erreicht. Bleib in der Nähe!"
        );
        assert_eq!(
            reached_top_cut().render(PushLanguage::En).body,
            "You reached the top cut. Stay around!"
        );
        assert_eq!(
            message.url,
            "/tournaments/00000000-0000-0000-0000-000000000007/top-cut"
        );
        assert_eq!(
            message.tag,
            "tournament-00000000-0000-0000-0000-000000000007-top-cut"
        );
    }
}
