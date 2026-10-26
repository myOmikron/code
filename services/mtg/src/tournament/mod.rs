//! The pairing and standings engine of the Tournaments
//!
//! Pure: no database, no clock, no randomness of its own. The models in
//! [`crate::models::tournament`] read the rows into one
//! [`record::TournamentRecord`] (the Ruleset, the Participants and the Rounds
//! that started with their Results) and ask:
//!
//! - [`pairing::pair_next_round`]: the next Round's Matches with their Seats
//!   and Byes, rolled from a seed the caller stores; multiplayer Rulesets go
//!   through [`multiplayer::pair_multiplayer`] with their own Match sizes;
//! - [`standings::standings`]: every Participant's Match points, Tiebreakers and place;
//! - [`rounds::suggested_swiss_rounds`]: how many Swiss Rounds to play;
//! - [`layout::check_layout`]: whether an Organizer's layout of a Round fits,
//!   and [`layout::Meetings`]: which Matches are rematches;
//! - [`ruleset`]: what a Ruleset scores, which game scores a Match takes and
//!   how many extra turns follow when time is up;
//! - [`reporting`]: who may report or dispute a Result, and what it does;
//! - [`timer`]: how long a Round has left on its round timer.
//!
//! Everything else (who met whom, who had a Bye, who sat where) the engine
//! derives from the record, so a new rule reads the same input. The rules
//! behind it are in `docs/research/tournament-pairing.md`.

pub mod layout;
pub mod matching;
pub mod multiplayer;
pub mod pairing;
pub mod record;
pub mod reporting;
pub mod rng;
pub mod rounds;
pub mod ruleset;
pub mod standings;
pub mod timer;
pub mod top_cut;
