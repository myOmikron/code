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
//! did not exist before it. It holds the deck's state instead: its Deck
//! entries from zero, and every recorded deck field with the same value
//! before and after.

use std::collections::HashMap;
use std::mem::Discriminant;
use std::mem::discriminant;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::Duration;
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
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::deck::Deck;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckCard;
use crate::models::deck::DeckCardInsert;
use crate::models::deck::DeckEntryKey;
use crate::models::deck::DeckUuid;
use crate::models::deck::DeckZone;
use crate::models::deck::db::DeckCardModel;
use crate::models::deck::db::DeckModel;
use crate::models::deck::history::db::DeckChangeInsertPatch;
use crate::models::deck::history::db::DeckChangeModel;
use crate::models::deck::history::db::DeckChangeReferringInsertPatch;
use crate::models::printing::db::PrintingModel;

pub(in crate::models) mod db;

/// The longest name of a Deck checkpoint, in bytes
pub const CHECKPOINT_LENGTH: usize = 64;

/// What the owner did in a Deck change
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum DeckChangeKind {
    /// The deck was created, empty
    Created,
    /// The deck existed before Deck histories; its entries at that time
    Introduced,
    /// A plain edit of Deck entries: copies added or taken away
    Edit,
    /// A Deck entry moved to another zone
    Move,
    /// A Deck entry switched to another printing, finish or proxy status
    Switch,
    /// Copies of a Deck entry given up for another card in the same zone
    Swap,
    /// A decklist added to the deck
    Import,
    /// A decklist that replaced the deck's Deck entries
    Replace,
    /// The advisor's suggestions added to the deck
    Fill,
    /// A Deck entry made to say what was sourced for it: another printing or
    /// finish, or no longer a proxy
    Sourcing,
    /// Deck fields changed: name, description, format, colors, bracket,
    /// rule-zero exceptions or size
    Settings,
    /// An earlier Deck change taken back
    Undo,
    /// An undone Deck change applied again
    Redo,
    /// The deck brought back to an earlier point of its Deck history
    Reset,
}

impl DeckChangeKind {
    /// Whether it is a plain edit, which a quick successive one may join
    fn is_plain_edit(self) -> bool {
        matches!(self, Self::Edit | Self::Settings)
    }
}

custom_db_enum! {
    enum: DeckChangeKind,
    variants: [Created, Introduced, Edit, Move, Switch, Swap, Import, Replace, Fill, Sourcing, Settings, Undo, Redo, Reset],
    decoder: DeckChangeKindDecoder,
}

/// How long a plain edit stays open for a quick successive one to join it
///
/// Counted from when the joined Deck change started: a joining edit neither
/// restarts it nor moves the Deck change's time.
const COALESCING_WINDOW: Duration = Duration::seconds(60);

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
    /// The deck fields it changed, at most one per field
    #[serde(default)]
    pub fields: Vec<FieldDifference>,
}

/// The value one deck field held before and after a Deck change
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "field")]
pub enum FieldDifference {
    /// The deck's name
    Name {
        /// The name before
        before: MaxStr<255>,
        /// The name after
        after: MaxStr<255>,
    },
    /// The deck's description
    Description {
        /// The description before, `None` for none
        before: Option<MaxStr<1024>>,
        /// The description after, `None` for none
        after: Option<MaxStr<1024>>,
    },
    /// The format the deck is built for
    Format {
        /// The format before
        before: MaxStr<32>,
        /// The format after
        after: MaxStr<32>,
    },
    /// The colours the deck may play
    Colors {
        /// The colours before, `None` for whatever the commander allows
        before: Option<MaxStr<8>>,
        /// The colours after, `None` for whatever the commander allows
        after: Option<MaxStr<8>>,
    },
    /// The Commander bracket the deck is built to
    Bracket {
        /// The bracket before, `None` when unset
        before: Option<i16>,
        /// The bracket after, `None` when unset
        after: Option<i16>,
    },
    /// Whether the table agreed to more commanders than the format allows
    AllowExtraCommanders {
        /// The agreement before
        before: bool,
        /// The agreement after
        after: bool,
    },
    /// Whether the table agreed to more copies of a card than the format allows
    AllowDuplicates {
        /// The agreement before
        before: bool,
        /// The agreement after
        after: bool,
    },
    /// Whether the table agreed to cards the format bans
    AllowBanned {
        /// The agreement before
        before: bool,
        /// The agreement after
        after: bool,
    },
    /// How many cards the deck is built to
    DeckSize {
        /// The size before, `None` for the format's rule
        before: Option<i16>,
        /// The size after, `None` for the format's rule
        after: Option<i16>,
    },
}

/// The recorded deck fields of a deck at one point
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckSettings {
    /// The deck's name
    pub name: MaxStr<255>,
    /// The deck's description, `None` for none
    pub description: Option<MaxStr<1024>>,
    /// The format the deck is built for
    pub format: MaxStr<32>,
    /// The colours the deck may play, `None` for whatever the commander allows
    pub allowed_color_identity: Option<MaxStr<8>>,
    /// The Commander bracket the deck is built to, `None` when unset
    pub bracket: Option<i16>,
    /// Whether the table agreed to more commanders than the format allows
    pub allow_extra_commanders: bool,
    /// Whether the table agreed to more copies of a card than the format allows
    pub allow_duplicates: bool,
    /// Whether the table agreed to cards the format bans
    pub allow_banned: bool,
    /// How many cards the deck is built to, `None` for the format's rule
    pub deck_size: Option<i16>,
}

