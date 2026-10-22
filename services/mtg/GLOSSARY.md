# mtg

Accounts, their collections and decks, and the admin dashboard that manages the Accounts. Login and Enrollment are the Identity context's (see `libs/galvyn-identity/GLOSSARY.md`).

## Language

**Account**:
A person's record in mtg: username, email, Role, and everything they own (collections, decks, scanner sessions). References exactly one Identity. Its email is taken once, at signup or first OIDC login, and never changes.
_Avoid_: user, profile

**Local Account**:
An Account whose Identity is local: it logs in with Passkeys and recovers through a Registration link mailed to its email.
_Avoid_: passkey user

**External Account**:
An Account whose Identity is external: it logs in through one OpenID provider (e.g. Google) and has no recovery in mtg, since whoever controls the account at the provider can log in. Created on its first OIDC login, after the person picks a username. Never turns into a local Account or back.
_Avoid_: Google account (that is the account at Google), social account

**Role**:
What an Account may do beyond managing its own things. Either **Member** (the default) or **Admin**. Set by the `set-role` cli subcommand or by an Admin in the admin dashboard. An Admin can never demote itself.
_Avoid_: permission, group

**Admin**:
An Account with the Admin Role. Sees the admin dashboard and manages other Accounts, Admins included, but never Locks, deletes, demotes or Renames itself through the admin dashboard; it Renames itself like any Account.
_Avoid_: superuser, staff, moderator

**Lock**:
An Admin's block on an Account: its Login and Registration link Enrollment are refused with `locked`, and its existing sessions fail on their next request, learning only that the Account is locked. Recovery answers the same silent `200` as for an unknown username or an External Account and mails no link, by design: recovery must not reveal which usernames exist or are locked. Its public decks and shares stay reachable. Carries a **Lock reason** (required); lifting it, the **unlock**, takes an optional **unlock reason**. Only Admins see either reason, and no mail is sent.
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

**Bracket claim**:
The Commander bracket a deck says it is built to. The owner or an Editor sets and changes it; the only time it is set without them is when a deck that claims none first reaches its full size, and then it is claimed at what its cards read as. It is never changed because of the cards once it is set.
_Avoid_: detected bracket, power level

**Played bracket**:
The lowest Commander bracket whose rules a deck's cards keep. Read from the cards, never written down. A Played bracket above the Bracket claim is a warning, not a correction.
_Avoid_: actual bracket, real bracket

**Deck entry**:
One line of a deck: a printing in a zone, foil or not, proxy or not, with a quantity of at least one. A deck holds at most one Deck entry per printing, zone, foil and proxy; an edit that makes two alike merges them, and an entry whose quantity drops to zero is gone.
_Avoid_: slot, deck card, line

**Deck change**:
One step in a deck's Deck history: what the owner or an Editor did to its Deck entries or to its name, description, format, colors, bracket, rule-zero exceptions or size. Tags, folder, visibility, sharing and the deck's collection are not part of it. An import, a fill, a swap or a move between zones is one Deck change. Changes to the same Deck entry, or to the same field, made in quick succession become one Deck change, unless a Deck checkpoint names it. Creating the deck is its first Deck change; a deck that existed before Deck histories begins with its state at that time. Undo, redo and resetting to an earlier point are Deck changes of their own, so the Deck history only ever grows.
_Avoid_: revision, edit, version

**Deck history**:
The ordered Deck changes of one deck, seen only by its owner. Any earlier point in it can be viewed and the deck reset to it. Kept as long as the deck exists; dropped when the deck is deleted or handed to the Tombstone.
_Avoid_: history (alone), changelog, log

**Deck checkpoint**:
A name the owner gives one Deck change, e.g. "FNM 18.10.", to find that point in the Deck history again. At most one per Deck change; it can be renamed and removed.
_Avoid_: snapshot, tag, version, milestone

**Collaborator**:
Another Account the owner of a deck named on it by username, as a Viewer or an Editor. Sees the deck whatever its Visibility, the way its Share link shows it: proxy flags are reported as no proxy. Takes effect at once, without an invitation or a mail. Only the owner names, changes and removes Collaborators; neither the owner nor the Tombstone can be one. A deck that is not shared with an Account answers it the same as a deck that does not exist.
_Avoid_: member, share, guest

**Viewer**:
A Collaborator who only looks at the deck: its list, zones, tags and statistics.
_Avoid_: reader, read-only member

**Editor**:
A Collaborator who also builds the deck as a decklist: its cards, zones, name, description, format, bracket, colours, rule zero, advisor settings and deck-only tags. Everything about the owner's shelf stays the owner's. An Editor sees all tags on the deck but creates, changes, deletes and assigns only the deck-only ones; those are the owner's, whoever created them. Global tags and their card-wide assignments stay the owner's, so an Editor never changes how the owner's other decks are tagged.
_Avoid_: co-owner, admin, writer

**Release**:
One shipped version of mtg, named by its `mtg/v<version>` tag, with the date it was cut. Website, scanner and deck advisor share one Release.
_Avoid_: version (alone), deploy, update

**Release note**:
One change players notice, told in their words in German and English as New, Improved or Fixed. Written in the same commit as the change; changes only Admins notice get none.
_Avoid_: changelog entry, entry, change

**Release notes**:
All Release notes of the Releases, shown newest first on the "What's new" page (Neuigkeiten). Releases without a Release note are left out.
_Avoid_: changelog, history, news feed

## Relationships

- An **Account** has exactly one **Role**, and at most one **Lock** at a time
- An **Account** is either a **Local Account** or an **External Account**, never both, never switching
- Every **Lock**, unlock, **Role** change, **Deletion** and **Rename** by an **Admin** or the cli writes one **Admin log** entry
- A **Deletion** hands the Account's public decks to the **Tombstone**, unless it is a full Deletion
- A **Statistics snapshot** never counts the **Tombstone**
- A deck has exactly one **Deck history**; handing the deck to the **Tombstone** empties it
- A deck has any number of **Collaborators**, each Account at most once, as a **Viewer** or an **Editor**; deleting the deck or the Account removes the Collaborator
- A **Collaborator** sees the deck whatever its Visibility; Visibility and the Share link work the same with or without Collaborators
- A **Release** has any number of **Release notes**; pending ones belong to the next Release cut with `just release`
- Undoing or resetting a **Deck change** restores **Deck entries** without their card tags, and never moves cards of the deck's collection

## Flagged ambiguities

- "Collection" in Account counts means a collection on the shelf; a collection standing for a deck's cards belongs to the deck and is counted with it, not as a collection.
- "Never counts the Tombstone" in a Statistics snapshot means the Tombstone is not an Account there. The public decks it holds are still decks on the site and counted as decks.
