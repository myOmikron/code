//! Utility module to allow importing data from JSON strings

use std::collections::HashMap;
use std::error::Error;
use std::str::FromStr;
use std::sync::Arc;

use bcrypt::HashParts;
use galvyn::core::Module;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModelByField;
use serde::Deserialize;
use tracing::info;
use tracing::warn;

use crate::models::account::ClubAccount;
use crate::models::account::CreateManualClubMember;
use crate::models::club::Club;
use crate::models::club::ClubUuid;
use crate::modules::mailcow::Mailcow;

/// Import users from a JSON payload
///
/// All clubs must exist for every user that is imported through this endpoint.
/// If a user that should be imported here can not be matched to an existing club,
/// the import is aborted.
///
/// It expects the galvyn registry to be available with Database and Mailcow modules.
pub async fn import_data(body: ImportBody) -> Result<(), Box<dyn Error>> {
    let mut tx = Database::global().start_transaction().await?;
    let clubs = Club::find_all(&mut tx).await?;

    info!("Validating input data...");
    validate_club_members(&body.members, &clubs, &mut tx).await?;

    info!("Preparing import of {} new users...", body.members.len());
    let new_accounts = prepare_db_import(&body.members, &clubs, &mut tx).await?;

    // Committing the transaction here is required due to the implementation of the
    // app_password worker, simply hope for the best and that all jobs complete
    tx.commit().await?;
    info!(
        "Imported {} new accounts, now preparing mailcow app password setup, do not quit...",
        new_accounts.values().map(|v| v.len()).sum::<usize>()
    );

    setup_mailcow_app_passwords(&new_accounts, &clubs).await?;
    info!("Completed import");
    Ok(())
}

/// Ensure no duplicate usernames or email addresses across all existing members
/// (it would still break later if collided with the name of a superadmin)
async fn validate_club_members(
    new_members: &[ImportUser],
    clubs: &[Club],
    tx: &mut Transaction,
) -> Result<(), Box<dyn Error>> {
    for club in clubs {
        let members = club
            .members_page(&mut *tx, u32::MAX as u64, 0, None)
            .await?
            .items;

        let mut email_taken = vec![];
        let mut username_taken = vec![];
        for club_member in &members {
            for new_member in new_members {
                if club_member.email == new_member.email {
                    email_taken.push(club_member.email.clone());
                }
                if club_member.username == new_member.username {
                    username_taken.push(club_member.username.clone());
                }
            }
        }

        if !email_taken.is_empty() {
            return Err(format!(
                "Club {} has some emails already taken: {:?}",
                club.name,
                email_taken.join(", ")
            )
            .into());
        }
        if !username_taken.is_empty() {
            return Err(format!(
                "Club {} has some usernames already taken: {:?}",
                club.name,
                username_taken.join(", ")
            )
            .into());
        }
    }
    Ok(())
}

/// Create the new member accounts in the database with some additional
/// validation, but without committing the transaction. The result is a map
/// of clubs and newly created members in that club.
async fn prepare_db_import(
    new_members: &[ImportUser],
    clubs: &[Club],
    tx: &mut Transaction,
) -> Result<HashMap<ClubUuid, Vec<ClubAccount>>, Box<dyn Error>> {
    // Create the accounts and track each club individually
    let mut new_accounts = HashMap::new();
    for new_member in new_members {
        // Ensure the domain exists
        let domain = match new_member.email.rsplit_once("@") {
            None => {
                return Err(format!(
                    "Malformed email '{}' for user {}",
                    new_member.email, new_member.username
                )
                .into());
            }
            Some((_, domain)) => MaxStr::new(domain.to_string())?,
        };
        let club = match clubs.iter().find(|c| c.primary_domain == domain) {
            None => return Err(format!("No club found for domain: {domain}").into()),
            Some(club) => club,
        };
        new_accounts.entry(club.uuid).or_insert_with(Vec::new);

        // Ensure that passwords are actual bcrypt hashes without the need to verify them
        if HashParts::from_str(new_member.hashed_password.to_string().as_str()).is_err() {
            return Err(format!(
                "User '{}' has password in wrong format, expect bcrypt hash",
                new_member.username
            )
            .into());
        };

        let new_account = ClubAccount::create_raw(
            &mut *tx,
            CreateManualClubMember {
                username: new_member.username.clone(),
                display_name: new_member.display_name.clone(),
                hashed_password: new_member.hashed_password.clone(),
                email: new_member.email.clone(),
                club: ForeignModelByField(club.uuid.0),
            },
        )
        .await
        .map_err(|e| format!("Club {}: user {}: {}", club.name, new_member.username, e))?;
        #[allow(clippy::expect_used)]
        new_accounts
            .get_mut(&club.uuid)
            .expect("previously just created")
            .push(new_account);
    }
    Ok(new_accounts)
}

/// For each newly created account, configure a specific mailcow app password with
/// the plain password of the user so that the login via POP/IMAP/SMTP works with
/// the same password as the web login by default. Note that the password is always
/// hashed (bcrypt), but that mailcow accepts hashed app passwords to make that work.
async fn setup_mailcow_app_passwords(
    new_accounts: &HashMap<ClubUuid, Vec<ClubAccount>>,
    clubs: &[Club],
) -> Result<(), Box<dyn Error>> {
    const MAX_WORKERS: usize = 8;

    // Using a semaphore for limiting max number of concurrent workers
    let mut join_set = tokio::task::JoinSet::new();
    let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_WORKERS));
    for club in clubs {
        if !club.use_xauth {
            for new_account in new_accounts.get(&club.uuid).unwrap_or(&Vec::new()) {
                let semaphore = semaphore.clone();
                let email = new_account.email.clone();
                join_set.spawn(async move {
                    #[allow(clippy::expect_used)]
                    let permit = semaphore.acquire().await.expect("never closed");
                    let handle = Mailcow::global().create_app_password(email.clone());
                    match handle.join().await {
                        Ok(_) => (),
                        Err(e) => warn!(
                            error.display = %e,
                            error.debug = ?e,
                            mailbox = %email,
                            "Failed to complete a job to update app password, continuing anyway..."
                        ),
                    };
                    drop(permit); // automatically, but for clarity
                });
            }
        }
    }

    // Occasionally inform about ongoing/remaining jobs while awaiting all of them
    let total_jobs = join_set.len();
    let mut completed = 0;
    let chunk = (total_jobs / 10).max(1);
    while join_set.join_next().await.is_some() {
        completed += 1;
        if completed % chunk == 0 {
            info!(
                completed = completed,
                total = total_jobs,
                "Waiting for the completion of {} background jobs...",
                total_jobs - completed
            );
        }
    }

    Ok(())
}

/// File format for bulk imports of existing users
#[derive(Debug, Deserialize)]
pub struct ImportBody {
    members: Vec<ImportUser>,
}

#[derive(Debug, Deserialize)]
struct ImportUser {
    username: MaxStr<255>,
    display_name: MaxStr<255>,
    hashed_password: MaxStr<255>,
    email: MaxStr<255>,
}
