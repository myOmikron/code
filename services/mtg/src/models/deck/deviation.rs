//! Where a deck's list and its Physical deck disagree: the Deviation
//!
//! The list is what the deck should be, the Physical deck is what is in the
//! box, and the two drift apart the moment somebody swaps a printing, cuts a
//! card, or sleeves something up without saying so. Nothing here writes: it
//! reads both sides and says, per Deck entry, what the box holds for it, so the
//! card list can annotate each line and the header can count.
//!
//! The reading is strict on purpose. The two switches over the sourcing list
//! ask whether any copy would do, which is a question about shopping; this asks
//! whether the deck in the box is the deck on the list, and there a different
//! printing or finish is a difference. A Proxy is cardboard like any other
//! here: it fulfils a line of its own printing and finish, and one of another
//! printing is a Deviation like a real card of another printing.

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionUuid;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::sourcing::SourcedPrinting;
use crate::models::deck::sourcing::SourcedStack;
use crate::models::deck::sourcing::SourcingSlot;
use crate::models::deck::sourcing::read_filed;
use crate::models::deck::sourcing::read_slots;

/// Copies of one printing and finish lying in the Physical deck
#[derive(Debug, Clone)]
pub struct DeviationCopies {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies
    pub quantity: i32,
    /// Their finish
    pub finish: CardFinish,
    /// Whether they are Proxies
    pub proxy: bool,
    /// What the catalog knows about the printing
    pub card: Option<SourcedPrinting>,
}

/// What the Physical deck holds for one Deck entry
#[derive(Debug, Clone)]
pub struct LineDeviation {
    /// The Deck entry
    pub entry: DeckCardUuid,
    /// Copies of the listed printing and finish in the deck, up to the count
    /// the entry asks for, Proxies included
    pub in_deck: i32,
    /// How many of [`LineDeviation::in_deck`] are Proxies
    pub proxies: i32,
    /// Copies of the same card in another printing or finish, standing in for
    /// copies the entry still lacks
    pub other_printing: Vec<DeviationCopies>,
    /// Copies the entry asks for that nothing in the deck stands in for
    pub missing: i32,
    /// Copies of the entry's card beyond what the list asks for
    pub surplus: i32,
}

impl LineDeviation {
    /// Whether the box holds exactly what this line asks for
    pub fn is_empty(&self) -> bool {
        self.other_printing.is_empty() && self.missing == 0 && self.surplus == 0
    }
}

/// Everything the list and the Physical deck say about each other
#[derive(Debug, Clone, Default)]
pub struct DeckDeviation {
    /// One per Deck entry of a counted zone, in the order the list has them
    pub lines: Vec<LineDeviation>,
    /// Copies in the deck whose card no counted line names
    pub not_on_list: Vec<DeviationCopies>,
}

impl DeckDeviation {
    /// Whether the deck in the box is the deck on the list
    pub fn is_empty(&self) -> bool {
        self.not_on_list.is_empty() && self.lines.iter().all(LineDeviation::is_empty)
    }

    /// Read both sides for one deck
    ///
    /// The caller has to have established that the account may see the
    /// Physical deck. A deck without one deviates from nothing, so it comes
    /// back as `None` rather than as an error.
    #[instrument(name = "DeckDeviation::read", skip(tx))]
    pub async fn read(
        tx: &mut Transaction,
        deck: DeckUuid,
        collection: Option<CollectionUuid>,
    ) -> Result<Option<DeckDeviation>, rorm::Error> {
        let Some(collection) = collection else {
            return Ok(None);
        };
        let slots = read_slots(&mut *tx, deck).await?;
        let filed = read_filed(&mut *tx, collection).await?;
        Ok(Some(deviation_of(&slots, &filed)))
    }
}