impl From<&Deck> for DeckSettings {
    fn from(deck: &Deck) -> Self {
        Self {
            name: deck.name.clone(),
            description: deck.description.clone(),
            format: deck.format.clone(),
            allowed_color_identity: deck.allowed_color_identity.clone(),
            bracket: deck.bracket,
            allow_extra_commanders: deck.allow_extra_commanders,
            allow_duplicates: deck.allow_duplicates,
            allow_banned: deck.allow_banned,
            deck_size: deck.deck_size,
        }
    }
}

impl DeckSettings {
    /// Takes the field back to the value it held before a Deck change
    fn take_before(&mut self, field: &FieldDifference) {
        match field.clone() {
            FieldDifference::Name { before, .. } => self.name = before,
            FieldDifference::Description { before, .. } => self.description = before,
            FieldDifference::Format { before, .. } => self.format = before,
            FieldDifference::Colors { before, .. } => self.allowed_color_identity = before,
            FieldDifference::Bracket { before, .. } => self.bracket = before,
            FieldDifference::AllowExtraCommanders { before, .. } => {
                self.allow_extra_commanders = before
            }
            FieldDifference::AllowDuplicates { before, .. } => self.allow_duplicates = before,
            FieldDifference::AllowBanned { before, .. } => self.allow_banned = before,
            FieldDifference::DeckSize { before, .. } => self.deck_size = before,
        }
    }
}

impl FieldDifference {
    /// Every recorded deck field, from one state of a deck to another
    fn all(before: &DeckSettings, after: &DeckSettings) -> Vec<Self> {
        vec![
            Self::Name {
                before: before.name.clone(),
                after: after.name.clone(),
            },
            Self::Description {
                before: before.description.clone(),
                after: after.description.clone(),
            },
            Self::Format {
                before: before.format.clone(),
                after: after.format.clone(),
            },
            Self::Colors {
                before: before.allowed_color_identity.clone(),
                after: after.allowed_color_identity.clone(),
            },
            Self::Bracket {
                before: before.bracket,
                after: after.bracket,
            },
            Self::AllowExtraCommanders {
                before: before.allow_extra_commanders,
                after: after.allow_extra_commanders,
            },
            Self::AllowDuplicates {
                before: before.allow_duplicates,
                after: after.allow_duplicates,
            },
            Self::AllowBanned {
                before: before.allow_banned,
                after: after.allow_banned,
            },
            Self::DeckSize {
                before: before.deck_size,
                after: after.deck_size,
            },
        ]
    }

    /// Takes over the value a later change of the same field left it at
    ///
    /// A different field leaves it as it is.
    fn take_after(&mut self, later: Self) {
        match (self, later) {
            (Self::Name { after, .. }, Self::Name { after: later, .. }) => *after = later,
            (Self::Description { after, .. }, Self::Description { after: later, .. }) => {
                *after = later
            }
            (Self::Format { after, .. }, Self::Format { after: later, .. }) => *after = later,
            (Self::Colors { after, .. }, Self::Colors { after: later, .. }) => *after = later,
            (Self::Bracket { after, .. }, Self::Bracket { after: later, .. })
            | (Self::DeckSize { after, .. }, Self::DeckSize { after: later, .. }) => *after = later,
            (
                Self::AllowExtraCommanders { after, .. },
                Self::AllowExtraCommanders { after: later, .. },
            )
            | (Self::AllowDuplicates { after, .. }, Self::AllowDuplicates { after: later, .. })
            | (Self::AllowBanned { after, .. }, Self::AllowBanned { after: later, .. }) => {
                *after = later
            }
            _ => {}
        }
    }

    /// The same field going the other way
    fn inverse(&self) -> Self {
        match self.clone() {
            Self::Name { before, after } => Self::Name {
                before: after,
                after: before,
            },
            Self::Description { before, after } => Self::Description {
                before: after,
                after: before,
            },
            Self::Format { before, after } => Self::Format {
                before: after,
                after: before,
            },
            Self::Colors { before, after } => Self::Colors {
                before: after,
                after: before,
            },
            Self::Bracket { before, after } => Self::Bracket {
                before: after,
                after: before,
            },
            Self::AllowExtraCommanders { before, after } => Self::AllowExtraCommanders {
                before: after,
                after: before,
            },
            Self::AllowDuplicates { before, after } => Self::AllowDuplicates {
                before: after,
                after: before,
            },
            Self::AllowBanned { before, after } => Self::AllowBanned {
                before: after,
                after: before,
            },
            Self::DeckSize { before, after } => Self::DeckSize {
                before: after,
                after: before,
            },
        }
    }

    /// Whether the field ended where it started
    fn is_settled(&self) -> bool {
        match self {
            Self::Name { before, after } => before == after,
            Self::Description { before, after } => before == after,
            Self::Format { before, after } => before == after,
            Self::Colors { before, after } => before == after,
            Self::Bracket { before, after } | Self::DeckSize { before, after } => before == after,
            Self::AllowExtraCommanders { before, after }
            | Self::AllowDuplicates { before, after }
            | Self::AllowBanned { before, after } => before == after,
        }
    }
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

