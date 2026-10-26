//! Statistics snapshots and the admin page that shows them

use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::Collection;
use crate::models::collection::CollectionEntry;
use crate::models::collection::CollectionEntryInsert;
use crate::models::collection::CollectionInsert;
use crate::models::collection::CollectionUuid;
use crate::models::deck::Deck;
use crate::models::deck::DeckInsert;
use crate::models::scanner_session::ScannerSession;
use crate::models::scanner_session::ScannerSessionEntry;
use crate::models::scanner_session::ScannerSessionEntryInsert;
use crate::models::scanner_session::ScannerSessionInsert;
use crate::models::statistics::StatisticsSnapshot;
use crate::models::tournament::Tournament;
use crate::models::tournament::settings::TournamentSettings;
use crate::models::visibility::Visibility;
use crate::tests::harness::App;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::ruleset::TableSize;

fn text<const N: usize>(value: &str) -> MaxStr<N> {
    MaxStr::new(value.to_string()).expect("short text")
}

async fn insert_account(tx: &mut Transaction) -> AccountUuid {
    let username = format!("s{}", &Uuid::new_v4().simple().to_string()[..12]);
    let username = Username::new(username).expect("valid username");
    Account::insert(
        tx,
        username.clone(),
        text(&format!("{}@mtg.test", username.as_str())),
    )
    .await
    .expect("create the account");
    Account::get_by_username(tx, &username)
        .await
        .expect("look the account up")
        .expect("the account exists")
        .uuid
}

async fn add_cards(tx: &mut Transaction, collection: CollectionUuid, quantities: &[i32]) {
    let inserts = quantities
        .iter()
        .map(|&quantity| CollectionEntryInsert {
            printing: Uuid::new_v4(),
            quantity,
            condition: CardCondition::NearMint,
            finish: CardFinish::Nonfoil,
            signed: false,
            purchase_price_cents: None,
            acquired_at: None,
        })
        .collect();
    CollectionEntry::create_many(tx, collection, inserts)
        .await
        .expect("add the cards");
}

async fn create_deck(tx: &mut Transaction, owner: AccountUuid, visibility: Visibility) -> Deck {
    Deck::create(
        tx,
        owner,
        DeckInsert {
            name: text("Deck"),
            description: None,
            format: text("commander"),
            visibility,
            allowed_color_identity: None,
        },
    )
    .await
    .expect("create the deck")
}

async fn create_session(tx: &mut Transaction, owner: AccountUuid) -> ScannerSession {
    ScannerSession::create(
        tx,
        owner,
        ScannerSessionInsert {
            name: text("Session"),
            color: text("lime"),
            icon: text("camera"),
            collection: None,
        },
    )
    .await
    .expect("create the session")
}

async fn create_tournament(tx: &mut Transaction, owner: AccountUuid) -> Tournament {
    Tournament::create(
        tx,
        owner,
        TournamentSettings {
            name: text("Friday Night Commander"),
            description: None,
            location: None,
            starts_at: OffsetDateTime::now_utc(),
            table_size: TableSize::new(4).expect("a Table size"),
            ruleset: Ruleset::TopDeck,
            format: None,
            visibility: Visibility::Private,
            participant_limit: None,
            self_sign_up: false,
            best_of: None,
            top_cut: None,
            top_cut_best_of: None,
            entry_fee: None,
        },
    )
    .await
    .expect("create the tournament")
}

