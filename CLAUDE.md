# Code Monorepo

Private projects monorepo. Hosted on GitHub, images on ghcr.io, hardened base
images from Docker Hardened Images (dhi.io).

## Repository Structure

```
services/       # Rust backend services (one crate per service)
libs/           # Shared Rust libraries (workspace members)
  nats-subjects/      # Central NATS subject constants
  service-bootstrap/  # Tracing, config, and startup boilerplate
  sqlx-sqlite/        # Stub crate patching a dependency conflict — see its README
proto/          # Protocol Buffer definitions (proto/common/ for shared types)
frontend/       # TypeScript frontend applications (one per service)
components/     # Shared React component library (pnpm workspace member)
dev/            # Docker compose dev stacks (dev/<service>.yml + dev/infra.yml)
deploy/         # Production compose stacks (deploy/<service>/compose.yml + env.example)
docker/         # Release manifests (docker/<service>.yaml, consumed by CI)
tools/          # Developer tooling (changed-crates.py, ci-image/)
.github/        # GitHub Actions workflows + composite actions
```

## Tech Stack

- **Backend**: Rust (galvyn web framework, rorm ORM + Postgres, NATS for messaging, protobuf)
- **Frontend**: TypeScript, React 19, Vite, TanStack Router/Form, Tailwind v4, PWA via vite-plugin-pwa
- **Observability**: tracing + OpenTelemetry (OTLP/gRPC)
- **Build**: Cargo workspace, pnpm workspace (with catalogs), just, Docker
- **CI**: GitHub Actions

## Development Commands

