# Identity

How a person proves who they are to a service in this repo: with a Passkey or through an external OpenID provider, never with a password. Shared by every service that signs people in.

## Language

**Identity**:
The anchor a person's login methods hang off. It is either local (it holds Passkeys) or external (it holds External identities), never both. It carries no name, role or contact data; those belong to the service's Account.
_Avoid_: user, principal

**Account**:
A service's own record of a person (username, role, email, ...). Every Account references exactly one Identity.
_Avoid_: user, login

**External identity**:
A person as one OpenID provider knows them, named by that provider and the value of its identifying claim (by default the subject), unique per provider. It keeps the provider's issuer. Bound to exactly one external Identity.
_Avoid_: OIDC account, federated user, social login

**Passkey**:
A WebAuthn credential bound to one local Identity. A local Identity may hold several, one per device or password manager.
_Avoid_: credential, key, authenticator

**Label**:
What a Passkey is called, so the person can tell their devices apart. It starts as the authenticator's product name (or a number when that is unknown) and the person may rename it later.
_Avoid_: name, nickname

**Login**:
Proving control of an Identity. Two alternatives: a **Passkey login** (the person names their Account by username, then uses one of the Identity's Passkeys) or an **OIDC login** (an external OpenID provider vouches for the person).
_Avoid_: sign-in, authentication

**Enrollment**:
Binding a login method to an Identity: a Passkey to a local Identity (through a Registration link or while already logged in, when adding a device), or an External identity to an external Identity (through a Registration link). An Identity with no login method yet becomes local or external with its first Enrollment.
_Avoid_: registration, sign-up

**Registration link**:
A one-time, expiring link that lets whoever opens it enroll a login method for one specific Identity, optionally restricted to one OpenID provider. Used for onboarding and for recovery alike; for an external Identity, recovery replaces its External identity.
_Avoid_: invite, registration token, magic link

**OpenID provider**:
An external service that vouches for people in an OIDC login, kept in the module's tables per service and named by its slug. Each one either admits people it vouches for on their first OIDC login (open), or only those holding a Registration link (invite only).
_Avoid_: IdP, SSO, identity provider

**Open admission**:
How a first OIDC login through an open OpenID provider becomes an Account: either the service's admission hook creates the Account right away or declines, leaving nothing behind, or the External identity stays **pending** in the session until the service binds it to a fresh Identity together with its Account (e.g. after a username step).
_Avoid_: auto-provisioning, JIT signup
