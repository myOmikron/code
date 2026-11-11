//! The migration moving Proxies off the deck list into the Physical deck

use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use sqlx::PgPool;
use uuid::Uuid;

use crate::tests::harness::migrate;
use crate::tests::harness::migrated_database;
use crate::tests::harness::run;

/// The last migration before Deck entries lost their proxy flag
const BEFORE_PROXIES_LEFT_THE_LIST: u16 = 75;

/// Inserts an Account and answers its uuid
async fn account(pool: &PgPool, name: &str) -> Uuid {
    let [identity, account] = [(); 2].map(|()| Uuid::now_v7());
    sqlx::query("INSERT INTO identity (uuid) VALUES ($1)")
        .bind(identity)
        .execute(pool)
        .await
        .expect("insert the identity");
    sqlx::query(
        "INSERT INTO account (uuid, username, username_normalized, email, identity) \
         VALUES ($1, $2, $2, $2 || '@mtg.test', $3)",
    )
    .bind(account)
    .bind(name)
    .bind(identity)
    .execute(pool)
    .await
    .expect("insert the account");
    account
}

/// Inserts a deck of `owner` and answers its uuid
async fn deck(pool: &PgPool, owner: Uuid) -> Uuid {
    let deck = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO deck (uuid, name, format, visibility, owner) \
         VALUES ($1, 'Proxied', 'commander', 'Private', $2)",
    )
    .bind(deck)
    .bind(owner)
    .execute(pool)
    .await
    .expect("insert the deck");
    deck
}

/// Inserts a Deck entry in the shape before the migration and answers its uuid
async fn entry(
    pool: &PgPool,
    deck: Uuid,
    printing: Uuid,
    (quantity, zone, foil, proxy): (i32, &str, bool, bool),
) -> Uuid {
    let entry = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO deckcard (uuid, deck, printing, quantity, zone, foil, proxy) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(entry)
    .bind(deck)
    .bind(printing)
    .bind(quantity)
    .bind(zone)
    .bind(foil)
    .bind(proxy)
    .execute(pool)
    .await
    .expect("insert a Deck entry");
    entry
}

/// The deck's Deck entries as (printing, zone, foil, quantity), sorted
async fn entries(pool: &PgPool, deck: Uuid) -> Vec<(Uuid, String, bool, i32)> {
    let mut entries: Vec<(Uuid, String, bool, i32)> =
        sqlx::query_as("SELECT printing, zone, foil, quantity FROM deckcard WHERE deck = $1")
            .bind(deck)
            .fetch_all(pool)
            .await
            .expect("read the Deck entries");
    entries.sort();
    entries
}

/// The stacks of the deck's Physical deck as (printing, finish, proxy, quantity), sorted
async fn physical_deck(pool: &PgPool, deck: Uuid) -> Vec<(Uuid, String, bool, i32)> {
    let mut stacks: Vec<(Uuid, String, bool, i32)> = sqlx::query_as(
        "SELECT e.printing, e.finish, e.proxy, e.quantity \
         FROM collection_entry e JOIN collection c ON c.uuid = e.collection \
         WHERE c.deck = $1",
    )
    .bind(deck)
    .fetch_all(pool)
    .await
    .expect("read the Physical deck");
    stacks.sort();
    stacks
}

/// How many collections stand for the deck
async fn physical_decks(pool: &PgPool, deck: Uuid) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM collection WHERE deck = $1")
        .bind(deck)
        .fetch_one(pool)
        .await
        .expect("count the Physical decks")
}

