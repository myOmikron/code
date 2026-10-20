//! The Deck history: the Deck changes of one deck, newest last
//!
//! A handler that changes Deck entries or a recorded deck field takes the deck
//! with [`DeckHistory::lock`], makes its change and hands what it did to
//! [`DeckEdit::record`], all in one transaction. The lock keeps two devices
//! from interleaving their edits of one deck.
//!
//! A Deck change stores only its [`DeckDifference`], see
//! `docs/adr/0001-deck-history-only-grows.md`. The difference of the first
//! Deck change (created or introduced) is never applied backwards: the deck
//! did not exist before it.

use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::row::Row;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::deck::Deck;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckEntryKey;
use crate::models::deck::DeckUuid;
use crate::models::deck::DeckZone;
use crate::models::deck::history::db::DeckChangeInsertPatch;
use crate::models::deck::history::db::DeckChangeModel;
use crate::models::printing::db::PrintingModel;

pub(in crate::models) mod db;

/// What the owner did in a Deck change
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum DeckChangeKind {
    /// The deck was created, empty
    Created,
    /// The deck existed before Deck histories; its entries at that time
    Introduced,
    /// A plain edit of Deck entries: copies added, taken away or moved
    Edit,
}
custom_db_enum! {
    enum: DeckChangeKind,
    variants: [Created, Introduced, Edit],
    decoder: DeckChangeKindDecoder,
}

/// Wrapper for the primary key of a Deck change
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct DeckChangeUuid(Uuid);

/// What one Deck change did to its deck
///
/// Stored as json; a part added later carries `#[serde(default)]`, so the
/// Deck changes already stored still read.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeckDifference {
    /// The Deck entries it touched, at most one per key
    #[serde(default)]
    pub entries: Vec<EntryDifference>,
}

/// How many copies one Deck entry held before and after a Deck change
///
/// Zero before is an entry that came into being, zero after one that is gone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntryDifference {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// Which zone the entry sits in
    pub zone: DeckZone,
    /// Whether the copies are the foil ones
    pub foil: bool,
    /// Whether the copies are stand-ins rather than the real cards
    pub proxy: bool,
    /// How many copies the entry held before
    pub before: i32,
    /// How many copies the entry holds after
    pub after: i32,
}

impl EntryDifference {
    /// The key of the Deck entry this is about
    pub fn key(&self) -> DeckEntryKey {
        DeckEntryKey {
            printing: self.printing,
            zone: self.zone,
            foil: self.foil,
            proxy: self.proxy,
        }
    }
}

impl DeckDifference {
    /// Notes that the Deck entry `key` went from `before` copies to `after`
    ///
    /// Noting a key twice keeps the first `before` and the last `after`, so an
    /// operation touching one entry in several steps notes each step.
    pub fn entry(&mut self, key: DeckEntryKey, before: i32, after: i32) {
        match self.entries.iter_mut().find(|entry| entry.key() == key) {
            Some(entry) => entry.after = after,
            None => self.entries.push(EntryDifference {
                printing: key.printing,
                zone: key.zone,
                foil: key.foil,
                proxy: key.proxy,
                before,
                after,
            }),
        }
    }

    /// The difference without the entries that ended where they started
    fn settled(mut self) -> Self {
        self.entries.retain(|entry| entry.before != entry.after);
        self
    }

    /// Whether it changes nothing
    pub fn is_empty(&self) -> bool {
        self.entries.iter().all(|entry| entry.before == entry.after)
    }
}

/// A deck locked for an edit by its owner, until the transaction ends
///
/// Only [`DeckHistory::lock`] hands one out, so a Deck change is only ever
/// recorded under the lock.
#[derive(Debug)]
pub struct DeckEdit {
    /// The locked deck
    deck: DeckUuid,
}

impl DeckEdit {
    /// The locked deck
    pub fn deck(&self) -> DeckUuid {
        self.deck
    }

    /// Append a Deck change to the deck's Deck history
    ///
    /// A difference that changes nothing records nothing.
    #[instrument(name = "DeckEdit::record", skip(tx, difference))]
    pub async fn record(
        &self,
        tx: &mut Transaction,
        kind: DeckChangeKind,
        difference: DeckDifference,
    ) -> Result<(), rorm::Error> {
        let difference = difference.settled();
        if difference.is_empty() {
            return Ok(());
        }
        insert(tx, self.deck, kind, difference).await
    }
}

/// One Deck change, as the Deck history lists it
#[derive(Debug, Clone)]
pub struct DeckChange {
    /// Primary key
    pub uuid: DeckChangeUuid,
    /// What the owner did
    pub kind: DeckChangeKind,
    /// When it happened
    pub changed_at: OffsetDateTime,
    /// The Deck entries it touched
    pub entries: Vec<ChangedEntry>,
}

/// One Deck entry a [`DeckChange`] touched, with the card's name
#[derive(Debug, Clone)]
pub struct ChangedEntry {
    /// What happened to the entry
    pub difference: EntryDifference,
    /// The card's printed name, `None` while the catalog does not know the printing
    pub name: Option<String>,
}

/// One page of a Deck history, newest first
#[derive(Debug, Clone)]
pub struct DeckHistoryPage {
    /// The Deck changes
    pub changes: Vec<DeckChange>,
    /// The last Deck change of the page, `None` on the last page
    pub next_cursor: Option<DeckChangeUuid>,
}

/// The Deck histories of all decks
pub struct DeckHistory;

