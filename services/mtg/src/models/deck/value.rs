//! What a deck is worth: what its list costs, what is really in its box, and
//! what replacing the Proxies in the box would cost
//!
//! Read from the same two lists as the sourcing view and the Deviation, the
//! Deck entries of the zones that ask for cardboard and the stacks of the
//! Physical deck, so the List value and the Physical value of a deck that is
//! built exactly as listed come out the same.

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;

use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::sourcing::SourcedPrinting;
use crate::models::deck::sourcing::SourcedStack;
use crate::models::deck::sourcing::SourcingSlot;
use crate::models::deck::sourcing::read_filed;
use crate::models::deck::sourcing::read_slots;

/// What a deck is worth, in euro cents
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DeckValue {
    /// The List value: every copy the list asks for at its printing's price, Proxies or not
    pub list: i64,
    /// What the Physical deck holds, `None` for a deck without one
    pub physical: Option<PhysicalValue>,
}

/// What the Physical deck of a deck holds, in euro cents
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PhysicalValue {
    /// The Physical value: the real cards at their own printing's price
    pub real: i64,
    /// What buying the printings the Proxies stand for would cost
    pub proxy_replacement: i64,
    /// How many Proxies lie in it
    pub proxies: i64,
}

impl DeckValue {
    /// Read what a deck is worth
    ///
    /// The caller has to have established that the account may see the
    /// Physical deck. `collection` is the deck's Physical deck, `None` while it
    /// has none.
    #[instrument(name = "DeckValue::read", skip(tx))]
    pub async fn read(
        tx: &mut Transaction,
        deck: DeckUuid,
        collection: Option<CollectionUuid>,
    ) -> Result<DeckValue, rorm::Error> {
        let slots = read_slots(&mut *tx, deck).await?;
        let filed = match collection {
            Some(collection) => Some(read_filed(&mut *tx, collection).await?),
            None => None,
        };
        Ok(value_of(&slots, filed.as_deref()))
    }
}

/// Price the list and, if there is one, the Physical deck
///
/// A copy the catalog has no price for adds nothing, on either side.
fn value_of(slots: &[SourcingSlot], filed: Option<&[SourcedStack]>) -> DeckValue {
    let list = slots
        .iter()
        .map(|slot| {
            let finish = if slot.foil {
                CardFinish::Foil
            } else {
                CardFinish::Nonfoil
            };
            copies_cents(slot.card.as_ref(), finish, slot.quantity)
        })
        .sum();

    let physical = filed.map(|filed| {
        filed
            .iter()
            .fold(PhysicalValue::default(), |mut sum, stack| {
                let cents = copies_cents(stack.card.as_ref(), stack.finish, stack.quantity);
                if stack.proxy {
                    sum.proxy_replacement += cents;
                    sum.proxies += i64::from(stack.quantity);
                } else {
                    sum.real += cents;
                }
                sum
            })
    });

    DeckValue { list, physical }
}

/// What `quantity` copies of a printing in `finish` cost, in euro cents
///
/// A foil or etched copy is priced as a foil, falling back to the plain price,
/// the way a collection's value is.
fn copies_cents(card: Option<&SourcedPrinting>, finish: CardFinish, quantity: i32) -> i64 {
    let Some(card) = card else {
        return 0;
    };
    let unit = match finish {
        CardFinish::Nonfoil => card.price_eur,
        CardFinish::Foil | CardFinish::Etched => card.price_eur_foil.or(card.price_eur),
    };
    unit.unwrap_or(0) * i64::from(quantity)
}
