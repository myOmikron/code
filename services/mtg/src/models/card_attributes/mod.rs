//! Attributes describing a physical card, independent of any collection
//!
//! These belong to the card in hand, not to the group it is filed under: the
//! same enums describe a card that is being traded, scanned or sleeved into a
//! deck. They are stored as plain text via `custom_db_enum!` rather than
//! through a lookup table like [`crate::models::visibility::Visibility`] —
//! both value sets are fixed externally (by Scryfall and by Cardmarket), so
//! they cannot grow without a deploy anyway.

pub mod condition;
pub mod finish;

pub use condition::CardCondition;
pub use finish::CardFinish;