    /// Notes a change of one deck field
    ///
    /// Noting a field twice keeps the first value before and the last after.
    pub fn field(&mut self, field: FieldDifference) {
        match self
            .fields
            .iter_mut()
            .find(|noted| discriminant(*noted) == discriminant(&field))
        {
            Some(noted) => noted.take_after(field),
            None => self.fields.push(field),
        }
    }

    /// The one Deck entry or deck field it touches, `None` for more or less
    fn subject(&self) -> Option<Subject> {
        match (self.entries.as_slice(), self.fields.as_slice()) {
            ([entry], []) => Some(Subject::Entry(entry.key())),
            ([], [field]) => Some(Subject::Field(discriminant(field))),
            _ => None,
        }
    }

    /// Whether a later difference touches the very Deck entry or deck field
    /// this one touches, and nothing else
    fn touches_the_same(&self, later: &Self) -> bool {
        self.subject()
            .is_some_and(|subject| later.subject() == Some(subject))
    }

    /// This difference followed by a later one, as one
    fn then(mut self, later: Self) -> Self {
        for entry in later.entries {
            self.entry(entry.key(), entry.before, entry.after);
        }
        for field in later.fields {
            self.field(field);
        }
        self
    }

    /// The difference between two lists of a deck's Deck entries
    ///
    /// For an operation rewriting many entries at once, like an import: read
    /// the entries before and after it and hand both over.
    pub fn between(before: &[DeckCard], after: &[DeckCard]) -> Self {
        let mut quantities: HashMap<DeckEntryKey, (i32, i32)> = HashMap::new();
        for entry in before {
            quantities.entry(entry.key()).or_default().0 += entry.quantity;
        }
        for entry in after {
            quantities.entry(entry.key()).or_default().1 += entry.quantity;
        }
        let mut entries: Vec<EntryDifference> = quantities
            .into_iter()
            .map(|(key, (before, after))| EntryDifference {
                printing: key.printing,
                zone: key.zone,
                foil: key.foil,
                proxy: key.proxy,
                before,
                after,
            })
            .collect();
        entries.sort_by_key(|entry| (entry.printing, entry.zone.as_str(), entry.foil, entry.proxy));
        Self {
            entries,
            fields: Vec::new(),
        }
    }

    /// Notes a change of one Deck entry by [`DeckCard::update`]
    ///
    /// `entry` is the Deck entry before, `quantity` how many copies it holds
    /// after the change and `updated` what the update answered: `None` for a
    /// removed entry, else the entry the copies sit in now, which may be an
    /// alike one they merged into.
    pub fn updated(&mut self, entry: &DeckCard, quantity: i32, updated: Option<&DeckCard>) {
        match updated {
            None => self.entry(entry.key(), entry.quantity, 0),
            Some(updated) if updated.key() == entry.key() => {
                self.entry(entry.key(), entry.quantity, updated.quantity)
            }
            Some(updated) => {
                self.entry(entry.key(), entry.quantity, 0);
                self.entry(updated.key(), updated.quantity - quantity, updated.quantity);
            }
        }
    }

    /// A deck's state, as its first Deck change holds it
    ///
    /// `entries` are the deck's Deck entries, all from zero; every recorded
    /// field is there with its value before and after.
    fn state(deck: &Deck, entries: Self) -> Self {
        let settings = DeckSettings::from(deck);
        Self {
            entries: entries.entries,
            fields: FieldDifference::all(&settings, &settings),
        }
    }

    /// The difference between two states of a deck's recorded fields
    ///
    /// Read the deck before and after an operation changing its settings and
    /// hand both over; the fields that did not change drop out on record.
    pub fn settings(before: &Deck, after: &Deck) -> Self {
        Self {
            entries: Vec::new(),
            fields: FieldDifference::all(&before.into(), &after.into()),
        }
    }

    /// The difference without the entries and fields that ended where they started
    fn settled(mut self) -> Self {
        self.entries.retain(|entry| entry.before != entry.after);
        self.fields.retain(|field| !field.is_settled());
        self
    }

    /// The difference that takes this one back: every before and after swapped
    pub fn inverse(&self) -> Self {
        Self {
            entries: self
                .entries
                .iter()
                .map(|entry| EntryDifference {
                    before: entry.after,
                    after: entry.before,
                    ..entry.clone()
                })
                .collect(),
            fields: self.fields.iter().map(FieldDifference::inverse).collect(),
        }
    }

    /// Whether it changes nothing
    pub fn is_empty(&self) -> bool {
        self.entries.iter().all(|entry| entry.before == entry.after)
            && self.fields.iter().all(FieldDifference::is_settled)
    }
}

