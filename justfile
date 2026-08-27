set dotenv-load

# Run all checks (CI)
ci: fmt-check lint test deny

# Type-check the workspace
check:
    cargo check --workspace

# Run tests
test:
    cargo test --workspace

# Run clippy lints
lint:
    cargo clippy --workspace --all-targets -- -D warnings

# Format code (Rust + TypeScript)
fmt: fmt-rust fmt-ts

# Format Rust code
fmt-rust:
    cargo +nightly fmt --all

# Format TypeScript code
fmt-ts:
    pnpm -r run format

# Check formatting (Rust + TypeScript)
fmt-check: fmt-check-rust fmt-check-ts

# Check Rust formatting
fmt-check-rust:
    cargo +nightly fmt --all -- --check

# Check TypeScript formatting
fmt-check-ts:
    pnpm -r run format-check

# Run cargo-deny checks
deny:
    cargo deny check

# Build a specific service (release)
build-service name:
    cargo build --release --package {{ name }}

# Make migrations for the given service
make-migrations name:
    cargo run --package {{ name }} -- make-migrations services/{{ name }}/migrations/

# Build Docker image for a service
docker-build name:
    docker build -t {{ name }}:local -f services/{{ name }}/Dockerfile .

# Build the CI base image
build-ci-image:
    docker build -t apps-ci:local -f tools/ci-image/Dockerfile tools/ci-image

# Run the full CI pipeline inside the CI image, with cache volumes.
# Pass BASE (e.g. origin/main) to scope clippy/test to crates affected by the diff.
run-ci-image base="": build-ci-image
    docker run --rm \
        -v "$(pwd)":/workspace \
        -v apps-ci-cargo-registry:/usr/local/cargo/registry \
        -v apps-ci-cargo-git:/usr/local/cargo/git \
        -v apps-ci-target:/var/cache/cargo-target \
        -v apps-ci-sccache:/var/cache/sccache \
        -e "CI_BASE_REF={{ base }}" \
        apps-ci:local

# Operate a dev stack. Everything after the name is passed to docker compose.
# just dev borg-vinculum up -d --build | just dev borg-vinculum down | ... logs -f
dev name +args:
    docker compose -f dev/{{ name }}.yml {{ args }}

gen-api name:
    docker compose -f dev/{{ name }}.yml exec frontend frontend/{{ name }}/scripts/gen-api.sh

# Regenerate the mtg frontend's client for the graph advisor API
gen-graph-api:
    docker compose -f dev/mtg.yml exec frontend frontend/mtg/scripts/gen-graph-api.sh

# Run the deck-lab CLI inside the mtg dev stack's graph container.
# just graph ingest | just graph ingest-tags | just graph build-semantics | ...
graph +args:
    docker compose -f dev/mtg.yml exec graph uv run --frozen --extra api --extra solver --extra edhrec deck-lab {{ args }}

# Run the mtg-graph Python checks (same as CI: lint + tests)
graph-ci:
    cd services/mtg-graph && uv sync --locked --all-extras && uv run --no-sync ruff check . && uv run --no-sync pytest

# psql shell in a dev stack's database
db name:
    docker compose -f dev/{{ name }}.yml exec postgres sh -c 'psql -U $POSTGRES_USER $POSTGRES_DB'

# Feed a dev stack's database an sql script, e.g. `just db-run mtg < probe.sql`.
# The same shell as `just db`, without the terminal it insists on: a piped
# script has no tty, and `exec` refuses to run without one unless told.
db-run name:
    docker compose -f dev/{{ name }}.yml exec -T postgres sh -c 'psql -U $POSTGRES_USER -v ON_ERROR_STOP=1 $POSTGRES_DB'

# Operate a prod stack. Everything after the name is passed to docker compose.
# Run this on the host the stack is deployed to — it reads deploy/<name>/.env.
# just prod semmelei pull | just prod semmelei up -d | ... logs -f
prod name +args:
    docker compose -f deploy/{{ name }}/compose.yml {{ args }}

# psql shell in a prod stack's database
prod-db name:
    docker compose -f deploy/{{ name }}/compose.yml exec postgres sh -c 'psql -U $POSTGRES_USER $POSTGRES_DB'

# Dump a prod stack's database (plain sql, gzipped)
prod-db-dump name out=(name + ".sql.gz"):
    docker compose -f deploy/{{ name }}/compose.yml exec -T postgres \
        sh -c 'pg_dump -U $POSTGRES_USER $POSTGRES_DB' | gzip > {{ out }}

# Refresh the vendored AAGUID -> authenticator name list used to name passkeys
update-aaguids:
    python3 tools/update-aaguids.py
