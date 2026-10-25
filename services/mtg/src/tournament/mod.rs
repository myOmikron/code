//! The pairing and standings engine of the Tournaments
//!
//! Pure: no database, no clock, no randomness of its own. Given a Ruleset, the
//! Participants and the Results so far, it answers what a Tournament asks of
//! its rules: which Table sizes a Ruleset is played at, and later the next
//! Round's Matches, the standings and the Top cut seeding. The models in
//! [`crate::models::tournament`] read the rows, call in here and store what
//! comes back. The rules behind it are in `docs/research/tournament-pairing.md`.

pub mod ruleset;
