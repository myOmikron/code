//! Where a deck's list and the cardboard filed under it disagree
//!
//! The list is what the deck should be, the deck's own collection is what it
//! is, and the two drift apart the moment somebody swaps a printing, cuts a
//! card, or sleeves something up without saying so. Nothing here writes: it
//! reads both sides and names the disagreements, so the header can say that
//! there are some and the sourcing view can say which.
//!
//! The reading is strict on purpose. The two switches over the sourcing list
//! ask whether any copy would do, which is a question about shopping; this asks
//! whether the deck in the box is the deck on the list, and there a different
//! printing is a difference.

use std::collections::HashSet;

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::sourcing::SourcedPrinting;
use crate::models::deck::sourcing::SourcedStack;
use crate::models::deck::sourcing::SourcingSlot;
use crate::models::deck::sourcing::read_filed;
use crate::models::deck::sourcing::read_slots;

/// One card the list and the collection disagree about
#[derive(Debug, Clone)]
pub struct DriftRow {
    /// Scryfall's id of the printing the row is about
    pub printing: Uuid,
    /// How many copies the disagreement is about
    pub quantity: i32,
    /// Whether those copies are the foil ones
    pub foil: bool,
    /// What the catalog knows about the printing
    pub card: Option<SourcedPrinting>,
    /// The printing the list asks for instead, only in [`DeckDrift::other_printing`]
    pub wanted: Option<SourcedPrinting>,
}

/// Everything the list and the collection do not agree on
///
/// All four lists empty means the deck in the box is the deck on the list.
#[derive(Debug, Clone, Default)]
pub struct DeckDrift {
    /// Copies the list asks for that are nowhere in the deck
    pub pending: Vec<DriftRow>,
    /// Copies lying in the deck in a printing or finish the list does not ask for
    pub other_printing: Vec<DriftRow>,
    /// Copies lying in the deck whose card the list does not name at all
    pub not_in_deck: Vec<DriftRow>,
    /// Copies of a card the list wants, beyond the count it asks for
    pub surplus: Vec<DriftRow>,
}

impl DeckDrift {
    /// Whether the list and the collection say the same thing
    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
            && self.other_printing.is_empty()
            && self.not_in_deck.is_empty()
            && self.surplus.is_empty()
    }

    /// Read both sides for one deck and name the disagreements
    ///
    /// The caller has to have established that the account may administer the
    /// deck. A deck that keeps no collection drifts from nothing, so it comes
    /// back empty rather than as an error.
    #[instrument(name = "DeckDrift::read", skip(tx))]
    pub async fn read(
        tx: &mut Transaction,
        deck: DeckUuid,
        collection: Option<CollectionUuid>,
    ) -> Result<DeckDrift, rorm::Error> {
        let Some(collection) = collection else {
            return Ok(DeckDrift::default());
        };
        let slots = read_slots(&mut *tx, deck).await?;
        let filed = read_filed(&mut *tx, collection).await?;
        Ok(drift_of(&slots, &filed))
    }
}

/// Hand the filed copies out to the slots and name what is left over
///
/// Two passes, and their order is the whole point. Exact copies go first, so a
/// deck that holds the very printing it lists is never told it holds the wrong
/// one just because another slot could have taken those copies. What is still
/// open afterwards is offered the same card in another printing or finish:
/// those copies are the deck's answer to that slot, only not the answer the
/// list wrote down, and calling them missing would send somebody shopping for a
/// card lying in front of them. Whatever remains on either side is a plain gap
/// or a plain surplus.
///
/// A proxy slot asks for no cardboard — it opens at zero rather than its
/// quantity, so nothing filed for it ever reads as pending. It still keeps its
/// place in `listed`, though: a real copy of a proxied card that turns up filed
/// is a card the owner does hold, and that reads as `surplus` ("you own it —
/// file it") rather than `not_in_deck`.
pub fn drift_of(slots: &[SourcingSlot], filed: &[SourcedStack]) -> DeckDrift {
    let mut open: Vec<i32> = slots
        .iter()
        .map(|slot| if slot.proxy { 0 } else { slot.quantity.max(0) })
        .collect();
    let mut left: Vec<i32> = filed.iter().map(|stack| stack.quantity.max(0)).collect();
    let mut other_printing = Vec::new();

    for exact in [true, false] {
        for (index, slot) in slots.iter().enumerate() {
            for (stacked, stack) in filed.iter().enumerate() {
                if open[index] == 0 {
                    break;
                }
                if left[stacked] == 0 {
                    continue;
                }
                let fits = if exact {
                    stack.printing == slot.printing && is_foil(stack.finish) == slot.foil
                } else {
                    same_card(slot, stack)
                };
                if !fits {
                    continue;
                }

                let taken = open[index].min(left[stacked]);
                open[index] -= taken;
                left[stacked] -= taken;
                if !exact {
                    other_printing.push(DriftRow {
                        printing: stack.printing,
                        quantity: taken,
                        foil: is_foil(stack.finish),
                        card: stack.card.clone(),
                        wanted: slot.card.clone(),
                    });
                }
            }
        }
    }

    let listed: HashSet<Uuid> = slots.iter().map(card_key).collect();
    let mut pending = Vec::new();
    for (index, slot) in slots.iter().enumerate() {
        if open[index] > 0 {
            pending.push(DriftRow {
                printing: slot.printing,
                quantity: open[index],
                foil: slot.foil,
                card: slot.card.clone(),
                wanted: None,
            });
        }
    }

    let mut not_in_deck = Vec::new();
    let mut surplus = Vec::new();
    for (stacked, stack) in filed.iter().enumerate() {
        if left[stacked] == 0 {
            continue;
        }
        let row = DriftRow {
            printing: stack.printing,
            quantity: left[stacked],
            foil: is_foil(stack.finish),
            card: stack.card.clone(),
            wanted: None,
        };
        if listed.contains(&stack_key(stack)) {
            surplus.push(row);
        } else {
            not_in_deck.push(row);
        }
    }

    DeckDrift {
        pending,
        other_printing,
        not_in_deck,
        surplus,
    }
}