/// Hand the filed copies out to the lines and name what is left over
///
/// Two passes, and their order is the whole point. Exact copies go first, so a
/// deck that holds the very printing it lists is never told it holds the wrong
/// one just because another line could have taken those copies; within them
/// real cards go before Proxies, so a Proxy beside the real card it stands for
/// is the one that reads as surplus. What is still open afterwards is offered
/// the same card in another printing or finish: those copies are the deck's
/// answer to that line, only not the answer the list wrote down, and calling
/// them missing would send somebody shopping for a card lying in front of them.
/// Whatever remains on either side is a plain gap or a plain surplus; a surplus
/// is put on the line of its printing and finish if there is one, else on the
/// first line of its card.
pub fn deviation_of(slots: &[SourcingSlot], filed: &[SourcedStack]) -> DeckDeviation {
    let mut open: Vec<i32> = slots.iter().map(|slot| slot.quantity.max(0)).collect();
    let mut left: Vec<i32> = filed.iter().map(|stack| stack.quantity.max(0)).collect();
    let mut lines: Vec<LineDeviation> = slots
        .iter()
        .map(|slot| LineDeviation {
            entry: slot.uuid,
            in_deck: 0,
            proxies: 0,
            other_printing: Vec::new(),
            missing: 0,
            surplus: 0,
        })
        .collect();
    let order: Vec<usize> = (0..filed.len())
        .filter(|&stacked| !filed[stacked].proxy)
        .chain((0..filed.len()).filter(|&stacked| filed[stacked].proxy))
        .collect();

    for exact in [true, false] {
        for (index, slot) in slots.iter().enumerate() {
            for &stacked in &order {
                if open[index] == 0 {
                    break;
                }
                let stack = &filed[stacked];
                if left[stacked] == 0 {
                    continue;
                }
                let fits = if exact {
                    is_exact(slot, stack)
                } else {
                    same_card(slot, stack)
                };
                if !fits {
                    continue;
                }

                let taken = open[index].min(left[stacked]);
                open[index] -= taken;
                left[stacked] -= taken;
                let line = &mut lines[index];
                if exact {
                    line.in_deck += taken;
                    if stack.proxy {
                        line.proxies += taken;
                    }
                } else {
                    add_copies(&mut line.other_printing, stack, taken);
                }
            }
        }
    }

    for (line, open) in lines.iter_mut().zip(&open) {
        line.missing = *open;
    }

    let mut not_on_list = Vec::new();
    for &stacked in &order {
        if left[stacked] == 0 {
            continue;
        }
        let stack = &filed[stacked];
        let owner = slots
            .iter()
            .position(|slot| is_exact(slot, stack))
            .or_else(|| slots.iter().position(|slot| same_card(slot, stack)));
        match owner {
            Some(index) => lines[index].surplus += left[stacked],
            None => add_copies(&mut not_on_list, stack, left[stacked]),
        }
    }

    DeckDeviation { lines, not_on_list }
}

/// Adds copies of a stack to a list, onto copies of the same printing, finish
/// and kind if it already names them
///
/// Stacks are split by condition, which the Deviation does not care about.
fn add_copies(copies: &mut Vec<DeviationCopies>, stack: &SourcedStack, quantity: i32) {
    if let Some(known) = copies.iter_mut().find(|known| {
        known.printing == stack.printing
            && known.finish == stack.finish
            && known.proxy == stack.proxy
    }) {
        known.quantity += quantity;
        return;
    }
    copies.push(DeviationCopies {
        printing: stack.printing,
        quantity,
        finish: stack.finish,
        proxy: stack.proxy,
        card: stack.card.clone(),
    });
}

/// Whether a stack is the printing and finish a line asks for
///
/// The finish is compared strictly, the same way recording bought copies
/// counts what a line holds: an etched copy is neither the plain nor the foil
/// one.
fn is_exact(slot: &SourcingSlot, stack: &SourcedStack) -> bool {
    stack.printing == slot.printing && stack.finish == CardFinish::of_deck_entry(slot.foil)
}

