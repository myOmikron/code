# Deploying semelei

```sh
cp env.example .env   # fill in DOMAIN, SEMELEI_VERSION, POSTGRES_PASSWORD
docker compose up -d
```

Migrations are applied by the webserver at startup, so there is no separate
migration step.

## First account

Staff login is passkey-only, and a passkey can only be registered in a
browser — so the first admin is prepared on the cli, which prints a one-time
registration link (valid 7 days):

```sh
docker compose run --rm webserver create-account <username> --role admin
```

The same command is how a staff member who lost every device gets back in.

## Upgrading

Bump `SEMELEI_VERSION` in `.env`, then:

```sh
docker compose pull && docker compose up -d
```

Rolling back means putting the old tag back — but a migration that already
ran is not undone, so check the release notes before going backwards.
