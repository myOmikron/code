# mtg

Accounts, their collections and decks, and the admin dashboard that manages the Accounts. Login and Enrollment are the Identity context's (see `libs/galvyn-identity/GLOSSARY.md`).

## Language

**Account**:
A person's record in mtg: username, email, Role, and everything they own (collections, decks, scanner sessions). References exactly one Identity.
_Avoid_: user, profile

**Role**:
What an Account may do beyond managing its own things. Either **Member** (the default) or **Admin**. Set by the `set-role` cli subcommand or by an Admin in the admin dashboard. An Admin can never demote itself.
_Avoid_: permission, group

**Admin**:
An Account with the Admin Role. Sees the admin dashboard and manages other Accounts, Admins included, but never Locks, deletes, demotes or Renames itself through the admin dashboard; it Renames itself like any Account.
_Avoid_: superuser, staff, moderator

**Lock**:
An Admin's block on an Account: its Login and Registration link Enrollment are refused with `locked`, and its existing sessions fail on their next request, learning only that the Account is locked. Recovery answers the same silent `200` as for an unknown username and mails no link, by design: recovery must not reveal which usernames exist or are locked. Its public decks and shares stay reachable. Carries a **Lock reason** (required); lifting it, the **unlock**, takes an optional **unlock reason**. Only Admins see either reason, and no mail is sent.
_Avoid_: ban, suspension, disable

**Admin log**:
The record of what Admins did to Accounts: Lock, unlock, Role change, Deletion and Rename, each with the acting Admin (none for a Role change through the `set-role` cli, named `cli`), the affected Account's username, when, and the reason given; a Deletion also records whether it was full, a Rename the new username. Names both Accounts by their username at the time, so it outlives the Accounts it names.
_Avoid_: audit log, history

**Tombstone**:
The one Account nobody can name, log into or sign up as, that holds the public decks of deleted Accounts so links to them keep working. Excluded from every Account list and count.
_Avoid_: ghost account, deleted user

**Deletion**:
Removing an Account with everything it owns. By default its public decks go to the Tombstone; a **full Deletion** takes them too. An Account deletes itself, or an Admin deletes it after typing its username.
_Avoid_: removal, purge

**Rename**:
Changing an Account's username, by the Account itself or by an Admin. The old username is free for anyone at once, and links to the old profile stop working; deck links and sessions are unaffected. No limit on how often. A locked Account cannot Rename itself, but an Admin can Rename it. An Admin's Rename carries a **Rename reason** (required, seen only by Admins) and mails the Account its new username, since Login and recovery both need it; a Rename by the Account itself is not recorded anywhere.
_Avoid_: display name, nickname

**Sync run**:
One attempt of the catalog sync or the price guide sync: when it started, how long it took, its outcome (new file read, unchanged, failed) and the error if it failed. Kept for 90 days.
_Avoid_: job, import

**Statistics snapshot**:
Service-wide counts taken at one point in time by the `snapshot-statistics` subcommand: Accounts, collections, decks, public decks, cards and open scanner sessions. Kept forever; the admin dashboard only ever shows snapshots, never live counts.
_Avoid_: metrics, report

**Open scanner session**:
A scanner session holding at least one scanned card not yet filed into a collection. Sessions are never closed: filing empties them.
_Avoid_: active session

**Snow pip**:
An `{S}` in a mana cost: one mana of any colour or colourless, as long as a Snow source made it. Counts towards mana value like a generic symbol.
_Avoid_: snow mana symbol, snow colour

**Snow source**:
A card with the Snow supertype that produces mana. Everything it produces is snow mana, in whatever colour it makes, so a Snow-Covered Forest is a green source and a Snow source at once. Effects that count the snow mana spent on a cost are not part of it.
_Avoid_: snow land, snow colour

## Relationships

- An **Account** has exactly one **Role**, and at most one **Lock** at a time
- Every **Lock**, unlock, **Role** change, **Deletion** and **Rename** by an **Admin** or the cli writes one **Admin log** entry
- A **Deletion** hands the Account's public decks to the **Tombstone**, unless it is a full Deletion
- A **Statistics snapshot** never counts the **Tombstone**

## Flagged ambiguities

- "Collection" in Account counts means a collection on the shelf; a collection standing for a deck's cards belongs to the deck and is counted with it, not as a collection.
- "Never counts the Tombstone" in a Statistics snapshot means the Tombstone is not an Account there. The public decks it holds are still decks on the site and counted as decks.
