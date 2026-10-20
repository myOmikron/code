//! Venues: an account's book of places, which tournaments snapshot rather than reference

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::tournament::TournamentVenueUuid;
use crate::models::tournament::db::TournamentVenueInsertPatch;
use crate::models::tournament::db::TournamentVenueModel;

/// One place an organizer runs events at
#[derive(Debug, Clone)]
pub struct Venue {
    /// Primary key
    pub uuid: TournamentVenueUuid,
    /// Name of the place
    pub name: MaxStr<255>,
    /// Where it is, in the organizer's words
    pub address: Option<MaxStr<512>>,
    /// How to actually get in — "Hinterhof, bitte klingeln" and the like
    pub instructions: Option<MaxStr<1024>>,
}

/// Lowercase, trim and collapse a venue name into the book's lookup key
fn normalize_name(name: &str) -> MaxStr<255> {
    let mut normalized = String::with_capacity(name.len());
    for word in name.split_whitespace() {
        let word = word.to_lowercase();
        let extra = if normalized.is_empty() { 0 } else { 1 };
        if normalized.len() + extra + word.len() > 255 {
            break;
        }
        if !normalized.is_empty() {
            normalized.push(' ');
        }
        normalized.push_str(&word);
    }
    MaxStr::new(normalized)
        .unwrap_or_else(|_| unreachable!("kept under the maximum length by construction"))
}

/// Every venue this account has used, most recently used first
#[instrument(name = "venue::list_for_account", skip(tx))]
pub async fn list_for_account(
    tx: &mut Transaction,
    account: AccountUuid,
) -> Result<Vec<Venue>, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentVenueModel)
        .condition(TournamentVenueModel.owner.equals(account.into_inner()))
        .order_desc(TournamentVenueModel.last_used_at)
        .all()
        .await?;
    Ok(rows.into_iter().map(Venue::from).collect())
}

/// Upsert what an event was just saved with into the account's book; a blank name is a no-op
#[instrument(name = "venue::remember", skip(tx, name, address, instructions))]
pub async fn remember(
    tx: &mut Transaction,
    account: AccountUuid,
    name: &MaxStr<255>,
    address: Option<&MaxStr<512>>,
    instructions: Option<&MaxStr<1024>>,
) -> Result<(), rorm::Error> {
    if name.trim().is_empty() {
        return Ok(());
    }
    let name_normalized = normalize_name(name);
    let now = OffsetDateTime::now_utc();

    // Probe, not catch: Postgres aborts the tx on a unique violation; the caller writes after.
    let existing = rorm::query(&mut *tx, TournamentVenueModel.uuid)
        .condition(rorm::and![
            TournamentVenueModel.owner.equals(account.into_inner()),
            TournamentVenueModel
                .name_normalized
                .equals(&name_normalized),
        ])
        .optional()
        .await?;

    match existing {
        Some(uuid) => {
            rorm::update(&mut *tx, TournamentVenueModel)
                .set(TournamentVenueModel.name, name.clone())
                .set(TournamentVenueModel.address, address.cloned())
                .set(TournamentVenueModel.instructions, instructions.cloned())
                .set(TournamentVenueModel.last_used_at, now)
                .condition(TournamentVenueModel.uuid.equals(uuid))
                .await?;
        }
        None => {
            rorm::insert(&mut *tx, TournamentVenueModel)
                .single(&TournamentVenueInsertPatch {
                    uuid: Uuid::now_v7(),
                    name: name.clone(),
                    name_normalized,
                    address: address.cloned(),
                    instructions: instructions.cloned(),
                    owner: ForeignModelByField(account.into_inner()),
                    last_used_at: now,
                })
                .await?;
        }
    }

    Ok(())
}

/// Drop one entry from the account's book; `false` if no row of this account matched
#[instrument(name = "venue::forget", skip(tx))]
pub async fn forget(
    tx: &mut Transaction,
    account: AccountUuid,
    uuid: TournamentVenueUuid,
) -> Result<bool, rorm::Error> {
    let affected = rorm::delete(&mut *tx, TournamentVenueModel)
        .condition(rorm::and![
            TournamentVenueModel.uuid.equals(uuid.into_inner()),
            TournamentVenueModel.owner.equals(account.into_inner()),
        ])
        .await?;
    Ok(affected > 0)
}

impl From<TournamentVenueModel> for Venue {
    fn from(value: TournamentVenueModel) -> Self {
        Self {
            uuid: TournamentVenueUuid::from_uuid(value.uuid),
            name: value.name,
            address: value.address,
            instructions: value.instructions,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_name;

    #[test]
    fn trims_and_lowercases() {
        assert_eq!(&*normalize_name("  Spielekiste Nord  "), "spielekiste nord");
    }

    #[test]
    fn collapses_inner_whitespace() {
        assert_eq!(&*normalize_name("Spiele   \t Kiste"), "spiele kiste");
    }

    #[test]
    fn reads_a_blank_name_as_empty() {
        assert_eq!(&*normalize_name(""), "");
        assert_eq!(&*normalize_name("   "), "");
    }

    #[test]
    fn lowercases_beyond_ascii() {
        assert_eq!(&*normalize_name("MÜLLER Straße"), "müller straße");
    }

    #[test]
    fn a_name_at_the_boundary_survives() {
        let name = "a".repeat(255);
        assert_eq!(normalize_name(&name).len(), 255);
    }

    #[test]
    fn is_idempotent() {
        let once = normalize_name("Alte   Brauerei");
        let twice = normalize_name(&once);
        assert_eq!(&*once, &*twice);
    }
}
