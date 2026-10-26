//! The pairing and standings engine of the Tournaments
//!
//! Pure: no database, no clock, no randomness of its own. The models in
//! [`crate::models::tournament`] read the rows into one
//! [`record::TournamentRecord`] (the Ruleset, the Participants and the Rounds
//! that started with their Results) and ask:
//!
//! - [`pairing::pair_next_round`]: the next Round's Matches with their Seats
//!   and Byes, rolled from a seed the caller stores;
//! - [`standings::standings`]: every Participant's Match points, Tiebreakers and place;
//! - [`rounds::suggested_swiss_rounds`]: how many Swiss Rounds to play;
//! - [`ruleset`]: what a Ruleset scores and which game scores a Match takes;
//! - [`reporting`]: who may report or dispute a Result, and what it does.
//!
//! Everything else (who met whom, who had a Bye, who sat where) the engine
//! derives from the record, so a new rule reads the same input. The rules
//! behind it are in `docs/research/tournament-pairing.md`.

pub mod matching;
pub mod pairing;
pub mod record;
pub mod reporting;
pub mod rng;
pub mod rounds;
pub mod ruleset;
pub mod standings;
