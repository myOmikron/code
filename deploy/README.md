# Deploying

Each stack lives in `deploy/<stack>/`: a compose file from the repo plus an
untracked `.env` on the host holding the secrets and pinning the image tags.
`deploy.sh` is what turns a published release into a running one, and
`.github/workflows/deploy.yaml` is what runs it from CI.

## By hand

On the host:

```sh
cd /opt/code
git pull --ff-only
$EDITOR deploy/mtg/.env          # bump <SERVICE>_VERSION
just prod mtg pull
just prod mtg up -d
```

Or the same thing in one step, which is exactly what CI does:

```sh
deploy/deploy.sh mtg MTG_VERSION v1.2.3
```

## From CI

Pushing a release tag (`mtg/v1.2.3`) builds and publishes the images; when that
finishes, `Deploy` picks the tag up, works out which stacks pin
`MTG_VERSION` — the compose files are the mapping, so a service deployed in two
stacks reaches both — joins the tailnet and runs `deploy.sh` on each host.

Deploying by hand, and rolling back, is the same workflow started from the
Actions tab with a service and a version. Rolling back only puts the old image
tag back; a migration that already ran stays applied, so check what the release
did before going backwards.

### What the repo needs

Secrets:

| Name | What |
|------|------|
| `TS_AUTHKEY` | Tailscale auth key, reusable and ephemeral |
| `DEPLOY_SSH_KEY` | Private half of the deploy key |
| `<STACK>_HOSTNAME` | The host that stack runs on, in the tailnet — e.g. `MTG_HOSTNAME`, `SEMMELEI_HOSTNAME` |
| `<STACK>_SSH_PORT` | Only when that host's sshd listens off 22, e.g. `MTG_SSH_PORT` |

Variables (both optional):

| Name | Default | What |
|------|---------|------|
| `TS_EXTRA_ARGS` | — | Extra `tailscale up` arguments |
| `DEPLOY_SSH_PORT` | `22` | ssh port for every host without its own `<STACK>_SSH_PORT` |
| `DEPLOY_USER` | `deploy` | User to log in as |
| `DEPLOY_PATH` | `/opt/code` | Where the repo is cloned on the host |

`TS_EXTRA_ARGS` is what points the runner at a control server that is not
tailscale's own:

```
--login-server=https://headscale.example.com
```

A secret of the same name is used first, for when that url should not show up in
the logs.

### What the host needs

- docker with the compose plugin, and the deploy user in the `docker` group
- tailscale up and logged in, reachable under the name in `<STACK>_HOSTNAME`
- the deploy key's public half in the deploy user's `authorized_keys`
- the repo cloned to `/opt/code`, on `main`, able to `git pull` on its own
  (a read-only deploy key for the repo, or a token in the remote url)
- `deploy/<stack>/.env` filled in from `env.example`
- nothing for the mtg catalog sync: it is a service in the stack and comes up
  with everything else (see "The catalog sync")

## The catalog sync

The mtg stack runs `catalog-sync` alongside the webserver. It pulls Scryfall's
card catalog and, with the fresh prices, re-decides every watch list alarm —
which is the only moment either of those can change.

It schedules itself, hourly, and that needs no cron, no timer and no host setup:
a compose stack has no scheduler, and the runtime image is a hardened one with
no shell to put a `while` loop in, so the loop lives in the binary behind
`--every-minutes`. A deploy brings it up with the rest of the stack and there is
nothing to remember afterwards.

Hourly sounds more often than it is. Scryfall regenerates the bulk file at most
every twelve hours; a tick that finds the same file downloads nothing and exits
after one small request. Paying that hourly is what buys picking the new file up
within the hour rather than guessing when it lands.

Watch it:

```sh
cd /opt/code/deploy/mtg
docker compose logs -f catalog-sync
```

Read the catalog regardless of the stamp — after repairing rows by hand, say:

```sh
docker compose run --rm catalog-sync sync-catalog --force
```

`--force` is refused together with `--every-minutes`: a service forcing every
tick would pull four hundred megabytes around the clock, which is the one thing
the stamp check exists to prevent.

Without `--every-minutes` the command runs once and exits, which is the shape a
Kubernetes CronJob wants — the same image and tag with `args: ["sync-catalog"]`
and a `schedule:`, and nothing else to change.
