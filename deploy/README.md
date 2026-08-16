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