/// What a Deck change touching a single thing touches
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Subject {
    /// One Deck entry, by its key
    Entry(DeckEntryKey),
    /// One deck field
    Field(Discriminant<FieldDifference>),
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
    /// A difference that changes nothing records nothing. A quick successive
    /// plain edit joins the latest Deck change instead, see [`Self::joins`];
    /// should the two cancel out, the latest Deck change goes away.
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
        if !kind.is_plain_edit() {
            return insert(tx, self.deck, kind, difference).await;
        }

        let now = OffsetDateTime::now_utc();
        match self.latest(tx).await? {
            Some(latest) if Self::joins(&latest, kind, &difference, now) => {
                let uuid = latest.uuid;
                let joined = latest.difference.then(difference).settled();
                if joined.is_empty() {
                    rorm::delete(&mut *tx, DeckChangeModel)
                        .condition(DeckChangeModel.uuid.equals(uuid.0))
                        .await?;
                } else {
                    rorm::update(&mut *tx, DeckChangeModel)
                        .set(DeckChangeModel.difference, Json(joined))
                        .condition(DeckChangeModel.uuid.equals(uuid.0))
                        .await?;
                }
                Ok(())
            }
            _ => insert(tx, self.deck, kind, difference).await,
        }
    }

    /// Whether a Deck change of `kind` made `now` joins the deck's latest one
    ///
    /// It does when both are plain edits of the same kind touching the very
    /// same single Deck entry or deck field, and the latest is still inside
    /// the [`COALESCING_WINDOW`] and carries no Deck checkpoint.
    fn joins(
        latest: &StoredChange,
        kind: DeckChangeKind,
        difference: &DeckDifference,
        now: OffsetDateTime,
    ) -> bool {
        latest.kind == kind
            && kind.is_plain_edit()
            && now - latest.changed_at < COALESCING_WINDOW
            && latest.checkpoint.is_none()
            && latest.difference.touches_the_same(difference)
    }

    /// The deck's latest Deck change
    async fn latest(&self, tx: &mut Transaction) -> Result<Option<StoredChange>, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                "SELECT uuid, changed_at, kind, difference, reference, undone, checkpoint \
                 FROM deck_change \
                 WHERE deck = $1 ORDER BY uuid DESC LIMIT 1"
                    .to_string(),
                vec![Value::Uuid(self.deck.into_inner())],
            )
            .await?;
        rows.first().map(decode_change).transpose()
    }

    /// Bring the deck to the `after` side of a difference
    ///
    /// Each Deck entry the difference names ends up holding its `after`
    /// copies, whatever it holds now, and each deck field its `after` value;
    /// the `before` side is not read. An entry that comes back is a new one
    /// without card tags; one that is still there keeps its tags. The deck's
    /// collection is never touched.
    ///
    /// Answers what it really did, ready to record: for an undo, redo or
    /// reset that is the Deck change it is.
    #[instrument(name = "DeckEdit::apply", skip(tx, difference))]
    pub async fn apply(
        &self,
        tx: &mut Transaction,
        difference: &DeckDifference,
    ) -> Result<DeckDifference, rorm::Error> {
        let mut applied = DeckDifference::default();

        if !difference.entries.is_empty() {
            let held: HashMap<DeckEntryKey, DeckCard> =
                DeckCard::get_all_in_deck(&mut *tx, self.deck)
                    .await?
                    .into_iter()
                    .map(|entry| (entry.key(), entry))
                    .collect();
            for wanted in &difference.entries {
                let key = wanted.key();
                let quantity = wanted.after.max(0);
                match held.get(&key) {
                    Some(entry) if entry.quantity == quantity => {}
                    Some(entry) if quantity == 0 => {
                        DeckCard::delete(&mut *tx, self.deck, entry.uuid).await?;
                        applied.entry(key, entry.quantity, 0);
                    }
                    Some(entry) => {
                        DeckCard::set_quantity(&mut *tx, entry.uuid, quantity).await?;
                        applied.entry(key, entry.quantity, quantity);
                    }
                    None if quantity == 0 => {}
                    None => {
                        DeckCard::add(
                            &mut *tx,
                            self.deck,
                            DeckCardInsert {
                                printing: key.printing,
                                quantity,
                                zone: key.zone,
                                foil: key.foil,
                                proxy: key.proxy,
                            },
                        )
                        .await?;
                        applied.entry(key, 0, quantity);
                    }
                }
            }
        }

        if !difference.fields.is_empty() {
            let before = read_deck(&mut *tx, self.deck).await?;
            let update = difference.fields.iter().fold(
                rorm::update(&mut *tx, DeckModel).begin_dyn_set(),
                |update, field| match field.clone() {
                    FieldDifference::Name { after, .. } => update.set(DeckModel.name, after),
                    FieldDifference::Description { after, .. } => {
                        update.set(DeckModel.description, after)
                    }
                    FieldDifference::Format { after, .. } => update.set(DeckModel.format, after),
                    FieldDifference::Colors { after, .. } => {
                        update.set(DeckModel.allowed_color_identity, after)
                    }
                    FieldDifference::Bracket { after, .. } => update.set(DeckModel.bracket, after),
                    FieldDifference::AllowExtraCommanders { after, .. } => {
                        update.set(DeckModel.allow_extra_commanders, after)
                    }
                    FieldDifference::AllowDuplicates { after, .. } => {
                        update.set(DeckModel.allow_duplicates, after)
                    }
                    FieldDifference::AllowBanned { after, .. } => {
                        update.set(DeckModel.allow_banned, after)
                    }
                    FieldDifference::DeckSize { after, .. } => {
                        update.set(DeckModel.deck_size, after)
                    }
                },
            );
            if let Ok(update) = update.finish_dyn_set() {
                update
                    .condition(DeckModel.uuid.equals(self.deck.into_inner()))
                    .await?;
            }
            let after = read_deck(&mut *tx, self.deck).await?;
            applied.fields = FieldDifference::all(&(&before).into(), &(&after).into());
        }

        Ok(applied.settled())
    }

    /// Take back the latest Deck change that is not undone yet
    ///
    /// Records an [`DeckChangeKind::Undo`] referring to it. Answers `false`
    /// and changes nothing when there is nothing to undo: the latest Deck
    /// change left is the deck's first.
    #[instrument(name = "DeckEdit::undo", skip(tx))]
    pub async fn undo(&self, tx: &mut Transaction) -> Result<bool, rorm::Error> {
        let Some(target) = DeckHistory::undo_state(&mut *tx, self.deck).await?.undo else {
            return Ok(false);
        };
        let difference = stored_difference(&mut *tx, target).await?;
        let applied = self.apply(&mut *tx, &difference.inverse()).await?;
        self.step(&mut *tx, DeckChangeKind::Undo, applied, target, true)
            .await?;
        Ok(true)
    }

    /// Apply the latest undone Deck change again
    ///
    /// Records a [`DeckChangeKind::Redo`] referring to it. Answers `false`
    /// and changes nothing when there is nothing to redo: nothing is undone,
    /// or a Deck change after the undo discarded it.
    #[instrument(name = "DeckEdit::redo", skip(tx))]
    pub async fn redo(&self, tx: &mut Transaction) -> Result<bool, rorm::Error> {
        let Some(target) = DeckHistory::undo_state(&mut *tx, self.deck).await?.redo else {
            return Ok(false);
        };
        let difference = stored_difference(&mut *tx, target).await?;
        let applied = self.apply(&mut *tx, &difference).await?;
        self.step(&mut *tx, DeckChangeKind::Redo, applied, target, false)
            .await?;
        Ok(true)
    }

    /// Bring the deck back to how it was right after an earlier Deck change
    ///
    /// Records one [`DeckChangeKind::Reset`] referring to `point`, even when
    /// the deck already is that way; the Deck changes since `point` stay in
    /// the Deck history. A Deck entry that comes back is a new one without
    /// card tags. The deck's collection is never touched. Answers `false` and
    /// changes nothing when `point` is not a Deck change of this deck.
    #[instrument(name = "DeckEdit::reset", skip(tx))]
    pub async fn reset(
        &self,
        tx: &mut Transaction,
        point: DeckChangeUuid,
    ) -> Result<bool, rorm::Error> {
        let Some(rewound) = rewind(&mut *tx, self.deck, point).await? else {
            return Ok(false);
        };
        let mut wanted = DeckDifference::default();
        for entry in DeckCard::get_all_in_deck(&mut *tx, self.deck).await? {
            wanted.entry(entry.key(), entry.quantity, 0);
        }
        for (key, quantity) in rewound.entries {
            wanted.entry(key, 0, quantity);
        }
        let current = DeckSettings::from(&read_deck(&mut *tx, self.deck).await?);
        wanted.fields = FieldDifference::all(&current, &rewound.settings);

        let applied = self.apply(&mut *tx, &wanted.settled()).await?;
        insert_referring(&mut *tx, self.deck, DeckChangeKind::Reset, applied, point).await?;
        Ok(true)
    }

    /// Name one of the deck's Deck changes with a Deck checkpoint, rename
    /// its Deck checkpoint, or remove it with `None`
    ///
    /// The Deck change stays as it is; once named, no later edit joins it.
    /// Answers `false` and changes nothing when `change` is not a Deck change
    /// of this deck.
    #[instrument(name = "DeckEdit::name_checkpoint", skip(tx))]
    pub async fn name_checkpoint(
        &self,
        tx: &mut Transaction,
        change: DeckChangeUuid,
        checkpoint: Option<MaxStr<CHECKPOINT_LENGTH>>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(&mut *tx, DeckChangeModel)
            .set(DeckChangeModel.checkpoint, checkpoint)
            .condition(rorm::and![
                DeckChangeModel.uuid.equals(change.0),
                DeckChangeModel.deck.equals(self.deck.into_inner()),
            ])
            .await?;
        Ok(affected > 0)
    }

    /// Record an undo or redo of `target` and mark `target` as undone or not
    ///
    /// Recorded even when it changed nothing, so the undo stack stays whole.
    async fn step(
        &self,
        tx: &mut Transaction,
        kind: DeckChangeKind,
        applied: DeckDifference,
        target: DeckChangeUuid,
        undone: bool,
    ) -> Result<(), rorm::Error> {
        insert_referring(&mut *tx, self.deck, kind, applied, target).await?;
        rorm::update(&mut *tx, DeckChangeModel)
            .set(DeckChangeModel.undone, undone)
            .condition(DeckChangeModel.uuid.equals(target.0))
            .await?;
        Ok(())
    }
}

