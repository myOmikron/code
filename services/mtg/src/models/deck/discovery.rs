//! Searching the decks their owners put on show
//!
//! What separates this from [`super::listing`] is who is asking: nobody in
//! particular. Only decks at [`Visibility::Public`] are ever read here, and the
//! owner is a name rather than an id, so the answer says as little about the
//! account behind it as the deck already does.
//!
//! Raw sql for the same reason as [`crate::models::collection::listing`]:
//! `printing` is not a foreign key of `deckcard`, so there is no relation for
//! the query builder to walk. Every piece spliced in as text is chosen from a
//! fixed set here; everything a request supplies is a bound parameter.

use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::executor::One;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;

use crate::models::collection::listing::like_literal;
use crate::models::deck::DeckUuid;
use crate::models::deck::listing::DeckCommander;
use crate::models::printing::fold_name;

/// The most decks one search answers with
pub const MAX_LIMIT: u32 = 60;

/// What a public deck listing is ordered by
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum PublicDeckSort {
    /// Newest first
    #[default]
    Created,
    /// By the deck's name
    Name,
    /// By how many cards it holds
    Cards,
    /// By what those cards are worth
    Price,
}

impl PublicDeckSort {
    /// The expression the order is read off
    fn expression(self) -> &'static str {
        match self {
            Self::Created => "d.created_at",
            Self::Name => "d.name",
            Self::Cards => "s.cards",
            Self::Price => "s.price",
        }
    }
}

/// What a reader is looking for among the public decks
#[derive(Debug, Clone, Default)]
pub struct PublicDeckQuery {
    /// One deck by its primary key, which is how a single one is read
    pub deck: Option<DeckUuid>,
    /// Part of the deck's name
    pub search: Option<String>,
    /// The format slug, matched exactly
    pub format: Option<String>,
    /// The owner, by their normalized username
    pub owner: Option<String>,
    /// What the page is ordered by
    pub sort: PublicDeckSort,
    /// Whether the order is reversed
    pub descending: bool,
    /// How many decks the page holds
    pub limit: u32,
    /// How many decks to skip
    pub offset: u32,
}

/// A deck as a stranger sees it in a list
#[derive(Debug, Clone)]
pub struct PublicDeck {
    /// Primary key
    pub uuid: DeckUuid,
    /// Name of the deck
    pub name: String,
    /// Optional description, e.g. the deck's game plan
    pub description: Option<String>,
    /// The format it is built for
    pub format: String,
    /// The colours it may play, `None` for whatever the commander allows
    pub allowed_color_identity: Option<String>,
    /// The username of the account that built it
    pub owner: String,
    /// How many cards sit in the deck proper
    pub cards: i64,
    /// What those cards are worth in euro cents
    pub price_eur: i64,
    /// The commanders, in the order they were put in
    pub commanders: Vec<DeckCommander>,
    /// The point in time the deck was created
    pub created_at: OffsetDateTime,
}

/// One page of the public decks
#[derive(Debug, Clone)]
pub struct PublicDeckPage {
    /// The decks on this page
    pub decks: Vec<PublicDeck>,
    /// How many decks the search found in total
    pub total: i64,
}

/// Builds the `WHERE` fragments and the values they bind
///
/// Kept together for the same reason as the collection listing's: a condition
/// added without its value would shift every later placeholder.
struct Filters<'query> {
    /// Sql fragments, joined with `AND`
    clauses: Vec<String>,
    /// The values, in placeholder order
    values: Vec<Value<'query>>,
}

impl<'query> Filters<'query> {
    /// Assembles the filters a search asks for
    ///
    /// `name` and `commander` are the one search text folded the two ways the
    /// two columns are searched. They are passed in rather than folded here so
    /// that they outlive the borrow the value list takes of them.
    fn build(
        query: &'query PublicDeckQuery,
        name: &'query Option<String>,
        commander: &'query Option<String>,
    ) -> Self {
        let mut filters = Self {
            // Not a bound parameter: the visibility is this module's own
            // condition, not something a request may take part in.
            clauses: vec!["d.visibility = 'Public'".to_string()],
            values: Vec::new(),
        };

        if let Some(deck) = query.deck {
            filters.push("d.uuid = ", Value::Uuid(deck.into_inner()));
        }
        // One search field, two places a hit can sit: a deck is looked for by
        // what it is called or by who is at the head of it, and which of the
        // two somebody typed is not a question worth asking them.
        if let (Some(name), Some(commander)) = (name, commander) {
            filters.push_pair(
                "(LOWER(d.name) LIKE ",
                Value::String(name),
                " OR EXISTS (SELECT 1 FROM deckcard c \
                    JOIN printing p ON p.id = c.printing \
                    WHERE c.deck = d.uuid AND c.zone = 'Commander' AND p.name_sort LIKE ",
                Value::String(commander),
                "))",
            );
        }
        if let Some(format) = &query.format {
            filters.push("d.format = ", Value::String(format));
        }
        if let Some(owner) = &query.owner {
            filters.push("a.username_normalized = ", Value::String(owner));
        }
        filters
    }

