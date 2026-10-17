# Passkeys live in a galvyn module; services own the Account

Passkey auth was copied between semmelei and mtg and the copies drifted, so it moves into one galvyn module (`libs/galvyn-passkeys`). The module owns only an Identity anchor plus the Passkeys and Registration links that reference it; each service's Account references its Identity, so all foreign keys point from service to library and stay concrete rorm types. Roles, usernames, email and how Registration links are delivered stay in the service.

## Considered Options

- Generic library models over the service's Account (`experimental_generics`): experimental in rorm, and `Patch` derives reject generics.
- A bare account uuid column without a foreign key: loses the delete cascade, so a forgotten cleanup leaves orphaned credentials.
- A macro that stamps the models into each service crate: shares the code but not the tables' ownership, and hides the schema behind macro expansion.
- A shared generic Account in the library that services extend: the Account fields already differ widely between services.
