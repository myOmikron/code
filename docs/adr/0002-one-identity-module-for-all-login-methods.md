# One identity module for all login methods

OIDC login joins Passkey login as a second, alternative way to prove control of an Identity, and both live in one galvyn module, `libs/galvyn-identity` (formerly planned as `galvyn-passkeys`, see ADR-0001). Each login method is a cargo feature, and the service's setup turns on the methods it offers; further methods join the same module. An Identity is either local (Passkeys) or external (one External identity), never both, so an OpenID provider stays the only authority for the people it vouches for.

OpenID providers live in the module's tables, several per service, added at runtime (a cli subcommand and admin handlers, both mounted by the service; the handlers check no permission, the service's role layer guards them) instead of env vars. A provider is named by its slug, which also ends its redirect uri (`<public origin><callback path>/<slug>`); the issuer comes from its discovery and is stored on the first one. Discovery runs lazily per provider and is cached, so a broken provider only disables its own login. An External identity is keyed by its provider and the value of the provider's identifying claim (`sub` unless configured otherwise), unique per provider. A service may keep one provider in its own config, e.g. mtg's Google from env vars, and puts it into the table at startup.

The login page asks the module's listing (mounted by the service, no login needed) for the enabled login methods and the offered providers, by slug and display name only. It leaves out deactivated providers and those whose discovery failed in the last few minutes, and discovers nothing itself, so a broken provider never holds the page up; a login through it after that retries its discovery.

An open provider admits a person on their first OIDC login in one of two ways the service picks: the module creates the Identity with its External identity and asks a service hook, which creates the Account in the same transaction or declines and leaves nothing behind; or the External identity stays pending in the session until the service binds it inside the transaction that creates its Account. The pending bind exists for services that ask the person something first, like mtg's username step, which a synchronous hook cannot do.

## Considered Options

- A separate `galvyn-oidc` module next to `galvyn-passkeys`: OIDC would hang off an Identity owned by a module named after a different login method, or the Identity would need a third base crate.
- Porting `AccountOidc<A>` from `apps` as is: it is generic over the service's Account, which ADR-0001 already rejected.
- Only the service hook for open admission: mtg's username step needs user input between the callback and the Account.
- One shared callback path for every provider, the provider remembered in the session: it hides which provider a redirect uri belongs to.
- Letting an Identity hold Passkeys and an External identity at once: a person the provider has locked out could still log in with a Passkey.
