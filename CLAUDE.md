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
just ci                      # Run all Rust checks (fmt, lint, test, deny)
just check / test / lint     # Individual Rust checks
just fmt / fmt-check         # Format code (rustfmt nightly)
just deny                    # cargo-deny license/advisory checks
just make-migrations <name>  # Generate rorm migrations for a service
just build-service <name>    # Release build a specific service
just docker-build <name>     # Build Docker image for a service
just dev <name> <args...>    # Operate a dev stack, e.g. `just dev semelei up -d --build`
just gen-api <name>          # Regenerate a frontend's API client from the running dev stack
```

Frontend (per app): `pnpm run dev` / `build` / `ci` / `format` / `gen-api`.

## Conventions

### Code Style

- **Formatting**: `rustfmt` via nightly (see `.rustfmt.toml`); prettier for TypeScript
- **Lints**: Workspace-level clippy lints in root `Cargo.toml`; CI runs clippy with `-D warnings`
- **`unsafe` code is forbidden** (`unsafe_code = "forbid"`)
- Every module gets a `//!` doc comment, every public item a `///` doc comment
  (services set `#![warn(missing_docs)]`). Keep them short.

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
  at startup (the Dockerfile copies them to `/migrations`)
- Browser-facing services add the session layer themselves
  (`.layer(galvyn::core::session::layer())`) — `service_bootstrap::run` disables galvyn's
- Use `tracing` (not `println`/`eprintln`) — exception: config errors before tracing init
- **Panic semantic: "Panic anywhere -> restart"**. `service-bootstrap` installs a panic hook
  that triggers a graceful shutdown. Don't catch panics to keep the process alive.

### Authentication

- **Staff/user auth is passkey-only (WebAuthn)** — no passwords, ever.
  Backend: `webauthn-rs` (usernameless/discoverable login); frontend: `@simplewebauthn/browser`.
- Account onboarding and device recovery work via one-time registration links
  (`RegistrationToken`), issued by a cli subcommand or an admin UI.
- The WebAuthn `rp_id`/`rp_origin` come from the `PUBLIC_ORIGIN` env var.
  Changing its host invalidates all registered passkeys.
- See `services/semelei` for the reference implementation.

### HTTP API

- Handler layout: `src/http/handler_frontend/<domain>/{handler,schema}.rs`,
  routes grouped in `mod.rs` per auth level and wrapped with middleware
  (`AuthRequiredLayer`, role layers) — never per-handler auth checks
- Schemas derive `Serialize`/`Deserialize` + `JsonSchema` (via `galvyn::core::re_exports::schemars`),
  use `MaxStr<N>` for bounded strings and `SchemaDateTime`/`SchemaDate` for timestamps
- The frontend OpenAPI spec is served at `/docs/frontend.json` (openapi page per consumer);
  `just gen-api <name>` regenerates the TypeScript client from it
- Handler function names become OpenAPI operation ids — they must be unique across the service

### NATS

