//! Who may do what to a deck
//!
//! Every deck operation is a [`DeckOperation`], and each one needs a
//! [`DeckClass`]: reading the deck, editing it as a decklist, or acting as its
//! owner. [`Deck::authorize`] resolves the caller's [`DeckRole`] on the deck and
//! grants the operation when that role covers its class.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::deck::Deck;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckUuid;
use crate::models::deck::collaborator::resolve;
use crate::models::deck::db::DeckModel;

/// What an operation needs of the caller's [`DeckRole`]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum DeckClass {
    /// Looking at the deck: its list, cards, tags and statistics
    Read,
    /// Changing the deck as a decklist
    Edit,
    /// Anything about the owner's shelf, and who else may see the deck
    Owner,
}

/// The caller's standing on one deck
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum DeckRole {
    /// The account the deck belongs to
    Owner,
    /// A Collaborator who helps build the deck
    Editor,
    /// A Collaborator who only looks at the deck
    Viewer,
}

impl DeckRole {
    /// Whether this role may perform operations of `class`
    pub fn permits(self, class: DeckClass) -> bool {
        match self {
            Self::Owner => true,
            Self::Editor => class != DeckClass::Owner,
            Self::Viewer => class == DeckClass::Read,
        }
    }
}

/// Every operation on one deck, as the access check sees it
///
/// Reading the deck itself is not among them: who may see a deck is decided by
/// [`Deck::get_visible`], which a public deck passes for everybody.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum DeckOperation {
    /// Read the deck's cards and the tags offered on it
    ListCards,
    /// Read who collaborates on the deck and at which level
    ListCollaborators,
    /// Take oneself off the deck as a Collaborator
    LeaveDeck,
    /// Rename the deck, change its description or format
    UpdateDeck,
    /// Overrule which colours the deck may play
    SetColors,
    /// Claim a Commander bracket
    SetBracket,
    /// Record the house rules the deck is played under
    SetRuleZero,
    /// Read the advisor settings
    ReadAdvisorSettings,
    /// Replace the advisor settings
    SetAdvisorSettings,
    /// Put a card into the deck
    AddCard,
    /// Write a whole decklist into the deck
    ImportCards,
    /// Change a Deck entry, swapping it for another card included
    UpdateCard,
    /// Take a card out of the deck
    DeleteCard,
    /// Create a tag on the deck, see [`DeckGrant::may_change_global_tags`]
    CreateTag,
    /// Change a tag on the deck
    UpdateTag,
    /// Delete a tag on the deck
    DeleteTag,
    /// Put a tag on a card of the deck
    AssignTag,
    /// Take a tag off a card of the deck
    UnassignTag,
    /// Change who may see the deck
    SetVisibility,
    /// Mint a fresh secret for the deck's Share link
    RotateShareToken,
    /// File the deck into a folder
    SetFolder,
    /// Start keeping the deck's own collection
    AttachCollection,
    /// Stop keeping the deck's own collection
    DetachCollection,
    /// Read where the deck's cards could come from
    ReadSourcing,
    /// Read where the list and the deck's own collection disagree
    ReadDrift,
    /// Move copies out of a collection and into the deck
    TakeCards,
    /// Declare that the deck holds what its list asks for
    FillCollection,
    /// Sort copies out of the deck back into a collection
    ReturnCards,
    /// Delete the deck
    DeleteDeck,
    /// Read the Deck history
    ReadHistory,
    /// Undo, redo, reset or name a Deck checkpoint
    ChangeHistory,
    /// Name, change or remove the deck's Collaborators
    ManageCollaborators,
}

impl DeckOperation {
    /// The class of access this operation needs
    pub fn class(self) -> DeckClass {
        match self {
            Self::ListCards | Self::ListCollaborators | Self::LeaveDeck => DeckClass::Read,

            Self::UpdateDeck
            | Self::SetColors
            | Self::SetBracket
            | Self::SetRuleZero
            | Self::ReadAdvisorSettings
            | Self::SetAdvisorSettings
            | Self::AddCard
            | Self::ImportCards
            | Self::UpdateCard
            | Self::DeleteCard
            | Self::CreateTag
            | Self::UpdateTag
            | Self::DeleteTag
            | Self::AssignTag
            | Self::UnassignTag => DeckClass::Edit,

            Self::SetVisibility
            | Self::RotateShareToken
            | Self::SetFolder
            | Self::AttachCollection
            | Self::DetachCollection
            | Self::ReadSourcing
            | Self::ReadDrift
            | Self::TakeCards
            | Self::FillCollection
            | Self::ReturnCards
            | Self::DeleteDeck
            | Self::ReadHistory
            | Self::ChangeHistory
            | Self::ManageCollaborators => DeckClass::Owner,
        }
    }
}

/// Proof that the caller may perform an operation on a deck
///
/// Only [`Deck::authorize`] hands one out.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct DeckGrant {
    deck: DeckUuid,
    owner: AccountUuid,
    role: DeckRole,
}

impl DeckGrant {
    /// The deck the grant is for
    pub fn deck(&self) -> DeckUuid {
        self.deck
    }

    /// The account the deck belongs to, whoever the caller is
    ///
    /// What the owner-scoped mutators take: a change a Collaborator makes is
    /// made to the owner's deck.
    pub fn owner(&self) -> AccountUuid {
        self.owner
    }

    /// The caller's role on the deck
    pub fn role(&self) -> DeckRole {
        self.role
    }

