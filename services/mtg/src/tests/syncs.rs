//! Sync runs and the admin sync status

use anyhow::anyhow;
use galvyn::core::Module;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Database;
use tokio::sync::Mutex;
use tokio::sync::MutexGuard;
use tokio::time::sleep;

use crate::models::account::Role;
use crate::models::sync_run::NewSyncRun;
use crate::models::sync_run::SyncKind;
use crate::models::sync_run::SyncRun;
use crate::models::sync_run::SyncRunOutcome;
use crate::tests::harness::App;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::utils::catalog_sync::SyncOutcome;
use crate::utils::catalog_sync::SyncReport;
use crate::utils::price_sync::PriceOutcome;
use crate::utils::price_sync::PriceReport;

/// Sync runs are service-wide, so tests that write them take turns
async fn exclusive() -> MutexGuard<'static, ()> {
    static SYNC_RUNS: Mutex<()> = Mutex::const_new(());
    App::get().await;
    SYNC_RUNS.lock().await
}

async fn status() -> serde_json::Value {
    let admin = create_account(Role::Admin).await;
    TestClient::logged_in(&admin)
        .await
        .get(&api("admin/syncs"))
        .await
        .ok_json()
}

#[test]
fn an_admin_sees_the_last_run_of_each_sync() {
    run(async {
        let _turn = exclusive().await;

        SyncRun::track(Database::global(), SyncKind::Catalog, async {
            Ok(SyncOutcome::Synced(SyncReport::default()))
        })
        .await
        .expect("the sync succeeds");
        SyncRun::track(Database::global(), SyncKind::PriceGuide, async {
            Ok(PriceOutcome::Unchanged {
                etag: "etag".to_string(),
            })
        })
        .await
        .expect("the sync succeeds");

        let body = status().await;
        let catalog = &body["catalog"]["runs"];
        assert_eq!(catalog["last_attempt"]["outcome"], "Synced");
        assert_eq!(catalog["last_success"], catalog["last_attempt"]);
        let price_guide = &body["price_guide"]["runs"];
        assert_eq!(price_guide["last_attempt"]["outcome"], "Unchanged");
        assert_eq!(price_guide["last_success"], price_guide["last_attempt"]);
    });
}

#[test]
fn a_failed_run_is_stored_with_its_error() {
    run(async {
        let _turn = exclusive().await;

        let result = SyncRun::track(Database::global(), SyncKind::Catalog, async {
            Err::<SyncOutcome, _>(
                anyhow!("503 Service Unavailable").context("fetch the bulk index"),
            )
        })
        .await;
        assert!(result.is_err(), "the sync's own error is returned");

        let body = status().await;
        let runs = &body["catalog"]["runs"];
        assert_eq!(runs["last_attempt"]["outcome"], "Failed");
        assert_eq!(
            runs["last_attempt"]["error"],
            "fetch the bulk index: 503 Service Unavailable"
        );
        assert_eq!(runs["last_failure"], runs["last_attempt"]);
        assert_ne!(runs["last_success"], runs["last_attempt"]);
    });
}

#[test]
fn a_long_error_is_cut_to_fit() {
    run(async {
        let _turn = exclusive().await;

        SyncRun::track(Database::global(), SyncKind::PriceGuide, async {
            Err::<PriceOutcome, _>(anyhow!("ä".repeat(5000)))
        })
        .await
        .expect_err("the sync fails");

        let body = status().await;
        let error = body["price_guide"]["runs"]["last_failure"]["error"]
            .as_str()
            .expect("an error message");
        assert_eq!(error, "ä".repeat(1024));
    });
}

#[test]
fn recent_runs_carry_their_duration() {
    run(async {
        let _turn = exclusive().await;

        SyncRun::track(Database::global(), SyncKind::PriceGuide, async {
            sleep(std::time::Duration::from_millis(30)).await;
            Ok(PriceOutcome::Synced(PriceReport::default()))
        })
        .await
        .expect("the sync succeeds");

        let body = status().await;
        let recent = &body["price_guide"]["runs"]["recent"];
        assert_eq!(recent[0]["outcome"], "Synced");
        assert!(recent[0]["duration_ms"].as_i64().expect("a duration") >= 30);
    });
}

#[test]
fn runs_older_than_90_days_are_removed_by_the_next_run() {
    run(async {
        let _turn = exclusive().await;

        let now = OffsetDateTime::now_utc();
        let old_run = |days| NewSyncRun {
            sync: SyncKind::Catalog,
            started_at: now - Duration::days(days),
            duration_ms: 1,
            outcome: SyncRunOutcome::Unchanged,
            error: None,
        };
        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        let expired = SyncRun::insert(&mut tx, old_run(91))
            .await
            .expect("store a run");
        let kept = SyncRun::insert(&mut tx, old_run(89))
            .await
            .expect("store a run");
        tx.commit().await.expect("commit");

        SyncRun::track(Database::global(), SyncKind::PriceGuide, async {
            Ok(PriceOutcome::Unchanged {
                etag: "etag".to_string(),
            })
        })
        .await
        .expect("the sync succeeds");

        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        let runs: Vec<_> = SyncRun::recent(&mut tx, SyncKind::Catalog, 100_000)
            .await
            .expect("read the runs")
            .into_iter()
            .map(|run| run.uuid)
            .collect();
        tx.commit().await.expect("commit");
        assert!(!runs.contains(&expired));
        assert!(runs.contains(&kept));
    });
}
