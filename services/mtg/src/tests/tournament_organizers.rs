//! Co-organizers and handover: the Owner names Accounts to run a Tournament
//! with it and hands it on; Co-organizers do everything but delete it, remove
//! other Co-organizers and hand it on

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournaments;
use crate::tests::tournaments::Fixture;
use crate::tests::tournaments::settings;

/// A private Tournament's Fixture with one Co-organizer the Owner named
struct WithCoOrganizer {
    /// The Owner, its Tournament and a stranger
    fixture: Fixture,
    /// The Co-organizer's Account
    co_organizer_account: TestAccount,
    /// Logged in as the Co-organizer
    co_organizer: TestClient,
}

impl WithCoOrganizer {
    /// A fresh private Tournament with a fresh Co-organizer
    async fn new() -> Self {
        let mut fixture = Fixture::new("Private").await;
        let co_organizer_account = create_account(Role::Member).await;
        let url = organizers_url(&fixture);
        let added = add(&mut fixture.owner, &url, &co_organizer_account.username).await;
        assert_eq!(
            added["username"],
            co_organizer_account.username.as_str(),
            "{added}"
        );
        let co_organizer = TestClient::logged_in(&co_organizer_account).await;
        Self {
            fixture,
            co_organizer_account,
            co_organizer,
        }
    }
}

/// The url of a Tournament's Organizers
pub(super) fn organizers_url(fixture: &Fixture) -> Url {
    api(&format!("tournaments/{}/organizers", fixture.tournament))
}

/// The url of one Co-organizer of a Tournament
fn co_organizer_url(fixture: &Fixture, account: &TestAccount) -> Url {
    api(&format!(
        "tournaments/{}/organizers/{}",
        fixture.tournament,
        account.uuid.into_inner()
    ))
}

/// The url of a Tournament's pending handover
fn handover_url(tournament: &str) -> Url {
    api(&format!("tournaments/{tournament}/handover"))
}

/// Names `username` a Co-organizer at `url`, returning the body
pub(super) async fn add(client: &mut TestClient, url: &Url, username: &str) -> Value {
    client
        .json(Method::POST, url, &json!({ "username": username }))
        .await
        .ok_json()
}

/// Offers the Tournament to `username`, returning the body
pub(super) async fn offer(client: &mut TestClient, tournament: &str, username: &str) -> Value {
    client
        .json(
            Method::PUT,
            &handover_url(tournament),
            &json!({ "username": username }),
        )
        .await
        .ok_json()
}

/// Answers the offer of the Tournament with `answer` (`accept` or `decline`)
async fn answer(client: &mut TestClient, tournament: &str, answer: &str) -> TestResponse {
    let url = api(&format!("tournaments/{tournament}/handover/{answer}"));
    client.json(Method::POST, &url, &json!({})).await
}

/// The usernames of the Co-organizers in a list of Organizers
pub(super) fn co_organizer_names(body: &Value) -> Vec<String> {
    body["co_organizers"]
        .as_array()
        .expect("a list of co-organizers")
        .iter()
        .map(|organizer| {
            organizer["username"]
                .as_str()
                .expect("username")
                .to_string()
        })
        .collect()
}

/// The uuids in a list of Tournaments
fn uuids(body: &Value) -> Vec<String> {
    body["tournaments"]
        .as_array()
        .expect("a list of tournaments")
        .iter()
        .map(|tournament| tournament["uuid"].as_str().expect("uuid").to_string())
        .collect()
}

#[test]
fn a_co_organizer_sees_a_private_tournament_and_edits_it() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let url = setup.fixture.url();

        let read = setup.co_organizer.get(&url).await.ok_json();
        assert_eq!(read["organizer_role"], "CoOrganizer", "{read}");

        let mut changed = settings("Private");
        changed["name"] = json!("Saturday Pauper");
        let updated = setup
            .co_organizer
            .json(Method::PUT, &url, &changed)
            .await
            .ok_json();
        assert_eq!(updated["name"], "Saturday Pauper", "{updated}");
        assert_eq!(updated["organizer_role"], "CoOrganizer", "{updated}");
    });
}

