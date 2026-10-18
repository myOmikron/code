//! The Admin log, read and written below the HTTP API

use galvyn::core::Module;
use galvyn::rorm::Database;

use crate::models::account::Account;
use crate::models::account::Role;
use crate::models::admin_log::AdminActor;
use crate::models::admin_log::AdminLogAction;
use crate::models::admin_log::AdminLogEntry;
use crate::models::admin_log::AdminLogFilter;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

#[test]
fn a_role_change_from_the_cli_is_logged_without_an_admin() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");

        for _ in 0..2 {
            let account = Account::get_manageable(&mut tx, member.uuid)
                .await
                .expect("look the account up")
                .expect("the account exists");
            Account::change_role(&mut tx, AdminActor::Cli, &account, Role::Admin)
                .await
                .expect("change the role");
        }

        let page = AdminLogEntry::page(
            &mut tx,
            &AdminLogFilter {
                account: Some(member.uuid),
                after: None,
                limit: 10,
            },
        )
        .await
        .expect("read the log");
        tx.commit().await.expect("commit");

        assert_eq!(page.entries.len(), 1, "{:?}", page.entries);
        let entry = &page.entries[0];
        assert_eq!(entry.admin, None);
        assert_eq!(entry.admin_username, "cli");
        assert_eq!(entry.account, Some(member.uuid));
        assert_eq!(
            entry.action,
            AdminLogAction::RoleChange { role: Role::Admin }
        );
    });
}
