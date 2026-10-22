//! Collaborators: other Accounts the owner named on a deck
//!
//! A Collaborator is a Viewer or an Editor. What each of them may do is decided
//! by [`Deck::authorize`], through the [`DeckRole`] its level resolves to.

use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::deck::Deck;
use crate::models::deck::DeckUuid;
use crate::models::deck::access::DeckGrant;
use crate::models::deck::access::DeckRole;
use crate::models::deck::db::DeckCollaboratorInsertPatch;
use crate::models::deck::db::DeckCollaboratorModel;
use crate::models::deck::db::DeckModel;
use crate::models::deck::db::collaborator_key;

/// What the owner lets a Collaborator do with the deck
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum CollaboratorLevel {
    /// Looks at the deck the way its Share link shows it
    Viewer,
    /// Also builds the deck as a decklist
    Editor,
}
custom_db_enum! {
    enum: CollaboratorLevel,
    variants: [Viewer, Editor],
    decoder: CollaboratorLevelDecoder,
}

impl CollaboratorLevel {
    /// The role a Collaborator at this level holds on the deck
    pub fn role(self) -> DeckRole {
        match self {
            Self::Viewer => DeckRole::Viewer,
            Self::Editor => DeckRole::Editor,
        }
    }
}

/// An Account named on a deck
#[derive(Debug, Clone)]
pub struct DeckCollaborator {
    /// The Account
    pub account: AccountUuid,
    /// The Account's username as it is now
    pub username: Username,
    /// What the owner lets it do
    pub level: CollaboratorLevel,
}

/// A deck another Account named the caller on
#[derive(Debug, Clone)]
pub struct SharedDeck {
    /// The deck
    pub deck: Deck,
    /// Its owner's username as it is now
    pub owner_username: Username,
    /// What the owner lets the caller do
    pub level: CollaboratorLevel,
}