#[test]
fn every_organizer_reads_the_organizers_and_strangers_do_not() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let url = organizers_url(&setup.fixture);

        for client in [&mut setup.fixture.owner, &mut setup.co_organizer] {
            let body = client.get(&url).await.ok_json();
            assert_eq!(
                body["owner"]["username"],
                setup.fixture.owner_account.username.as_str(),
                "{body}"
            );
            assert_eq!(
                co_organizer_names(&body),
                vec![setup.co_organizer_account.username.clone()],
                "{body}"
            );
            assert_eq!(body["handover"], Value::Null, "{body}");
        }
        let response = setup.fixture.stranger.get(&url).await;
        assert_eq!(response.status.as_u16(), 400, "{response:?}");
    });
}

#[test]
fn a_co_organizer_names_further_co_organizers() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let url = organizers_url(&setup.fixture);
        let third = create_account(Role::Member).await;

        add(&mut setup.co_organizer, &url, &third.username).await;

        let body = setup.fixture.owner.get(&url).await.ok_json();
        assert!(
            co_organizer_names(&body).contains(&third.username),
            "{body}"
        );
    });
}

#[test]
fn naming_refuses_unknown_usernames_the_owner_and_co_organizers_named_already() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let url = organizers_url(&setup.fixture);

        let unknown = add(&mut setup.fixture.owner, &url, "nobody-by-this-name").await;
        assert_eq!(unknown["result"], "Err", "{unknown}");
        assert_eq!(unknown["error"]["unknown_username"], true, "{unknown}");

        let owner_name = setup.fixture.owner_account.username.clone();
        let owner = add(&mut setup.co_organizer, &url, &owner_name).await;
        assert_eq!(owner["result"], "Err", "{owner}");
        assert_eq!(owner["error"]["owner"], true, "{owner}");

        let twice_name = setup.co_organizer_account.username.clone();
        let twice = add(&mut setup.fixture.owner, &url, &twice_name).await;
        assert_eq!(twice["result"], "Err", "{twice}");
        assert_eq!(twice["error"]["already_co_organizer"], true, "{twice}");
    });
}

#[test]
fn a_co_organizer_neither_deletes_nor_hands_on() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let url = setup.fixture.url();
        let somebody = create_account(Role::Member).await;

        let deleting = setup
            .co_organizer
            .json(Method::DELETE, &url, &json!({}))
            .await;
        assert_eq!(deleting.status.as_u16(), 400, "{deleting:?}");

        let offering = setup
            .co_organizer
            .json(
                Method::PUT,
                &handover_url(&setup.fixture.tournament),
                &json!({ "username": somebody.username }),
            )
            .await;
        assert_eq!(offering.status.as_u16(), 400, "{offering:?}");

        assert!(setup.fixture.owner.get(&url).await.status.is_success());
    });
}

#[test]
fn a_co_organizer_removes_itself_but_no_other_co_organizer() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let url = organizers_url(&setup.fixture);
        let other_account = create_account(Role::Member).await;
        add(&mut setup.fixture.owner, &url, &other_account.username).await;

        let other = co_organizer_url(&setup.fixture, &other_account);
        let refused = setup
            .co_organizer
            .json(Method::DELETE, &other, &json!({}))
            .await;
        assert_eq!(refused.status.as_u16(), 400, "{refused:?}");

        let itself = co_organizer_url(&setup.fixture, &setup.co_organizer_account);
        setup
            .co_organizer
            .json(Method::DELETE, &itself, &json!({}))
            .await
            .ok_json();

        let body = setup.fixture.owner.get(&url).await.ok_json();
        assert_eq!(
            co_organizer_names(&body),
            vec![other_account.username.clone()],
            "{body}"
        );
        let gone = setup.co_organizer.get(&setup.fixture.url()).await;
        assert_eq!(gone.status.as_u16(), 400, "{gone:?}");
    });
}

