# Passkeys

How a person proves who they are to a service in this repo: passkeys only, no passwords. Shared by every service that signs people in with passkeys.

## Language

**Identity**:
The anchor a person's passkeys hang off. It carries no name, role or contact data; those belong to the service's Account.
_Avoid_: user, principal

**Account**:
A service's own record of a person (username, role, email, ...). Every Account references exactly one Identity.
_Avoid_: user, login

**Passkey**:
A WebAuthn credential bound to one Identity. An Identity may hold several, one per device or password manager.
_Avoid_: credential, key, authenticator

**Login**:
Proving control of one of an Identity's Passkeys. The person names their Account by username first.
_Avoid_: sign-in, authentication

**Enrollment**:
Adding a Passkey to an Identity, either through a Registration link or while already logged in (adding a device).
_Avoid_: registration, sign-up

**Registration link**:
A one-time, expiring link that lets whoever opens it enroll a Passkey for one specific Identity. Used for onboarding and for recovery alike.
_Avoid_: invite, registration token, magic link