    /// Adds one comparison and the value it binds
    fn push(&mut self, column: &str, value: Value<'query>) {
        self.values.push(value);
        self.clauses.push(format!("{column}${}", self.values.len()));
    }

    /// Adds one clause binding two values, with sql between and after them
    fn push_pair(
        &mut self,
        before: &str,
        first: Value<'query>,
        between: &str,
        second: Value<'query>,
        after: &str,
    ) {
        self.values.push(first);
        let first = self.values.len();
        self.values.push(second);
        let second = self.values.len();
        self.clauses
            .push(format!("{before}${first}{between}${second}{after}"));
    }

    /// The clauses as one `WHERE` body
    fn where_clause(&self) -> String {
        self.clauses.join(" AND ")
    }
}

/// What every read joins to get a deck's size and worth
///
/// The sideboard and the maybe board are left out of both numbers, the same way
/// [`DeckSummary`](super::listing::DeckSummary) counts them.
const SUMMARY_JOIN: &str = "LEFT JOIN LATERAL ( \
        SELECT COALESCE(SUM(c.quantity), 0)::bigint AS cards, \
               COALESCE(SUM(c.quantity * COALESCE(p.price_eur, 0)), 0)::bigint AS price \
        FROM deckcard c \
        LEFT JOIN printing p ON p.id = c.printing \
        WHERE c.deck = d.uuid AND c.zone IN ('Main', 'Commander') \
    ) s ON TRUE";

impl PublicDeckPage {
    /// Read one page of the decks their owners made public
    #[instrument(name = "PublicDeckPage::read", skip(tx))]
    pub async fn read(
        tx: &mut Transaction,
        query: &PublicDeckQuery,
    ) -> Result<PublicDeckPage, rorm::Error> {
        // Deck names are matched case-insensitively over the column itself:
        // unlike a card there is no folded copy of it to search, and a deck
        // name is what its owner typed rather than a catalog entry.
        let name = query
            .search
            .as_deref()
            .map(|search| format!("%{}%", like_literal(&search.to_lowercase())));
        // The same text against the command zone, folded the way every other
        // card search folds it, so "jodah" finds the deck and the commander
        // alike.
        let commander = query
            .search
            .as_deref()
            .map(|search| format!("%{}%", like_literal(&fold_name(search))));

        let filters = Filters::build(query, &name, &commander);
        let where_clause = filters.where_clause();

        let total: i64 = {
            let count = format!(
                "SELECT count(*) FROM deck d \
                 JOIN account a ON a.uuid = d.owner \
                 WHERE {where_clause}"
            );
            let row = (&mut *tx)
                .execute::<One>(count, filters.values.clone())
                .await?;
            row.get(0)
                .map_err(|error| rorm::Error::RowError(error.into_owned()))?
        };

        let direction = if query.descending { "DESC" } else { "ASC" };
        // The primary key closes the order: without it two decks that tie on
        // the sort key can swap places between two requests, and a reader
        // paging through would see one of them twice and the other never.
        let order = format!(
            "{} {direction} NULLS LAST, d.uuid ASC",
            query.sort.expression()
        );

        let mut values = filters.values.clone();
        values.push(Value::I64(i64::from(query.limit.min(MAX_LIMIT))));
        values.push(Value::I64(i64::from(query.offset)));
        let limit_placeholder = values.len() - 1;
        let offset_placeholder = values.len();

        let statement = format!(
            "SELECT d.uuid, d.name, d.description, d.format, d.allowed_color_identity, \
                    d.created_at, a.username AS owner, s.cards, s.price \
             FROM deck d \
             JOIN account a ON a.uuid = d.owner \
             {SUMMARY_JOIN} \
             WHERE {where_clause} \
             ORDER BY {order} LIMIT ${limit_placeholder} OFFSET ${offset_placeholder}"
        );

        let rows = (&mut *tx).execute::<All>(statement, values).await?;

        let mut decks = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            decks.push(PublicDeck {
                uuid: DeckUuid::from_uuid(row.get("uuid").map_err(decode)?),
                name: row.get("name").map_err(decode)?,
                description: row.get("description").map_err(decode)?,
                format: row.get("format").map_err(decode)?,
                allowed_color_identity: row.get("allowed_color_identity").map_err(decode)?,
                owner: row.get("owner").map_err(decode)?,
                cards: row.get("cards").map_err(decode)?,
                price_eur: row.get("price").map_err(decode)?,
                commanders: Vec::new(),
                created_at: row.get("created_at").map_err(decode)?,
            });
        }