#[test]
fn the_owner_removes_a_co_organizer() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let removed = co_organizer_url(&setup.fixture, &setup.co_organizer_account);

        setup
            .fixture
            .owner
            .json(Method::DELETE, &removed, &json!({}))
            .await
            .ok_json();

        let body = setup
            .fixture
            .owner
            .get(&organizers_url(&setup.fixture))
            .await
            .ok_json();
        assert!(co_organizer_names(&body).is_empty(), "{body}");
        let refused = setup
            .co_organizer
            .json(Method::PUT, &setup.fixture.url(), &settings("Private"))
            .await;
        assert_eq!(refused.status.as_u16(), 400, "{refused:?}");
    });
}

#[test]
fn a_handover_takes_effect_only_on_acceptance() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let heir_account = create_account(Role::Member).await;
        let mut heir = TestClient::logged_in(&heir_account).await;

        let offered = offer(
            &mut fixture.owner,
            &fixture.tournament,
            &heir_account.username,
        )
        .await;
        assert_eq!(
            offered["username"],
            heir_account.username.as_str(),
            "{offered}"
        );

        let before = fixture.as_owner().await;
        assert_eq!(before["organizer_role"], "Owner", "{before}");
        let organizers = fixture.owner.get(&organizers_url(&fixture)).await.ok_json();
        assert_eq!(
            organizers["handover"]["username"],
            heir_account.username.as_str(),
            "{organizers}"
        );

        let read = heir.get(&fixture.url()).await.ok_json();
        assert_eq!(read["organizer_role"], Value::Null, "{read}");
        let offers = heir.get(&api("tournaments/handovers")).await.ok_json();
        assert_eq!(uuids(&offers), vec![fixture.tournament.clone()], "{offers}");
        let editing = heir
            .json(Method::PUT, &fixture.url(), &settings("Private"))
            .await;
        assert_eq!(editing.status.as_u16(), 400, "{editing:?}");
    });
}

#[test]
fn accepting_makes_the_heir_owner_and_the_former_owner_a_co_organizer() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let heir_account = create_account(Role::Member).await;
        let mut heir = TestClient::logged_in(&heir_account).await;
        offer(
            &mut fixture.owner,
            &fixture.tournament,
            &heir_account.username,
        )
        .await;

        let accepted = answer(&mut heir, &fixture.tournament, "accept")
            .await
            .ok_json();
        assert_eq!(accepted["organizer_role"], "Owner", "{accepted}");
        assert_eq!(
            accepted["owner"],
            heir_account.username.as_str(),
            "{accepted}"
        );

        let former = fixture.as_owner().await;
        assert_eq!(former["organizer_role"], "CoOrganizer", "{former}");
        let organizers = heir.get(&organizers_url(&fixture)).await.ok_json();
        assert_eq!(
            co_organizer_names(&organizers),
            vec![fixture.owner_account.username.clone()],
            "{organizers}"
        );
        assert_eq!(organizers["handover"], Value::Null, "{organizers}");
        let offers = heir.get(&api("tournaments/handovers")).await.ok_json();
        assert!(uuids(&offers).is_empty(), "{offers}");

        let deleting = fixture
            .owner
            .json(Method::DELETE, &fixture.url(), &json!({}))
            .await;
        assert_eq!(deleting.status.as_u16(), 400, "{deleting:?}");
    });
}

#[test]
fn a_co_organizer_taking_over_is_no_longer_one() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;
        let heir_name = setup.co_organizer_account.username.clone();
        offer(
            &mut setup.fixture.owner,
            &setup.fixture.tournament,
            &heir_name,
        )
        .await;

        answer(&mut setup.co_organizer, &setup.fixture.tournament, "accept")
            .await
            .ok_json();

        let organizers = setup
            .co_organizer
            .get(&organizers_url(&setup.fixture))
            .await
            .ok_json();
        assert_eq!(
            organizers["owner"]["username"],
            heir_name.as_str(),
            "{organizers}"
        );
        assert_eq!(
            co_organizer_names(&organizers),
            vec![setup.fixture.owner_account.username.clone()],
            "{organizers}"
        );
    });
}

