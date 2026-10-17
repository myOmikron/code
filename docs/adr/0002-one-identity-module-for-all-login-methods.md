# One identity module for all login methods

OIDC login joins Passkey login as a second, alternative way to prove control of an Identity, and both live in one galvyn module, `libs/galvyn-identity` (formerly planned as `galvyn-passkeys`, see ADR-0001). Each login method is a cargo feature, and the service's setup turns on the methods it offers; further methods join the same module. An Identity is either local (Passkeys) or external (one External identity), never both, so an OpenID provider stays the only authority for the people it vouches for.

## Considered Options

- A separate `galvyn-oidc` module next to `galvyn-passkeys`: OIDC would hang off an Identity owned by a module named after a different login method, or the Identity would need a third base crate.
- Porting `AccountOidc<A>` from `apps` as is: it is generic over the service's Account, which ADR-0001 already rejected.
- Letting an Identity hold Passkeys and an External identity at once: a person the provider has locked out could still log in with a Passkey.