impl DeckCollaborator {
    /// Every deck `account` is named on, alphabetically by name
    ///
    /// Only decks other Accounts own: nobody is a Collaborator of their own deck.
    #[instrument(name = "DeckCollaborator::shared_with", skip(tx))]
    pub async fn shared_with(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<SharedDeck>, rorm::Error> {
        let rows = rorm::query(
            &mut *tx,
            (
                DeckCollaboratorModel.deck,
                DeckCollaboratorModel.deck.owner.username,
                DeckCollaboratorModel.level,
            ),
        )
        .condition(DeckCollaboratorModel.account.equals(account.into_inner()))
        .all()
        .await?;
        if rows.is_empty() {
            return Ok(Vec::new());
        }

        let mut named: HashMap<DeckUuid, (Username, CollaboratorLevel)> = rows
            .into_iter()
            .map(|(deck, owner, level)| {
                (
                    DeckUuid::new_from_field(deck),
                    (Username::new_from_field(owner), level),
                )
            })
            .collect();
        let decks = rorm::query(&mut *tx, DeckModel)
            .condition(DynamicCollection::or_unchecked(
                named
                    .keys()
                    .map(|deck| DeckModel.uuid.equals(deck.into_inner()))
                    .collect(),
            ))
            .order_asc(DeckModel.name)
            .order_asc(DeckModel.uuid)
            .all()
            .await?;

        Ok(decks
            .into_iter()
            .map(Deck::from)
            .filter_map(|deck| {
                let (owner_username, level) = named.remove(&deck.uuid)?;
                Some(SharedDeck {
                    deck,
                    owner_username,
                    level,
                })
            })
            .collect())
    }

    /// The level `account` is named on `deck` at, `None` when it is not named on it
    #[instrument(name = "DeckCollaborator::level_of", skip(tx))]
    pub async fn level_of(
        tx: &mut Transaction,
        deck: DeckUuid,
        account: AccountUuid,
    ) -> Result<Option<CollaboratorLevel>, rorm::Error> {
        rorm::query(&mut *tx, DeckCollaboratorModel.level)
            .condition(
                DeckCollaboratorModel
                    .uuid
                    .equals(collaborator_key(deck.into_inner(), account.into_inner())),
            )
            .optional()
            .await
    }

    /// Every Collaborator of the deck a grant is for, alphabetically by username
    #[instrument(name = "DeckCollaborator::get_all", skip(tx))]
    pub async fn get_all(
        tx: &mut Transaction,
        grant: &DeckGrant,
    ) -> Result<Vec<DeckCollaborator>, rorm::Error> {
        let rows = rorm::query(
            &mut *tx,
            (
                DeckCollaboratorModel.account,
                DeckCollaboratorModel.account.username,
                DeckCollaboratorModel.level,
            ),
        )
        .condition(DeckCollaboratorModel.deck.equals(grant.deck().into_inner()))
        .order_asc(DeckCollaboratorModel.account.username_normalized)
        .order_asc(DeckCollaboratorModel.account)
        .all()
        .await?;

        Ok(rows
            .into_iter()
            .map(|(account, username, level)| DeckCollaborator {
                account: AccountUuid::new_from_field(account),
                username: Username::new_from_field(username),
                level,
            })
            .collect())
    }

    /// Name `account` on the deck a grant is for, or change the level it is named at
    #[instrument(name = "DeckCollaborator::put", skip(tx))]
    pub async fn put(
        tx: &mut Transaction,
        grant: &DeckGrant,
        account: AccountUuid,
        level: CollaboratorLevel,
    ) -> Result<(), rorm::Error> {
        let key = collaborator_key(grant.deck().into_inner(), account.into_inner());
        let changed = rorm::update(&mut *tx, DeckCollaboratorModel)
            .set(DeckCollaboratorModel.level, level)
            .condition(DeckCollaboratorModel.uuid.equals(key))
            .await?;
        if changed == 0 {
            rorm::insert(&mut *tx, DeckCollaboratorModel)
                .return_nothing()
                .single(&DeckCollaboratorInsertPatch {
                    uuid: key,
                    deck: ForeignModelByField(grant.deck().into_inner()),
                    account: ForeignModelByField(account.into_inner()),
                    level,
                })
                .await?;
        }
        Ok(())
    }

    /// Take `account` off the deck a grant is for
    ///
    /// Returns `false` when it was not named on it.
    #[instrument(name = "DeckCollaborator::remove", skip(tx))]
    pub async fn remove(
        tx: &mut Transaction,
        grant: &DeckGrant,
        account: AccountUuid,
    ) -> Result<bool, rorm::Error> {
        let removed = rorm::delete(&mut *tx, DeckCollaboratorModel)
            .condition(DeckCollaboratorModel.uuid.equals(collaborator_key(
                grant.deck().into_inner(),
                account.into_inner(),
            )))
            .await?;
        Ok(removed > 0)
    }

    /// Take every Collaborator off `decks`
    ///
    /// For decks changing hands, whose Collaborators were named by the owner
    /// they leave.
    #[instrument(name = "DeckCollaborator::remove_all", skip(tx))]
    pub(in crate::models::deck) async fn remove_all(
        tx: &mut Transaction,
        decks: &[DeckUuid],
    ) -> Result<(), rorm::Error> {
        if decks.is_empty() {
            return Ok(());
        }
        rorm::delete(&mut *tx, DeckCollaboratorModel)
            .condition(DynamicCollection::or_unchecked(
                decks
                    .iter()
                    .map(|deck| DeckCollaboratorModel.deck.equals(deck.into_inner()).boxed())
                    .collect(),
            ))
            .await?;
        Ok(())
    }
}

impl Deck {
    /// The role `account` holds on this deck, `None` when it holds none
    #[instrument(name = "Deck::role_of", skip(tx, self), fields(deck = ?self.uuid))]
    pub async fn role_of(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Option<DeckRole>, rorm::Error> {
        resolve(tx, self.uuid, self.owner, account).await
    }
}

/// The role `account` holds on `deck`, which `owner` owns
pub(in crate::models::deck) async fn resolve(
    tx: &mut Transaction,
    deck: DeckUuid,
    owner: AccountUuid,
    account: AccountUuid,
) -> Result<Option<DeckRole>, rorm::Error> {
    if owner == account {
        return Ok(Some(DeckRole::Owner));
    }
    let level = DeckCollaborator::level_of(tx, deck, account).await?;
    Ok(level.map(CollaboratorLevel::role))
}