#[test]
fn proxy_lines_become_proxies_in_the_physical_deck_and_merge_with_their_real_line() {
    run(async {
        let driver = migrated_database(Some(BEFORE_PROXIES_LEFT_THE_LIST)).await;
        let db = Database::connect(DatabaseConfiguration::new(driver.clone()))
            .await
            .expect("connect to the test database");
        let pool = db.as_pool();

        let owner = account(pool, "proxied").await;
        let unbuilt = deck(pool, owner).await;
        let built = deck(pool, owner).await;
        let clean = deck(pool, owner).await;
        let [sol_ring, crypt, rings, bolt] = [(); 4].map(|()| Uuid::now_v7());

        let proxied = entry(pool, unbuilt, sol_ring, (2, "Main", false, true)).await;
        let real = entry(pool, unbuilt, sol_ring, (1, "Main", false, false)).await;
        entry(pool, unbuilt, crypt, (1, "Main", true, true)).await;
        entry(pool, unbuilt, crypt, (1, "Side", true, true)).await;
        let tag = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO deck_tag (uuid, name, color, owner, deck) \
             VALUES ($1, 'Ramp', 'red', $2, $3)",
        )
        .bind(tag)
        .bind(owner)
        .bind(unbuilt)
        .execute(pool)
        .await
        .expect("insert a tag");
        for assigned in [proxied, real] {
            sqlx::query("INSERT INTO deck_card_tag (uuid, deck_card, tag) VALUES ($1, $2, $3)")
                .bind(Uuid::now_v7())
                .bind(assigned)
                .bind(tag)
                .execute(pool)
                .await
                .expect("tag an entry");
        }

        entry(pool, built, rings, (1, "Main", false, true)).await;
        entry(pool, built, bolt, (1, "Main", false, false)).await;
        let collection = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO collection (uuid, name, description, color, icon, deck, owner, visibility) \
             VALUES ($1, 'Proxied', '', 'indigo', 'deckbox', $2, $3, 'Private')",
        )
        .bind(collection)
        .bind(built)
        .bind(owner)
        .execute(pool)
        .await
        .expect("insert the deck collection");
        sqlx::query(
            "INSERT INTO collection_entry \
             (uuid, collection, printing, quantity, condition, finish, created_at) \
             VALUES ($1, $2, $3, 1, 'NearMint', 'Nonfoil', now())",
        )
        .bind(Uuid::now_v7())
        .bind(collection)
        .bind(bolt)
        .execute(pool)
        .await
        .expect("file a real card into it");

        entry(pool, clean, bolt, (4, "Main", false, false)).await;

        migrate(&driver, None).await;

        assert_eq!(
            entries(pool, unbuilt).await,
            sorted(vec![
                (sol_ring, "Main".to_string(), false, 3),
                (crypt, "Main".to_string(), true, 1),
                (crypt, "Side".to_string(), true, 1),
            ])
        );
        assert_eq!(
            physical_deck(pool, unbuilt).await,
            sorted(vec![
                (sol_ring, "Nonfoil".to_string(), true, 2),
                (crypt, "Foil".to_string(), true, 2),
            ])
        );
        let tags: Vec<Uuid> = sqlx::query_scalar(
            "SELECT a.tag FROM deck_card_tag a JOIN deckcard c ON c.uuid = a.deck_card \
             WHERE c.deck = $1",
        )
        .bind(unbuilt)
        .fetch_all(pool)
        .await
        .expect("read the tags");
        assert_eq!(tags, vec![tag]);

        assert_eq!(physical_decks(pool, built).await, 1);
        assert_eq!(
            physical_deck(pool, built).await,
            sorted(vec![
                (bolt, "Nonfoil".to_string(), false, 1),
                (rings, "Nonfoil".to_string(), true, 1),
            ])
        );
        let origins: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM collection_entry WHERE proxy AND origin IS NOT NULL",
        )
        .fetch_one(pool)
        .await
        .expect("count Proxies with an origin");
        assert_eq!(origins, 0);

        assert_eq!(physical_decks(pool, clean).await, 0);

        let duplicate = sqlx::query(
            "INSERT INTO deckcard (uuid, deck, printing, quantity, zone, foil) \
             VALUES ($1, $2, $3, 1, 'Main', false)",
        )
        .bind(Uuid::now_v7())
        .bind(unbuilt)
        .bind(sol_ring)
        .execute(pool)
        .await;
        assert!(duplicate.is_err(), "a second alike entry was accepted");

        db.close().await;
    });
}

/// The list, sorted
fn sorted<T: Ord>(mut list: Vec<T>) -> Vec<T> {
    list.sort();
    list
}