#[test]
fn a_snapshot_counts_what_the_accounts_own() {
    run(async {
        App::get().await;
        // Made and committed up front: the snapshot of the transaction below
        // would not see a tombstone a deletion test commits later, and it
        // would insert a second one.
        let mut setup = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        Account::tombstone(&mut setup)
            .await
            .expect("make the tombstone");
        setup.commit().await.expect("commit the tombstone");

        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        (&mut tx)
            .execute::<All>(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ".to_string(),
                Vec::new(),
            )
            .await
            .expect("isolate from the other tests");

        let before = StatisticsSnapshot::take(&mut tx)
            .await
            .expect("take a snapshot");

        let owner = insert_account(&mut tx).await;
        let veteran = insert_account(&mut tx).await;
        (&mut tx)
            .execute::<All>(
                "UPDATE account SET created_at = now() - interval '8 days' WHERE uuid = $1"
                    .to_string(),
                vec![Value::Uuid(veteran.into_inner())],
            )
            .await
            .expect("backdate the account");

        let shelf = Collection::create(
            &mut tx,
            owner,
            CollectionInsert {
                name: text("Binder"),
                description: text(""),
                color: text("lime"),
                icon: text("box"),
                deck: None,
                visibility: Visibility::Private,
            },
        )
        .await
        .expect("create the collection");
        add_cards(&mut tx, shelf.uuid, &[3, 2]).await;

        let public = create_deck(&mut tx, owner, Visibility::Public).await;
        create_deck(&mut tx, veteran, Visibility::Private).await;
        let sleeves = Deck::attach_collection(&mut tx, owner, public.uuid)
            .await
            .expect("attach a collection")
            .granted()
            .expect("the deck is the owner's");
        add_cards(&mut tx, sleeves.uuid, &[4]).await;

        let open = create_session(&mut tx, owner).await;
        create_session(&mut tx, owner).await;
        ScannerSessionEntry::create(
            &mut tx,
            open.uuid,
            ScannerSessionEntryInsert {
                printing: Uuid::new_v4(),
                quantity: 1,
                finish: CardFinish::Foil,
                signed: false,
                purchase_price_cents: None,
            },
        )
        .await
        .expect("scan a card");

        create_tournament(&mut tx, owner).await;
        let finished = create_tournament(&mut tx, veteran).await;
        (&mut tx)
            .execute::<All>(
                "UPDATE tournament SET state = 'Finished' WHERE uuid = $1".to_string(),
                vec![Value::Uuid(finished.uuid.into_inner())],
            )
            .await
            .expect("finish the tournament");

        let after = StatisticsSnapshot::take(&mut tx)
            .await
            .expect("take a snapshot");
        let rows = (&mut tx)
            .execute::<All>(
                "SELECT count(*) AS total FROM account".to_string(),
                Vec::new(),
            )
            .await
            .expect("count the accounts");
        let total: i64 = rows[0].get("total").expect("read the count");
        tx.rollback().await.expect("roll back");

        assert_eq!(after.accounts, total - 1, "the tombstone is not counted");
        assert_eq!(after.accounts - before.accounts, 2);
        assert_eq!(after.new_accounts - before.new_accounts, 1);
        assert_eq!(after.collections - before.collections, 1);
        assert_eq!(after.decks - before.decks, 2);
        assert_eq!(after.public_decks - before.public_decks, 1);
        assert_eq!(after.cards - before.cards, 9);
        assert_eq!(
            after.open_scanner_sessions - before.open_scanner_sessions,
            1
        );
        assert_eq!(after.tournaments - before.tournaments, 2);
        assert_eq!(after.finished_tournaments - before.finished_tournaments, 1);
        assert!(after.taken_at >= before.taken_at);
    });
}

#[test]
fn an_admin_sees_the_newest_snapshot_and_the_last_30_days() {
    run(async {
        let admin = create_account(Role::Admin).await;

        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        let old = StatisticsSnapshot::take(&mut tx)
            .await
            .expect("take a snapshot");
        (&mut tx)
            .execute::<All>(
                "UPDATE statistics_snapshot SET taken_at = now() - interval '31 days' \
                 WHERE uuid = $1"
                    .to_string(),
                vec![Value::Uuid(old.uuid)],
            )
            .await
            .expect("backdate the snapshot");
        let recent = StatisticsSnapshot::take(&mut tx)
            .await
            .expect("take a snapshot");
        tx.commit().await.expect("commit");

        let body = TestClient::logged_in(&admin)
            .await
            .get(&api("admin/statistics"))
            .await
            .ok_json();

        let history = body["history"].as_array().expect("a list");
        let uuids: Vec<&str> = history
            .iter()
            .map(|snapshot| snapshot["uuid"].as_str().expect("a uuid"))
            .collect();
        assert!(uuids.contains(&recent.uuid.to_string().as_str()));
        assert!(!uuids.contains(&old.uuid.to_string().as_str()));
        assert_eq!(body["newest"]["accounts"], recent.accounts);
        assert_eq!(body["newest"]["tournaments"], recent.tournaments);
        assert_eq!(
            body["newest"]["finished_tournaments"],
            recent.finished_tournaments
        );
        assert!(body["newest"]["taken_at"].is_string());
    });
}