    /// The proxy flag the caller's request may set, `None` to leave it alone
    ///
    /// Whether a copy is a proxy is about the owner's shelf, so only the owner
    /// sets it. A Collaborator's request leaves it as it is, and a Deck entry it
    /// opens is no proxy.
    pub fn proxy(&self, requested: Option<bool>) -> Option<bool> {
        match self.role {
            DeckRole::Owner => requested,
            DeckRole::Editor | DeckRole::Viewer => None,
        }
    }

    /// Whether the caller may create, change, delete or assign global tags
    ///
    /// A global tag and its card-wide assignments reach every deck of the
    /// owner, so only the owner touches them. A Collaborator's tag operations
    /// are limited to the deck-local tags of the deck the grant is for.
    pub fn may_change_global_tags(&self) -> bool {
        self.role == DeckRole::Owner
    }
}

impl Deck {
    /// Check whether `account` may perform `operation` on a deck
    ///
    /// [`DeckAccess::Denied`] covers a missing deck and a refused operation
    /// alike, so a refusal tells nobody which decks exist.
    #[instrument(name = "Deck::authorize", skip(tx))]
    pub async fn authorize(
        tx: &mut Transaction,
        deck: DeckUuid,
        account: AccountUuid,
        operation: DeckOperation,
    ) -> Result<DeckAccess<DeckGrant>, rorm::Error> {
        let owner = rorm::query(&mut *tx, DeckModel.owner)
            .condition(DeckModel.uuid.equals(deck.into_inner()))
            .optional()
            .await?;
        let Some(owner) = owner.map(AccountUuid::new_from_field) else {
            return Ok(DeckAccess::Denied);
        };

        Ok(match resolve(&mut *tx, deck, owner, account).await? {
            Some(role) if role.permits(operation.class()) => {
                DeckAccess::Granted(DeckGrant { deck, owner, role })
            }
            _ => DeckAccess::Denied,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_may_do_everything() {
        assert!(DeckRole::Owner.permits(DeckClass::Read));
        assert!(DeckRole::Owner.permits(DeckClass::Edit));
        assert!(DeckRole::Owner.permits(DeckClass::Owner));
    }

    #[test]
    fn editor_reads_and_edits_but_never_acts_as_owner() {
        assert!(DeckRole::Editor.permits(DeckClass::Read));
        assert!(DeckRole::Editor.permits(DeckClass::Edit));
        assert!(!DeckRole::Editor.permits(DeckClass::Owner));
    }

    #[test]
    fn viewer_only_reads() {
        assert!(DeckRole::Viewer.permits(DeckClass::Read));
        assert!(!DeckRole::Viewer.permits(DeckClass::Edit));
        assert!(!DeckRole::Viewer.permits(DeckClass::Owner));
    }

    #[test]
    fn any_collaborator_reads_the_collaborator_list_and_leaves() {
        assert_eq!(DeckOperation::ListCollaborators.class(), DeckClass::Read);
        assert_eq!(DeckOperation::LeaveDeck.class(), DeckClass::Read);
    }

    #[test]
    fn the_owners_shelf_is_owner_only() {
        for operation in [
            DeckOperation::SetVisibility,
            DeckOperation::RotateShareToken,
            DeckOperation::SetFolder,
            DeckOperation::AttachCollection,
            DeckOperation::DetachCollection,
            DeckOperation::ReadSourcing,
            DeckOperation::ReadDrift,
            DeckOperation::TakeCards,
            DeckOperation::FillCollection,
            DeckOperation::ReturnCards,
            DeckOperation::DeleteDeck,
            DeckOperation::ReadHistory,
            DeckOperation::ChangeHistory,
            DeckOperation::ManageCollaborators,
        ] {
            assert_eq!(operation.class(), DeckClass::Owner, "{operation:?}");
        }
    }

    #[test]
    fn the_decklist_is_edited() {
        for operation in [
            DeckOperation::UpdateDeck,
            DeckOperation::SetColors,
            DeckOperation::SetBracket,
            DeckOperation::SetRuleZero,
            DeckOperation::ReadAdvisorSettings,
            DeckOperation::SetAdvisorSettings,
            DeckOperation::AddCard,
            DeckOperation::ImportCards,
            DeckOperation::UpdateCard,
            DeckOperation::DeleteCard,
        ] {
            assert_eq!(operation.class(), DeckClass::Edit, "{operation:?}");
        }
    }

    #[test]
    fn tags_are_edited() {
        for operation in [
            DeckOperation::CreateTag,
            DeckOperation::UpdateTag,
            DeckOperation::DeleteTag,
            DeckOperation::AssignTag,
            DeckOperation::UnassignTag,
        ] {
            assert_eq!(operation.class(), DeckClass::Edit, "{operation:?}");
        }
    }

    fn grant(role: DeckRole) -> DeckGrant {
        DeckGrant {
            deck: DeckUuid::from_uuid(uuid::Uuid::new_v4()),
            owner: AccountUuid::new(uuid::Uuid::new_v4()),
            role,
        }
    }

    #[test]
    fn only_the_owner_sets_the_proxy_flag() {
        for requested in [None, Some(false), Some(true)] {
            assert_eq!(grant(DeckRole::Owner).proxy(requested), requested);
            assert_eq!(grant(DeckRole::Editor).proxy(requested), None);
            assert_eq!(grant(DeckRole::Viewer).proxy(requested), None);
        }
    }

    #[test]
    fn only_the_owner_changes_the_global_tags() {
        assert!(grant(DeckRole::Owner).may_change_global_tags());
        assert!(!grant(DeckRole::Editor).may_change_global_tags());
        assert!(!grant(DeckRole::Viewer).may_change_global_tags());
    }
}
