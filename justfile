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

# Format code
fmt:
    cargo +nightly fmt --all

# Check formatting
fmt-check:
    cargo +nightly fmt --all -- --check

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