        let uuids: Vec<DeckUuid> = decks.iter().map(|deck| deck.uuid).collect();
        let mut commanders = read_commanders(&mut *tx, &uuids).await?;
        for deck in &mut decks {
            deck.commanders = commanders.remove(&deck.uuid).unwrap_or_default();
        }

        Ok(PublicDeckPage { decks, total })
    }

    /// Read one deck its owner put on show, `None` for everything else
    ///
    /// The same read as [`Self::read`] narrowed to a primary key, so a deck
    /// reached directly cannot come back looking different from the same deck
    /// in a listing — or come back at all when the listing would not show it.
    #[instrument(name = "PublicDeckPage::read_one", skip(tx))]
    pub async fn read_one(
        tx: &mut Transaction,
        deck: DeckUuid,
    ) -> Result<Option<PublicDeck>, rorm::Error> {
        let page = Self::read(
            tx,
            &PublicDeckQuery {
                deck: Some(deck),
                limit: 1,
                ..PublicDeckQuery::default()
            },
        )
        .await?;
        Ok(page.decks.into_iter().next())
    }

    /// Read every public deck of one account, newest first
    ///
    /// What a profile page shows. The same read as [`Self::read`] with nothing
    /// but the owner filled in, so the two cannot disagree about what "public"
    /// means.
    #[instrument(name = "PublicDeckPage::read_for_account", skip(tx))]
    pub async fn read_for_account(
        tx: &mut Transaction,
        owner: &str,
        limit: u32,
    ) -> Result<Vec<PublicDeck>, rorm::Error> {
        let page = Self::read(
            tx,
            &PublicDeckQuery {
                owner: Some(owner.to_lowercase()),
                sort: PublicDeckSort::Created,
                descending: true,
                limit,
                ..PublicDeckQuery::default()
            },
        )
        .await?;
        Ok(page.decks)
    }
}

/// The commanders of the decks on a page, keyed by deck
///
/// One statement for the whole page rather than one per deck, and a `Vec`
/// per entry because a Partner deck has two of them.
async fn read_commanders(
    tx: &mut Transaction,
    decks: &[DeckUuid],
) -> Result<HashMap<DeckUuid, Vec<DeckCommander>>, rorm::Error> {
    let mut grouped: HashMap<DeckUuid, Vec<DeckCommander>> = HashMap::new();
    if decks.is_empty() {
        return Ok(grouped);
    }

    let placeholders = (1..=decks.len())
        .map(|index| format!("${index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let statement = format!(
        "SELECT c.deck AS deck, p.name, p.image_small, p.image_normal, p.color_identity \
         FROM deckcard c \
         JOIN printing p ON p.id = c.printing \
         WHERE c.zone = 'Commander' AND c.deck IN ({placeholders}) \
         ORDER BY c.uuid ASC"
    );
    let values = decks
        .iter()
        .map(|deck| Value::Uuid(deck.into_inner()))
        .collect();

    let rows = (&mut *tx).execute::<All>(statement, values).await?;
    for row in rows {
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
        let deck = DeckUuid::from_uuid(row.get("deck").map_err(decode)?);
        grouped.entry(deck).or_default().push(DeckCommander {
            name: row.get("name").map_err(decode)?,
            image_small: row.get("image_small").map_err(decode)?,
            image_normal: row.get("image_normal").map_err(decode)?,
            color_identity: row.get("color_identity").map_err(decode)?,
        });
    }

    Ok(grouped)
}
