//! Pure tournament logic: pairing, standings, reporting and codes
//!
//! Everything in here is a plain function over a snapshot — no database, no
//! clock, no thread-local randomness where determinism matters. That is what
//! makes the pairing engine previewable before it is committed and the
//! standings reproducible after the fact. The database-touching side lives in
//! [`crate::models::tournament`], which depends on this module and never the
//! other way around.

pub mod code;
pub mod decklist;
pub mod pairing;
pub mod timer;