/// Whether a stack holds the card a line asks for, whatever printing it is
///
/// Without a catalog entry on either side the printing id is all there is.
fn same_card(slot: &SourcingSlot, stack: &SourcedStack) -> bool {
    match (
        slot.card.as_ref().and_then(|card| card.oracle_id),
        stack.card.as_ref().and_then(|card| card.oracle_id),
    ) {
        (Some(wanted), Some(held)) => wanted == held,
        _ => slot.printing == stack.printing,
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::models::card_attributes::CardCondition;
    use crate::models::collection::CollectionEntryUuid;
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

    /// One line of the list
    fn slot(id: Uuid, oracle: Uuid, quantity: i32, foil: bool) -> SourcingSlot {
        SourcingSlot {
            uuid: DeckCardUuid::from_uuid(Uuid::now_v7()),
            printing: id,
            quantity,
            zone: DeckZone::Main,
            foil,
            card: Some(printing(oracle, "LTR")),
        }
    }

    /// One stack of real cards lying in the deck
    fn stack(id: Uuid, oracle: Uuid, quantity: i32, finish: CardFinish) -> SourcedStack {
        SourcedStack {
            uuid: CollectionEntryUuid::from_uuid(Uuid::now_v7()),
            printing: id,
            quantity,
            condition: CardCondition::NearMint,
            finish,
            origin: None,
            proxy: false,
            origin_name: None,
            origin_color: None,
            origin_icon: None,
            card: Some(printing(oracle, "M10")),
        }
    }

    /// One stack of Proxies lying in the deck
    fn proxies(id: Uuid, oracle: Uuid, quantity: i32) -> SourcedStack {
        SourcedStack {
            proxy: true,
            ..stack(id, oracle, quantity, CardFinish::Nonfoil)
        }
    }

    #[test]
    fn the_exact_print_is_handed_out_before_any_other() {
        let oracle = Uuid::now_v7();
        let listed = Uuid::now_v7();
        let held = Uuid::now_v7();
        let deviation = deviation_of(
            &[slot(listed, oracle, 1, false)],
            &[
                stack(held, oracle, 1, CardFinish::Nonfoil),
                stack(listed, oracle, 1, CardFinish::Nonfoil),
            ],
        );
        let line = &deviation.lines[0];
        assert_eq!(line.in_deck, 1);
        assert!(line.other_printing.is_empty());
        assert_eq!(line.surplus, 1);
    }

    #[test]
    fn a_real_card_fulfils_a_line_before_a_proxy_beside_it() {
        let oracle = Uuid::now_v7();
        let print = Uuid::now_v7();
        let deviation = deviation_of(
            &[slot(print, oracle, 1, false)],
            &[
                proxies(print, oracle, 1),
                stack(print, oracle, 1, CardFinish::Nonfoil),
            ],
        );
        let line = &deviation.lines[0];
        assert_eq!(line.in_deck, 1);
        assert_eq!(line.proxies, 0);
        assert_eq!(line.surplus, 1);
    }

    #[test]
    fn a_surplus_goes_on_the_line_of_its_own_printing() {
        let oracle = Uuid::now_v7();
        let first = Uuid::now_v7();
        let second = Uuid::now_v7();
        let deviation = deviation_of(
            &[
                slot(first, oracle, 1, false),
                slot(second, oracle, 1, false),
            ],
            &[
                stack(first, oracle, 1, CardFinish::Nonfoil),
                stack(second, oracle, 2, CardFinish::Nonfoil),
            ],
        );
        assert_eq!(deviation.lines[0].surplus, 0);
        assert_eq!(deviation.lines[1].surplus, 1);
    }

    #[test]
    fn copies_split_by_condition_are_named_once() {
        let print = Uuid::now_v7();
        let stray = Uuid::now_v7();
        let oracle = Uuid::now_v7();
        let mut played = stack(stray, oracle, 1, CardFinish::Nonfoil);
        played.condition = CardCondition::Played;
        let deviation = deviation_of(
            &[slot(print, Uuid::now_v7(), 1, false)],
            &[stack(stray, oracle, 2, CardFinish::Nonfoil), played],
        );
        assert_eq!(deviation.not_on_list.len(), 1);
        assert_eq!(deviation.not_on_list[0].quantity, 3);
    }
}