/// What undo and redo would do to a deck right now
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct UndoState {
    /// The Deck change an undo takes back, `None` when only the deck's first is left
    pub undo: Option<DeckChangeUuid>,
    /// The Deck change a redo applies again, `None` when nothing is left to redo
    pub redo: Option<DeckChangeUuid>,
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
    /// The deck fields it changed
    pub fields: Vec<FieldDifference>,
    /// The Deck change an undo or redo refers to or a reset returns to,
    /// `None` for any other kind
    pub reference: Option<DeckChangeUuid>,
    /// Whether an undo took it back and no redo applied it again since
    pub undone: bool,
    /// The Deck checkpoint the owner named it with
    pub checkpoint: Option<String>,
}

/// A deck as it was right after one of its Deck changes
#[derive(Debug, Clone)]
pub struct DeckPoint {
    /// The Deck change
    pub change: DeckChange,
    /// The Deck entries the deck held then, by name
    pub entries: Vec<PointEntry>,
    /// The recorded deck fields as they were then
    pub settings: DeckSettings,
}

/// One Deck entry a deck held at a [`DeckPoint`]
#[derive(Debug, Clone)]
pub struct PointEntry {
    /// Which Deck entry it was
    pub key: DeckEntryKey,
    /// How many copies it held
    pub quantity: i32,
    /// The card's printed name, `None` while the catalog does not know the printing
    pub name: Option<String>,
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

