//! How an Account's Identity logs in, and the signup decision built on it

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentityUuid;
use galvyn_identity::LoginMethod;
use serde_json::json;

use crate::models::account::Account;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// The Identity `account` references
async fn identity(account: &TestAccount) -> IdentityUuid {
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    let identity = Account::get_by_username(
        &mut tx,
        &Username::new(account.username.clone()).expect("valid username"),
    )
    .await
    .expect("look the account up")
    .expect("the account exists")
    .identity;
    tx.commit().await.expect("commit");
    identity
}

/// Enrolls a Passkey for `account`
async fn enroll_passkey(account: &TestAccount) {
    let identity = identity(account).await;
    IdentityModule::global()
        .enroll_passkey_without_ceremony(
            Database::global(),
            identity,
            MaxStr::new("Phone".to_string()).expect("short label"),
        )
        .await
        .expect("enroll the passkey");
}

/// The login method of `account`'s Identity
async fn login_method(account: &TestAccount) -> Option<LoginMethod> {
    let identity = identity(account).await;
    IdentityModule::global()
        .login_method(Database::global(), identity)
        .await
        .expect("read the login method")
}

#[test]
fn a_fresh_identity_has_no_login_method() {
    run(async {
        let member = create_account(Role::Member).await;

        assert_eq!(login_method(&member).await, None);
    });
}

#[test]
fn an_identity_holding_a_passkey_is_local() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll_passkey(&member).await;

        assert_eq!(login_method(&member).await, Some(LoginMethod::Local));
    });
}

#[test]
fn signing_up_with_a_local_accounts_username_reports_it_taken() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll_passkey(&member).await;

        let body = TestClient::new()
            .json(
                Method::POST,
                &api("auth/signup"),
                &json!({ "username": member.username, "email": "stranger@mtg.test" }),
            )
            .await
            .ok_json();

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["username_taken"], true, "{body}");
    });
}