All common tasks are available via [just](https://github.com/casey/just):

```sh
just ci                      # Run all Rust checks (fmt, lint, lint-ast, test-ast, doc, test, deny)
just check / test / lint     # Individual Rust checks
just lint-ast / test-ast     # ast-grep lints (.ast-grep/rules) / their self-tests
just lint-i18n               # frontend i18n keys and namespaces (tools/check-i18n.py)
just doc                     # rustdoc with -D warnings (broken intra-doc links fail)
just fmt / fmt-check         # Format code (rustfmt nightly, prettier, taplo)
just deny                    # cargo-deny license/advisory checks
just make-migrations <name>  # Generate rorm migrations for a service
just build-service <name>    # Release build a specific service
just docker-build <name>     # Build Docker image for a service
just dev <name> <args...>    # Operate a dev stack, e.g. `just dev semmelei up -d --build`
just gen-api [frontend]      # Regenerate a frontend's API specs and clients, every frontend without an argument
just db <name>               # psql shell in a dev stack's database
just prod <name> <args...>   # Operate a prod stack (on the deploy host), reads deploy/<name>/.env
just prod-db <name>          # psql shell in a prod stack's database
just prod-db-dump <name>     # gzipped pg_dump of a prod stack's database
```

Frontend (per app): `pnpm run dev` / `build` / `ci` / `format`.

## Conventions

**Coding standards**: `CODING_STANDARDS.md` holds the rules a review checks
(comments, `MaxStr`, transactions, i18n keys and namespaces, Tailwind and dark mode,
mtg query cost). A review applies all of it; read the sections a change touches before writing it.

### Dependencies

- All shared Rust dependencies are declared in `[workspace.dependencies]` in the root `Cargo.toml`;
  crates reference them with `{ workspace = true }`
- All crates must opt into workspace lints: `[lints] workspace = true`
- Frontend dependencies are pinned in the **pnpm catalogs** in `pnpm-workspace.yaml`;
  apps reference them as `"catalog:dependencies"` / `"catalog:devDependencies"` —
  never pin versions in an app's `package.json`
- The pnpm version is pinned via `packageManager` in the root `package.json`

### Services

- Each service lives in `services/<name>/` with its own multi-stage `Dockerfile`
  (build context = workspace root, musl static build, `dhi.io/alpine-base` runtime)
- Services set `publish = false` in their `Cargo.toml`
- Use `service-bootstrap` for tracing/config/startup; the service `main.rs` dispatches
  clap subcommands: `start`, `make-migrations`, plus service-specific ones
- Config via env vars, loaded upfront with `EnvLoader` — report all errors at once
- rorm migrations live in `services/<name>/migrations/` and are applied automatically
  at startup (the Dockerfile copies them to `/migrations`). PRs get a warning for
  `RawSQL`/`RenameField`/`DeleteField`/`DeleteModel`/`SetFieldType`/`DeleteIndex`
  (`check-migrations.yaml`)
- Browser-facing services add the session layer themselves
  (`.layer(galvyn::core::session::layer())`) — `service_bootstrap::run` disables galvyn's
- HTTP tests drive the router in-process against a throwaway Postgres; copy
  `services/bnv-manager-v2/src/tests/harness.rs` (needs `just dev infra up -d --wait test-postgres`)

### Authentication

- **Staff/user auth is passkey (WebAuthn)**: no passwords, ever. OIDC login (ADR-0002)
  is the module's `oidc` feature; mtg enables it for "Continue with Google".
  Backend: the `libs/galvyn-identity` galvyn module (`IdentityModule`, login methods as
  cargo features: `passkey`, `oidc`); frontend: `@simplewebauthn/browser`.
- Passkey login is username first, then a Passkey of that account's Identity
  (the Identity's Passkeys are the credential allow-list).
- Account onboarding and device recovery work via one-time Registration links,
  issued through the module by a cli subcommand or an admin UI.
- The WebAuthn `rp_id`/`rp_origin` come from the `PUBLIC_ORIGIN` env var.
  Changing its host invalidates all registered passkeys.
- Reference implementation: `libs/galvyn-identity` (and its `GLOSSARY.md`) with
  `docs/adr/0001-passkeys-as-galvyn-module.md` and
  `docs/adr/0002-one-identity-module-for-all-login-methods.md`.

### HTTP API

- Handler layout: `src/http/handler_frontend/<domain>/{handler,schema}.rs`,
  routes grouped in `mod.rs` per auth level and wrapped with middleware
  (`AuthRequiredLayer`, role layers)
- The frontend OpenAPI spec is served openly at `/docs/frontend.json` (one openapi page
  per consumer, no debug gate, no login); nest `service_bootstrap::openapi_docs_routes!(<page>)`
  under `/docs`
- API clients: `frontend/<app>/api-clients.json` lists the app's backends as
  `{ "backend": "<services/ dir>", "out": "<client dir>" }`, one generated client per
  backend; any split by role or area lives in hand-written API wrappers.
  `just gen-api [frontend]` (`tools/gen-api/gen-api.py`) has each backend write its spec to
  `<out>/openapi.json` through its `openapi <output>` subcommand, then runs the generator
  in a throwaway container of the frontend dev image. Commit spec and client together.
  - Rust service: cargo runs the subcommand, wired via `service_bootstrap::openapi::write_openapi`
  - Python service: uv runs the project's single script entry without the dev group and with
    the extras in `[tool.gen-api] extras` of its `pyproject.toml`, e.g. mtg-graph's
    `deck-lab openapi OUTPUT` with `api`
  - Generator version: root `openapitools.json`; options: `tools/gen-api/generator-config.json`
  - The host needs Docker, uv, cargo and installed `node_modules`; Java and a dev stack are not needed

### NATS and Proto

- Subject strings live in `libs/nats-subjects`; payloads are protobuf (`prost`)
- Invalid messages go to the DLQ (see `service-bootstrap`'s listener)
- Proto files are organized by domain: `proto/<domain>/v1/`, `proto/common/` for shared types.
  They define both NATS message payloads and gRPC services; build them with
  `service-bootstrap-build` in the service's `build.rs`

### Libraries

- Shared libraries live in `libs/<name>/`, picked up via workspace glob
- Add to `[workspace.dependencies]` if other crates should depend on it

### Frontend

#### mtg Release notes

- A change mtg players notice (website, scanner, deck advisor) adds a Release note
  fragment to `frontend/mtg/release-notes/unreleased/` in the same commit as the change;
  format and rules in `frontend/mtg/release-notes/README.md`. Admin-only changes get none.
  `just release mtg <version>` files them under the version (see Release Workflow).

#### New frontend apps

- Copy `frontend/example/`, rename in `package.json`, adjust `index.html` and the
  Dockerfile paths — the workspace glob picks it up automatically
- Name the app's backends in its `api-clients.json` (the example's `example` backend is
  skipped with a notice until `services/example` exists), then `just gen-api <app>`
- API calls go through the generated client (`src/api/generated/`, never hand-edited)
  wrapped by `src/api/api.tsx` (`handleError` + `ERROR_STORE`)
- PWA: `/api` must never be served from the service worker cache (NetworkOnly)

## CI

- GitHub Actions in `.github/workflows/`; the Rust pipeline lives in the composite
  action `.github/actions/rust-ci` and scopes clippy/build/test on PRs to crates
  affected by the diff (`tools/changed-crates.py`); it also runs taplo, `ast-grep scan`
  and `cargo doc`. `tools/ci-image` mirrors it for local runs (`just run-ci-image`)
- `ci-gate.yaml` is the one required check of `main`: it waits for every check run a PR
  triggered, since the path-filtered workflows cannot be required themselves. Renovate
  automerges through GitHub's auto-merge and so waits on it
- Dockerfile changes are build-checked by `docker-build.yaml`
- `gen-api.yaml` is the drift check: it runs gen-api and fails on any diff in specs or
  clients. On PRs only for frontends whose backend crates or gen-api inputs changed
  (`tools/gen-api/changed-frontends.py`), on `main` for all
- Renovate runs self-hosted (`.github/workflows/renovate.yaml`, config in `renovate.json`)
  as a GitHub App, so its commits are signed. Image refs (`FROM`, compose `image:`,
  `runs-on:`) carry full versions and are found by Renovate's own managers. Only versions no
  manager sees (ARG/ENV/`toolchain:` in workflows and Dockerfiles) carry a
  `# renovate:` comment, directly above the assignment it pins. JSON pins cannot carry
  one and get a custom manager in `renovate.json` instead (the generator in `openapitools.json`)

## Release Workflow

1. Tag format: `<service-name>/v<semver>` (e.g., `semmelei/v1.0.0`). Cut it with
   `just release <service> <version>` on an up-to-date, clean `main`: for mtg it files the
   pending Release notes under the version and commits them, then it creates the signed tag.
   It never pushes: `git push origin main <tag>`
2. Pushing the tag triggers `release-docker.yaml`, which reads `docker/<service-name>.yaml`
   and builds/pushes each entry as `ghcr.io/<owner>/<service>/<key>:v<semver>` and `:latest`
3. Registry logins: ghcr.io via `GITHUB_TOKEN`, dhi.io via `DHI_USER`/`DHI_TOKEN` secrets
4. When that succeeds, `deploy.yaml` rolls the release out: it finds every
   `deploy/<stack>/compose.yml` pinning `<SERVICE>_VERSION`, reaches the host
   over tailscale and runs `deploy/deploy.sh` there. Same workflow by hand for a
   rollback — see `deploy/README.md` for the secrets and what the host needs.

## Adding a New Service

1. Create `services/<name>/` with `Cargo.toml` and `src/main.rs`
   (the workspace glob `services/*` picks it up automatically)
2. Set `publish = false` and `[lints] workspace = true`
3. Depend on `service-bootstrap`; `galvyn = { workspace = true, default-features = true }`
4. Create `config.rs` using `EnvLoader`; clap cli with `start` / `make-migrations`, and
   `openapi <output>` for a service with a frontend (see HTTP API)
5. Run `just make-migrations <name>` and commit the generated migration
6. Add a `Dockerfile` following `services/semmelei` (incl. `COPY .../migrations /migrations`)
7. Add `dev/<name>.yml` (compose stack; traefik on `http://localhost` as single
   entrypoint, config under `dev/<name>/traefik/`, incl. the `swagger` service that
   serves the OpenAPI explorer on `/swagger-ui`) and `docker/<name>.yaml` (release manifest)
8. Add required env vars to `dev/common/env.common`

## Adding a New Library

1. Create `libs/<name>/` with `Cargo.toml` and `src/lib.rs`
2. Set `[lints] workspace = true`
3. The workspace glob `libs/*` picks it up automatically
4. Add to `[workspace.dependencies]` if other crates should depend on it

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on myOmikron/code via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels are used verbatim (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: a root `GLOSSARY-MAP.md` points at per-service `services/<name>/GLOSSARY.md`; system-wide ADRs in `docs/adr/`, service-scoped ones in `services/<name>/docs/adr/`. See `docs/agents/domain.md`.