impl DeckHistory {
    /// Lock a deck for an edit, if `owner` owns it
    ///
    /// The row lock lasts until the transaction ends. It does not conflict
    /// with the key share lock inserting a Deck entry takes on its deck.
    #[instrument(name = "DeckHistory::lock", skip(tx))]
    pub async fn lock(
        tx: &mut Transaction,
        deck: DeckUuid,
        owner: AccountUuid,
    ) -> Result<DeckAccess<DeckEdit>, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                "SELECT uuid FROM deck WHERE uuid = $1 AND owner = $2 FOR NO KEY UPDATE"
                    .to_string(),
                vec![
                    Value::Uuid(deck.into_inner()),
                    Value::Uuid(owner.into_inner()),
                ],
            )
            .await?;
        Ok(if rows.is_empty() {
            DeckAccess::Denied
        } else {
            DeckAccess::Granted(DeckEdit { deck })
        })
    }

    /// Start the Deck history of a deck just created
    #[instrument(name = "DeckHistory::record_created", skip(tx, deck))]
    pub async fn record_created(tx: &mut Transaction, deck: &Deck) -> Result<(), rorm::Error> {
        insert(
            tx,
            deck.uuid,
            DeckChangeKind::Created,
            DeckDifference::default(),
        )
        .await
    }

    /// One page of a deck's Deck history, newest first
    ///
    /// `after` continues from a previous page's `next_cursor`. The caller has
    /// to have established that the account owns the deck.
    #[instrument(name = "DeckHistory::page", skip(tx))]
    pub async fn page(
        tx: &mut Transaction,
        deck: DeckUuid,
        after: Option<DeckChangeUuid>,
        limit: u32,
    ) -> Result<DeckHistoryPage, rorm::Error> {
        let mut values = vec![Value::Uuid(deck.into_inner())];
        let mut condition = "deck = $1".to_string();
        if let Some(after) = after {
            values.push(Value::Uuid(after.0));
            condition.push_str(" AND uuid < $2");
        }
        values.push(Value::I64(i64::from(limit) + 1));
        let statement = format!(
            "SELECT uuid, changed_at, kind, difference FROM deck_change \
             WHERE {condition} ORDER BY uuid DESC LIMIT ${}",
            values.len()
        );
        let rows = (&mut *tx).execute::<All>(statement, values).await?;

        let mut stored = rows
            .iter()
            .map(decode_change)
            .collect::<Result<Vec<_>, _>>()?;
        let next_cursor = if stored.len() > limit as usize {
            stored.truncate(limit as usize);
            stored.last().map(|(uuid, ..)| *uuid)
        } else {
            None
        };

        let mut printings: Vec<Uuid> = stored
            .iter()
            .flat_map(|(.., difference)| difference.entries.iter().map(|entry| entry.printing))
            .collect();
        printings.sort_unstable();
        printings.dedup();
        let names = printing_names(&mut *tx, &printings).await?;

        let changes = stored
            .into_iter()
            .map(|(uuid, changed_at, kind, difference)| DeckChange {
                uuid,
                kind,
                changed_at,
                entries: difference
                    .entries
                    .into_iter()
                    .map(|difference| ChangedEntry {
                        name: names.get(&difference.printing).cloned(),
                        difference,
                    })
                    .collect(),
            })
            .collect();
        Ok(DeckHistoryPage {
            changes,
            next_cursor,
        })
    }
}

/// Append a Deck change, timestamped now
async fn insert(
    tx: &mut Transaction,
    deck: DeckUuid,
    kind: DeckChangeKind,
    difference: DeckDifference,
) -> Result<(), rorm::Error> {
    rorm::insert(&mut *tx, DeckChangeModel)
        .return_nothing()
        .single(&DeckChangeInsertPatch {
            uuid: Uuid::now_v7(),
            deck: ForeignModelByField(deck.into_inner()),
            changed_at: OffsetDateTime::now_utc(),
            kind,
            difference: Json(difference),
        })
        .await
}

/// The printed names of the printings the catalog knows
async fn printing_names(
    tx: &mut Transaction,
    printings: &[Uuid],
) -> Result<HashMap<Uuid, String>, rorm::Error> {
    if printings.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = rorm::query(&mut *tx, (PrintingModel.id, PrintingModel.name))
        .condition(DynamicCollection::or_unchecked(
            printings
                .iter()
                .map(|printing| PrintingModel.id.equals(*printing).boxed())
                .collect(),
        ))
        .all()
        .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name)| (id, name.into_inner()))
        .collect())
}

/// A stored Deck change as [`DeckHistory::page`] reads it
type StoredChange = (
    DeckChangeUuid,
    OffsetDateTime,
    DeckChangeKind,
    DeckDifference,
);

/// Reads a Deck change from a row of [`DeckHistory::page`]
fn decode_change(row: &Row) -> Result<StoredChange, rorm::Error> {
    let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
    let kind: String = row.get("kind").map_err(decode)?;
    let difference: Vec<u8> = row.get("difference").map_err(decode)?;
    Ok((
        DeckChangeUuid(row.get("uuid").map_err(decode)?),
        row.get("changed_at").map_err(decode)?,
        DeckChangeKind::from_str(&kind)
            .unwrap_or_else(|| unreachable!("only the kind's own encoding is written")),
        serde_json::from_slice(&difference).unwrap_or_else(|error| {
            unreachable!("only a difference's own json is written: {error}")
        }),
    ))
}