- All subject strings live in `libs/nats-subjects` — never hardcode subjects
- Protobuf for message serialization (`prost`)
- Metadata (correlation-id, source) goes in NATS headers, not in the proto payload
- Invalid messages go to the DLQ (see `service-bootstrap`'s listener)
- Use `o2o` to convert proto types into validated domain types

### Proto

- Organized by domain: `proto/<domain>/v1/`; `proto/common/` for shared types
- Proto files define both NATS message payloads and gRPC services
- Build with `service-bootstrap-build` in the service's `build.rs`
- Datetimes as unix timestamps (int64) with doc comment;
  `google.protobuf.Timestamp` for sub-second precision

### Libraries

- Shared libraries live in `libs/<name>/`, picked up via workspace glob
- Add to `[workspace.dependencies]` if other crates should depend on it

### Frontend

#### i18n translation keys

- Every translation key is **exactly two levels deep**: `a.b` (no deeper nesting, no single-level keys).
- The first segment `a` must be **one of these eight categories** — nothing else is allowed:
  | Prefix | Use for |
  |--------|---------|
  | `heading` | headings, subheadings and dialog titles |
  | `label` | labels and short notes |
  | `button` | anything clickable (buttons, links, menu items) |
  | `description` | longer explanatory text |
  | `error` | error messages |
  | `toast` | toast notifications |
  | `accessibility` | accessibility-only strings (e.g. `aria-label`) |
- The second segment `b` is a free-form kebab-case slug describing the specific string
  (e.g. `heading.orders`, `button.create-item`, `toast.passkey-created`).
  i18next plural suffixes (`label.positions_one`) count as part of the slug.

#### i18n namespaces

- A component may use **at most two** translation namespaces:
  - **Page-specific** — bound to `t`, with an explicit namespace:
    `const [t] = useTranslation("<namespace>")`. Holds strings only this page/component uses.
  - **General** — bound to `tg`, the default namespace shared across many pages:
    `const [tg] = useTranslation()`. Holds strings reused everywhere.
- Never pull in a third namespace (also not via the `ns` option);
  if a page-specific string is needed elsewhere, promote it to the general namespace.
- German (`de`) is the primary language; keep `en` in sync
  (`scripts/translation_scanner.py` finds missing keys).

#### Component files

- A `.tsx` file under `routes/` defines **exactly one** component (the route component).
  No helper/secondary components in route files.
- Extract any additional component into its own file:
  - App-local components go in `src/components/`.
  - Generic, reusable components go in the shared `components` library.

#### Sidebar navigation

- The app brand/logo in a persistent sidebar or mobile navbar always links to `/`
  with exact active matching (`activeOptions={{ exact: true }}`). Never point the
  brand at a section landing page such as `/verkauf`, otherwise fuzzy route matching
  keeps it highlighted throughout that section.
- Let index routes and their redirects choose a section's default page (for example
  `/admin` redirects to `/admin/items`); keep those redirects separate from the
  neutral app-brand link.

#### New frontend apps

- Copy `frontend/example/`, rename in `package.json`, adjust `index.html` and the
  Dockerfile paths — the workspace glob picks it up automatically
- API calls go through the generated client (`src/api/generated/`, never hand-edited)
  wrapped by `src/api/api.tsx` (`handleError` + `ERROR_STORE`)
- PWA: `/api` must never be served from the service worker cache (NetworkOnly)

## CI

- GitHub Actions in `.github/workflows/`; the Rust pipeline lives in the composite
  action `.github/actions/rust-ci` and scopes clippy/build/test on PRs to crates
  affected by the diff (`tools/changed-crates.py`)
- Dockerfile changes are build-checked by `docker-build.yaml`
- Version pins in workflows/Dockerfiles carry `# renovate:` comments — keep them
  directly above the assignment they pin

## Release Workflow

1. Tag format: `<service-name>/v<semver>` (e.g., `semelei/v1.0.0`)
2. Pushing the tag triggers `release-docker.yaml`, which reads `docker/<service-name>.yaml`
   and builds/pushes each entry as `ghcr.io/<owner>/<service>/<key>:v<semver>` and `:latest`
3. Registry logins: ghcr.io via `GITHUB_TOKEN`, dhi.io via `DHI_USER`/`DHI_TOKEN` secrets

## Adding a New Service

1. Create `services/<name>/` with `Cargo.toml` and `src/main.rs`
   (the workspace glob `services/*` picks it up automatically)
2. Set `publish = false` and `[lints] workspace = true`
3. Depend on `service-bootstrap`; `galvyn = { workspace = true, default-features = true }`
4. Create `config.rs` using `EnvLoader`; clap cli with `start` / `make-migrations`
5. Run `just make-migrations <name>` and commit the generated migration
6. Add a `Dockerfile` following `services/semelei` (incl. `COPY .../migrations /migrations`)
7. Add `dev/<name>.yml` (compose stack; traefik on `http://localhost` as single
   entrypoint, config under `dev/<name>/traefik/`) and `docker/<name>.yaml` (release manifest)
8. Add required env vars to `dev/common/env.common`

## Adding a New Library

1. Create `libs/<name>/` with `Cargo.toml` and `src/lib.rs`
2. Set `[lints] workspace = true`
3. The workspace glob `libs/*` picks it up automatically
4. Add to `[workspace.dependencies]` if other crates should depend on it