/// Whether a finish counts as the foil one
///
/// Only traditional foil does, which is the same rule the sourcing view counts
/// by. Deliberately the same and not the stricter one: two views onto the same
/// cards that answer differently about a slot would each be calling the other a
/// liar on the same screen.
fn is_foil(finish: CardFinish) -> bool {
    matches!(finish, CardFinish::Foil)
}

/// Whether a stack holds the card a slot asks for, whatever printing it is
fn same_card(slot: &SourcingSlot, stack: &SourcedStack) -> bool {
    match (
        slot.card.as_ref().and_then(|card| card.oracle_id),
        stack.card.as_ref().and_then(|card| card.oracle_id),
    ) {
        (Some(wanted), Some(held)) => wanted == held,
        // Without a catalog entry there is nothing to be wider about: the
        // printing id is all either side has.
        _ => slot.printing == stack.printing,
    }
}

/// What makes two rows the same card, the printing id standing in for a card
/// the catalog has not caught up with
fn card_key(slot: &SourcingSlot) -> Uuid {
    slot.card
        .as_ref()
        .and_then(|card| card.oracle_id)
        .unwrap_or(slot.printing)
}

/// The same, read off a stack
fn stack_key(stack: &SourcedStack) -> Uuid {
    stack
        .card
        .as_ref()
        .and_then(|card| card.oracle_id)
        .unwrap_or(stack.printing)
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::models::card_attributes::CardCondition;
    use crate::models::collection::CollectionEntryUuid;
    use crate::models::deck::DeckCardUuid;
    use crate::models::deck::DeckZone;

    /// A catalog entry for one printing of one card
    fn printing(oracle: Uuid, set: &str) -> SourcedPrinting {
        SourcedPrinting {
            name: "Sol Ring".to_owned(),
            oracle_id: Some(oracle),
            set_code: set.to_owned(),
            set_name: set.to_owned(),
            collector_number: "1".to_owned(),
            lang: "en".to_owned(),
            cardmarket_id: None,
            image_small: None,
            image_normal: None,
            price_eur: None,
            price_eur_foil: None,
        }
    }

    /// One slot of the list
    fn slot(id: Uuid, oracle: Uuid, quantity: i32, foil: bool) -> SourcingSlot {
        SourcingSlot {
            uuid: DeckCardUuid::from_uuid(Uuid::now_v7()),
            printing: id,
            quantity,
            zone: DeckZone::Main,
            foil,
            proxy: false,
            card: Some(printing(oracle, "LTR")),
        }
    }

    /// One proxy slot of the list — asks for no cardboard
    fn proxy_slot(id: Uuid, oracle: Uuid, quantity: i32) -> SourcingSlot {
        SourcingSlot {
            proxy: true,
            ..slot(id, oracle, quantity, false)
        }
    }

    /// One stack lying in the deck
    fn stack(id: Uuid, oracle: Uuid, quantity: i32, finish: CardFinish) -> SourcedStack {
        SourcedStack {
            uuid: CollectionEntryUuid::from_uuid(Uuid::now_v7()),
            printing: id,
            quantity,
            condition: CardCondition::NearMint,
            finish,
            origin: None,
            origin_name: None,
            origin_color: None,
            origin_icon: None,
            card: Some(printing(oracle, "M10")),
        }
    }

    #[test]
    fn a_deck_holding_what_it_lists_does_not_drift() {
        let oracle = Uuid::now_v7();
        let print = Uuid::now_v7();
        let drift = drift_of(
            &[slot(print, oracle, 2, false)],
            &[stack(print, oracle, 2, CardFinish::Nonfoil)],
        );
        assert!(drift.is_empty());
    }

    #[test]
    fn copies_nobody_filed_are_pending() {
        let oracle = Uuid::now_v7();
        let print = Uuid::now_v7();
        let drift = drift_of(
            &[slot(print, oracle, 3, false)],
            &[stack(print, oracle, 1, CardFinish::Nonfoil)],
        );
        assert_eq!(drift.pending.len(), 1);
        assert_eq!(drift.pending[0].quantity, 2);
        assert!(drift.other_printing.is_empty());
    }

    #[test]
    fn another_print_of_the_same_card_is_named_rather_than_missed() {
        let oracle = Uuid::now_v7();
        let listed = Uuid::now_v7();
        let held = Uuid::now_v7();
        let drift = drift_of(
            &[slot(listed, oracle, 1, false)],
            &[stack(held, oracle, 1, CardFinish::Nonfoil)],
        );
        assert!(drift.pending.is_empty());
        assert_eq!(drift.other_printing.len(), 1);
        assert_eq!(drift.other_printing[0].printing, held);
        assert_eq!(
            drift.other_printing[0]
                .wanted
                .as_ref()
                .map(|card| card.set_code.clone()),
            Some("LTR".to_owned()),
        );
    }

    #[test]
    fn the_exact_print_is_handed_out_before_any_other() {
        let oracle = Uuid::now_v7();
        let listed = Uuid::now_v7();
        let held = Uuid::now_v7();
        let drift = drift_of(
            &[slot(listed, oracle, 1, false)],
            &[
                stack(held, oracle, 1, CardFinish::Nonfoil),
                stack(listed, oracle, 1, CardFinish::Nonfoil),
            ],
        );
        assert!(drift.pending.is_empty());
        assert!(drift.other_printing.is_empty());
        assert_eq!(drift.surplus.len(), 1);
        assert_eq!(drift.surplus[0].printing, held);
    }

    #[test]
    fn a_foil_slot_is_not_filled_by_the_plain_printing() {
        let oracle = Uuid::now_v7();
        let print = Uuid::now_v7();
        let drift = drift_of(
            &[slot(print, oracle, 1, true)],
            &[stack(print, oracle, 1, CardFinish::Nonfoil)],
        );
        assert!(drift.pending.is_empty());
        assert_eq!(drift.other_printing.len(), 1);
        assert!(!drift.other_printing[0].foil);
    }

    #[test]
    fn cards_the_list_never_names_are_their_own_answer() {
        let listed = Uuid::now_v7();
        let drift = drift_of(
            &[slot(listed, Uuid::now_v7(), 1, false)],
            &[
                stack(Uuid::now_v7(), Uuid::now_v7(), 1, CardFinish::Nonfoil),
                stack(Uuid::now_v7(), Uuid::now_v7(), 2, CardFinish::Nonfoil),
            ],
        );
        assert_eq!(drift.not_in_deck.len(), 2);
        assert_eq!(drift.pending.len(), 1);
    }

    #[test]
    fn more_copies_than_the_list_asks_for_are_surplus() {
        let oracle = Uuid::now_v7();
        let print = Uuid::now_v7();
        let drift = drift_of(
            &[slot(print, oracle, 1, false)],
            &[stack(print, oracle, 3, CardFinish::Nonfoil)],
        );
        assert_eq!(drift.surplus.len(), 1);
        assert_eq!(drift.surplus[0].quantity, 2);
        assert!(drift.pending.is_empty());
    }

    #[test]
    fn a_proxy_slot_with_nothing_filed_does_not_drift() {
        let oracle = Uuid::now_v7();
        let print = Uuid::now_v7();
        let drift = drift_of(&[proxy_slot(print, oracle, 2)], &[]);
        assert!(drift.is_empty());
    }

    #[test]
    fn a_real_copy_of_a_proxied_card_is_surplus_not_pending() {
        let oracle = Uuid::now_v7();
        let print = Uuid::now_v7();
        let drift = drift_of(
            &[proxy_slot(print, oracle, 2)],
            &[stack(print, oracle, 1, CardFinish::Nonfoil)],
        );
        assert!(drift.pending.is_empty());
        assert_eq!(drift.surplus.len(), 1);
        assert_eq!(drift.surplus[0].quantity, 1);
    }
}