    /// Lock a deck for an edit the service makes itself, whoever owns it
    ///
    /// For catalog maintenance rewriting Deck entries of every owner, like a
    /// Scryfall printing merge. `None` when there is no such deck. Lock several
    /// decks in the order of their ids, so two such edits never deadlock.
    #[instrument(name = "DeckHistory::lock_for_service", skip(tx))]
    pub async fn lock_for_service(
        tx: &mut Transaction,
        deck: DeckUuid,
    ) -> Result<Option<DeckEdit>, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                "SELECT uuid FROM deck WHERE uuid = $1 FOR NO KEY UPDATE".to_string(),
                vec![Value::Uuid(deck.into_inner())],
            )
            .await?;
        Ok((!rows.is_empty()).then_some(DeckEdit { deck }))
    }

    /// Start the Deck history of a deck just created
    #[instrument(name = "DeckHistory::record_created", skip(tx, deck))]
    pub async fn record_created(tx: &mut Transaction, deck: &Deck) -> Result<(), rorm::Error> {
        insert(
            tx,
            deck.uuid,
            DeckChangeKind::Created,
            DeckDifference::state(deck, DeckDifference::default()),
        )
        .await
    }

    /// Restart the Deck histories of decks with their current state
    ///
    /// Each deck's Deck history is deleted and replaced by one
    /// [`DeckChangeKind::Introduced`] Deck change holding its Deck entries and
    /// deck fields, so nothing is left of how and when they came to be. For
    /// decks handed to the tombstone, whose builder is going away.
    #[instrument(name = "DeckHistory::introduce", skip(tx, decks))]
    pub async fn introduce(tx: &mut Transaction, decks: &[DeckUuid]) -> Result<(), rorm::Error> {
        if decks.is_empty() {
            return Ok(());
        }

        rorm::delete(&mut *tx, DeckChangeModel)
            .condition(DynamicCollection::or_unchecked(
                decks
                    .iter()
                    .map(|deck| DeckChangeModel.deck.equals(deck.into_inner()).boxed())
                    .collect(),
            ))
            .await?;

        let entries = rorm::query(
            &mut *tx,
            (
                DeckCardModel.deck,
                DeckCardModel.printing,
                DeckCardModel.zone,
                DeckCardModel.foil,
                DeckCardModel.proxy,
                DeckCardModel.quantity,
            ),
        )
        .condition(DynamicCollection::or_unchecked(
            decks
                .iter()
                .map(|deck| DeckCardModel.deck.equals(deck.into_inner()).boxed())
                .collect(),
        ))
        .order_asc(DeckCardModel.uuid)
        .all()
        .await?;
        let mut differences: HashMap<Uuid, DeckDifference> = decks
            .iter()
            .map(|deck| (deck.into_inner(), DeckDifference::default()))
            .collect();
        for (deck, printing, zone, foil, proxy, quantity) in entries {
            differences.entry(deck.0).or_default().entry(
                DeckEntryKey {
                    printing,
                    zone,
                    foil,
                    proxy,
                },
                0,
                quantity,
            );
        }

        let settings = rorm::query(&mut *tx, DeckModel)
            .condition(DynamicCollection::or_unchecked(
                decks
                    .iter()
                    .map(|deck| DeckModel.uuid.equals(deck.into_inner()).boxed())
                    .collect(),
            ))
            .all()
            .await?;

        let changed_at = OffsetDateTime::now_utc();
        let patches: Vec<_> = settings
            .into_iter()
            .map(Deck::from)
            .map(|deck| DeckChangeInsertPatch {
                uuid: Uuid::now_v7(),
                deck: ForeignModelByField(deck.uuid.into_inner()),
                changed_at,
                kind: DeckChangeKind::Introduced,
                difference: Json(DeckDifference::state(
                    &deck,
                    differences
                        .remove(&deck.uuid.into_inner())
                        .unwrap_or_default(),
                )),
            })
            .collect();
        rorm::insert(&mut *tx, DeckChangeModel)
            .return_nothing()
            .bulk(&patches)
            .await
    }

    /// What undo and redo would do to a deck right now
    ///
    /// The Deck changes that are not undone, except undos and redos, form the
    /// undo stack: an undo takes back the latest of them unless it is the
    /// deck's first. A redo applies again the earliest Deck change undone
    /// since the latest Deck change that is neither an undo nor a redo; that
    /// one discarded every undo before it. The caller has to have established
    /// that the account owns the deck.
    #[instrument(name = "DeckHistory::undo_state", skip(tx))]
    pub async fn undo_state(
        tx: &mut Transaction,
        deck: DeckUuid,
    ) -> Result<UndoState, rorm::Error> {
        let steps = || {
            vec![
                Value::Uuid(deck.into_inner()),
                Value::String(DeckChangeKind::Undo.as_str()),
                Value::String(DeckChangeKind::Redo.as_str()),
            ]
        };
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());

        let undo = (&mut *tx)
            .execute::<All>(
                "SELECT uuid, kind FROM deck_change \
                 WHERE deck = $1 AND NOT undone AND kind <> $2 AND kind <> $3 \
                 ORDER BY uuid DESC LIMIT 1"
                    .to_string(),
                steps(),
            )
            .await?;
        let undo = match undo.first() {
            Some(row) => {
                let kind: String = row.get("kind").map_err(decode)?;
                match DeckChangeKind::from_str(&kind) {
                    Some(DeckChangeKind::Created | DeckChangeKind::Introduced) => None,
                    _ => Some(DeckChangeUuid(row.get("uuid").map_err(decode)?)),
                }
            }
            None => None,
        };

        let redo = (&mut *tx)
            .execute::<All>(
                "SELECT step.reference FROM deck_change step \
                 JOIN deck_change target ON target.uuid = step.reference \
                 WHERE step.deck = $1 AND step.kind = $2 AND target.undone AND step.uuid > ( \
                     SELECT uuid FROM deck_change \
                     WHERE deck = $1 AND kind <> $2 AND kind <> $3 \
                     ORDER BY uuid DESC LIMIT 1 \
                 ) \
                 ORDER BY step.reference LIMIT 1"
                    .to_string(),
                steps(),
            )
            .await?;
        let redo = match redo.first() {
            Some(row) => Some(DeckChangeUuid(row.get("reference").map_err(decode)?)),
            None => None,
        };

        Ok(UndoState { undo, redo })
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
            "SELECT uuid, changed_at, kind, difference, reference, undone, checkpoint \
             FROM deck_change \
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
            stored.last().map(|change| change.uuid)
        } else {
            None
        };

        let mut printings: Vec<Uuid> = stored
            .iter()
            .flat_map(|change| change.difference.entries.iter().map(|entry| entry.printing))
            .collect();
        printings.sort_unstable();
        printings.dedup();
        let names = printing_names(&mut *tx, &printings).await?;

        let changes = stored
            .into_iter()
            .map(|change| change.named(&names))
            .collect();
        Ok(DeckHistoryPage {
            changes,
            next_cursor,
        })
    }

    /// A deck as it was right after one of its Deck changes
    ///
    /// Computed backwards from the deck as it is now. `None` when `change` is
    /// not a Deck change of this deck. The caller has to have established
    /// that the account owns the deck.
    #[instrument(name = "DeckHistory::point", skip(tx))]
    pub async fn point(
        tx: &mut Transaction,
        deck: DeckUuid,
        change: DeckChangeUuid,
    ) -> Result<Option<DeckPoint>, rorm::Error> {
        let Some(rewound) = rewind(&mut *tx, deck, change).await? else {
            return Ok(None);
        };

        let mut printings: Vec<Uuid> = rewound
            .entries
            .keys()
            .map(|key| key.printing)
            .chain(
                rewound
                    .change
                    .difference
                    .entries
                    .iter()
                    .map(|entry| entry.printing),
            )
            .collect();
        printings.sort_unstable();
        printings.dedup();
        let names = printing_names(&mut *tx, &printings).await?;

        let mut entries: Vec<PointEntry> = rewound
            .entries
            .into_iter()
            .map(|(key, quantity)| PointEntry {
                key,
                quantity,
                name: names.get(&key.printing).cloned(),
            })
            .collect();
        entries.sort_by_cached_key(|entry| {
            let key = entry.key;
            (
                entry.name.clone(),
                key.printing,
                key.zone.as_str(),
                key.foil,
                key.proxy,
            )
        });
        Ok(Some(DeckPoint {
            change: rewound.change.named(&names),
            entries,
            settings: rewound.settings,
        }))
    }
}