#[test]
fn declining_leaves_everything_as_it_was() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let heir_account = create_account(Role::Member).await;
        let mut heir = TestClient::logged_in(&heir_account).await;
        offer(
            &mut fixture.owner,
            &fixture.tournament,
            &heir_account.username,
        )
        .await;

        answer(&mut heir, &fixture.tournament, "decline")
            .await
            .ok_json();

        let after = fixture.as_owner().await;
        assert_eq!(after["organizer_role"], "Owner", "{after}");
        let organizers = fixture.owner.get(&organizers_url(&fixture)).await.ok_json();
        assert_eq!(organizers["handover"], Value::Null, "{organizers}");
        assert!(co_organizer_names(&organizers).is_empty(), "{organizers}");
        let gone = heir.get(&fixture.url()).await;
        assert_eq!(gone.status.as_u16(), 400, "{gone:?}");
        let late = answer(&mut heir, &fixture.tournament, "accept").await;
        assert_eq!(late.status.as_u16(), 400, "{late:?}");
    });
}

#[test]
fn only_the_account_offered_accepts_and_a_withdrawn_offer_is_gone() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let heir_account = create_account(Role::Member).await;
        let mut heir = TestClient::logged_in(&heir_account).await;
        offer(
            &mut fixture.owner,
            &fixture.tournament,
            &heir_account.username,
        )
        .await;

        let stranger = answer(&mut fixture.stranger, &fixture.tournament, "accept").await;
        assert_eq!(stranger.status.as_u16(), 400, "{stranger:?}");

        fixture
            .owner
            .json(
                Method::DELETE,
                &handover_url(&fixture.tournament),
                &json!({}),
            )
            .await
            .ok_json();
        let withdrawn = answer(&mut heir, &fixture.tournament, "accept").await;
        assert_eq!(withdrawn.status.as_u16(), 400, "{withdrawn:?}");
        assert_eq!(fixture.as_owner().await["organizer_role"], "Owner");
    });
}

#[test]
fn a_new_offer_replaces_the_pending_one() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let first_account = create_account(Role::Member).await;
        let second_account = create_account(Role::Member).await;
        let mut first = TestClient::logged_in(&first_account).await;
        offer(
            &mut fixture.owner,
            &fixture.tournament,
            &first_account.username,
        )
        .await;

        offer(
            &mut fixture.owner,
            &fixture.tournament,
            &second_account.username,
        )
        .await;

        let refused = answer(&mut first, &fixture.tournament, "accept").await;
        assert_eq!(refused.status.as_u16(), 400, "{refused:?}");
        let mut second = TestClient::logged_in(&second_account).await;
        answer(&mut second, &fixture.tournament, "accept")
            .await
            .ok_json();
    });
}

#[test]
fn offering_refuses_unknown_usernames_and_the_owner_itself() {
    run(async {
        let mut fixture = Fixture::new("Private").await;

        let unknown = offer(
            &mut fixture.owner,
            &fixture.tournament,
            "nobody-by-this-name",
        )
        .await;
        assert_eq!(unknown["result"], "Err", "{unknown}");
        assert_eq!(unknown["error"]["unknown_username"], true, "{unknown}");

        let own_name = fixture.owner_account.username.clone();
        let own = offer(&mut fixture.owner, &fixture.tournament, &own_name).await;
        assert_eq!(own["result"], "Err", "{own}");
        assert_eq!(own["error"]["own_account"], true, "{own}");
    });
}

#[test]
fn a_co_organizer_finds_the_tournament_among_the_ones_it_organizes() {
    run(async {
        let mut setup = WithCoOrganizer::new().await;

        let mine = setup
            .co_organizer
            .get(&api("tournaments/mine"))
            .await
            .ok_json();
        assert_eq!(
            tournaments::uuids(&mine["organizing"]),
            vec![setup.fixture.tournament.clone()],
            "{mine}"
        );

        let itself = co_organizer_url(&setup.fixture, &setup.co_organizer_account);
        setup
            .co_organizer
            .json(Method::DELETE, &itself, &json!({}))
            .await
            .ok_json();
        let after = setup
            .co_organizer
            .get(&api("tournaments/mine"))
            .await
            .ok_json();
        assert!(
            tournaments::uuids(&after["organizing"]).is_empty(),
            "{after}"
        );
    });
}
