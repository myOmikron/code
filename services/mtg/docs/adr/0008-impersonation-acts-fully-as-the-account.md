# An Impersonation acts fully as the Account and is attributed through the Admin log

An Admin debugging a Member's report starts an Impersonation of that Account, and from then on every request of the Admin's session acts as the Account with the Account's full rights: it reads and changes the Account's collections and decks, registers for Tournaments and reports Results, and other people get the same mails, pushes and live updates as if the Account had acted. Only a few route groups stay refused while impersonating (Passkeys, OIDC Enrollment, the Account's own Deletion and Rename, Bug reports, push subscriptions), since they would leave the Admin a lasting way into the Account or put words into its mouth. Nothing done during an Impersonation is marked with the acting Admin: it is the Account's like anything else, and who acted is reconstructed by matching the change's time against the Impersonation's span in the Admin log, from its start entry up to the earlier of its expiry and its end entry. We chose this because faults often show only when acting, and because attribution through the log leaves the data model unchanged.

The resolution lives in one place, the `Caller` request extractor: the session's own Account first, then the impersonated one if the session holds an Impersonation. `Account`, `Viewer`, `AccountRequiredLayer` and the Tournament access middleware all build on it and act as the impersonated Account without knowing. The Impersonation lives in the session only, never in the database as live state.

## Considered Options

- **Read-only viewing**: safer, but cannot reproduce faults that only show when acting (filing scanned cards, reporting a Result, editing a deck), which are the ones Members report most.
- **Marking every mutation with the acting Admin**: exact attribution, but touches many models and events (Deck changes, Match results, registrations, live updates) for a debugging tool, and every new feature would have to remember it.

## Consequences

- An Admin can change a Member's data in the Member's name. The Admin log's start entry with its required Impersonation reason, and the fixed one hour expiry, are what keep that accountable.
- The span is approximate at its end: an Impersonation that expired, or that ended because the Account was promoted or deleted, has no end entry and reads as lasting until its expiry.
- Handlers that read the session's Identity directly (the Passkey routes, `accounts/me`'s login method) see the Admin's Identity during an Impersonation. The Passkey routes are refused for that reason too; any new handler reading the Identity has to be checked against it.