/// A deck computed back to how it was right after one of its Deck changes
struct Rewound {
    /// The Deck change
    change: StoredChange,
    /// The copies each Deck entry held then, none with zero
    entries: HashMap<DeckEntryKey, i32>,
    /// The recorded deck fields then
    settings: DeckSettings,
}

/// Compute a deck back to how it was right after `point`
///
/// Takes every Deck change since `point` back, newest first, from the deck as
/// it is now. `None` when `point` is not a Deck change of the deck.
async fn rewind(
    tx: &mut Transaction,
    deck: DeckUuid,
    point: DeckChangeUuid,
) -> Result<Option<Rewound>, rorm::Error> {
    let rows = (&mut *tx)
        .execute::<All>(
            "SELECT uuid, changed_at, kind, difference, reference, undone, checkpoint \
             FROM deck_change \
             WHERE deck = $1 AND uuid >= $2 ORDER BY uuid DESC"
                .to_string(),
            vec![Value::Uuid(deck.into_inner()), Value::Uuid(point.0)],
        )
        .await?;
    let mut changes = rows
        .iter()
        .map(decode_change)
        .collect::<Result<Vec<_>, _>>()?;
    let Some(change) = changes.pop().filter(|change| change.uuid == point) else {
        return Ok(None);
    };

    let mut entries: HashMap<DeckEntryKey, i32> = DeckCard::get_all_in_deck(&mut *tx, deck)
        .await?
        .into_iter()
        .map(|entry| (entry.key(), entry.quantity))
        .collect();
    let mut settings = DeckSettings::from(&read_deck(&mut *tx, deck).await?);
    for later in &changes {
        for entry in &later.difference.entries {
            entries.insert(entry.key(), entry.before);
        }
        for field in &later.difference.fields {
            settings.take_before(field);
        }
    }
    entries.retain(|_, quantity| *quantity > 0);

    Ok(Some(Rewound {
        change,
        entries,
        settings,
    }))
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

/// Append a Deck change referring to an earlier one, timestamped now
///
/// For an undo, a redo or a reset; recorded even with an empty difference.
async fn insert_referring(
    tx: &mut Transaction,
    deck: DeckUuid,
    kind: DeckChangeKind,
    difference: DeckDifference,
    reference: DeckChangeUuid,
) -> Result<(), rorm::Error> {
    rorm::insert(&mut *tx, DeckChangeModel)
        .return_nothing()
        .single(&DeckChangeReferringInsertPatch {
            uuid: Uuid::now_v7(),
            deck: ForeignModelByField(deck.into_inner()),
            changed_at: OffsetDateTime::now_utc(),
            kind,
            difference: Json(difference),
            reference: Some(ForeignModelByField(reference.0)),
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

/// A stored Deck change as it is read back
struct StoredChange {
    /// Primary key
    uuid: DeckChangeUuid,
    /// When it happened
    changed_at: OffsetDateTime,
    /// What the owner did
    kind: DeckChangeKind,
    /// What it did to the deck
    difference: DeckDifference,
    /// The Deck change an undo or redo refers to or a reset returns to
    reference: Option<DeckChangeUuid>,
    /// Whether it is undone
    undone: bool,
    /// The Deck checkpoint naming it
    checkpoint: Option<String>,
}

impl StoredChange {
    /// The Deck change as the Deck history lists it, with the names of its cards
    fn named(self, names: &HashMap<Uuid, String>) -> DeckChange {
        DeckChange {
            uuid: self.uuid,
            kind: self.kind,
            changed_at: self.changed_at,
            entries: self
                .difference
                .entries
                .into_iter()
                .map(|difference| ChangedEntry {
                    name: names.get(&difference.printing).cloned(),
                    difference,
                })
                .collect(),
            fields: self.difference.fields,
            reference: self.reference,
            undone: self.undone,
            checkpoint: self.checkpoint,
        }
    }
}

/// Reads a stored Deck change from a row holding its columns
fn decode_change(row: &Row) -> Result<StoredChange, rorm::Error> {
    let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
    let kind: String = row.get("kind").map_err(decode)?;
    let difference: Vec<u8> = row.get("difference").map_err(decode)?;
    let reference: Option<Uuid> = row.get("reference").map_err(decode)?;
    Ok(StoredChange {
        uuid: DeckChangeUuid(row.get("uuid").map_err(decode)?),
        changed_at: row.get("changed_at").map_err(decode)?,
        kind: DeckChangeKind::from_str(&kind)
            .unwrap_or_else(|| unreachable!("only the kind's own encoding is written")),
        difference: decode_difference(&difference),
        reference: reference.map(DeckChangeUuid),
        undone: row.get("undone").map_err(decode)?,
        checkpoint: row.get("checkpoint").map_err(decode)?,
    })
}

/// Reads a difference as [`insert`] stored it
fn decode_difference(json: &[u8]) -> DeckDifference {
    serde_json::from_slice(json)
        .unwrap_or_else(|error| unreachable!("only a difference's own json is written: {error}"))
}

/// The difference a Deck change stored
async fn stored_difference(
    tx: &mut Transaction,
    change: DeckChangeUuid,
) -> Result<DeckDifference, rorm::Error> {
    let difference = rorm::query(&mut *tx, DeckChangeModel.difference)
        .condition(DeckChangeModel.uuid.equals(change.0))
        .one()
        .await?;
    Ok(difference.0)
}

/// A deck's row, read inside the transaction holding its lock
async fn read_deck(tx: &mut Transaction, deck: DeckUuid) -> Result<Deck, rorm::Error> {
    let deck = rorm::query(&mut *tx, DeckModel)
        .condition(DeckModel.uuid.equals(deck.into_inner()))
        .one()
        .await?;
    Ok(Deck::from(deck))
}
