FROM rust:1.96.0-trixie@sha256:58fe97504a0e4cbba5d85599619a589923d3e779472a6fb0840d58d1c4ba99d7 AS chef

RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils musl-tools protobuf-compiler libprotobuf-dev mold
rm -rf /var/lib/apt/lists/*
EOF

RUN rustup target add x86_64-unknown-linux-musl

# renovate: datasource=github-releases depName=LukeMathWalker/cargo-chef versioning=semver
ARG CARGO_CHEF_VERSION=0.1.78
RUN <<EOF
set -e
curl -fsSL "https://github.com/LukeMathWalker/cargo-chef/releases/download/v${CARGO_CHEF_VERSION}/cargo-chef-x86_64-unknown-linux-musl.tar.xz" \
    | tar xJ --strip-components=1 -C /usr/local/bin/ "cargo-chef-x86_64-unknown-linux-musl/cargo-chef"
cargo chef --version
EOF

WORKDIR /build

FROM chef AS planner

# Only what a cargo build reads. `COPY . .` would put the frontend, the compose
# stacks and the workflows into the build's cache key as well, so every edit
# anywhere in the repo rebuilt the whole workspace.
COPY Cargo.toml Cargo.lock ./
COPY proto proto
COPY libs libs
COPY services services
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder

# The dependencies, in a layer of their own. Their inputs are the manifests and
# the lockfile, nothing else, so the layer survives every commit that leaves
# those alone — which is what makes the release cache worth having. Building
# them inside the layer is the point: BuildKit does not export `type=cache`
# mounts, so anything a mount holds is gone by the next build.
#
# `.cargo/config.toml` has to be in place before the dependencies are built:
# its rustflags are part of every unit's fingerprint, and units built without
# them are simply rebuilt below.
COPY .cargo/config.toml .cargo/config.toml
# The stub behind `[patch.crates-io]` (see libs/sqlx-sqlite/README.md). It sits
# outside the workspace, so it is copied in rather than left to the recipe.
COPY libs/sqlx-sqlite libs/sqlx-sqlite
COPY --from=planner /build/recipe.json recipe.json
# No `--locked` here: the recipe carries its own lockfile, written with local
# versions masked, and cargo insists on rewriting it. The real lockfile is
# enforced by the build below, which is where it matters.
RUN cargo chef cook --release --target x86_64-unknown-linux-musl --package bnv-manager-v2 --recipe-path recipe.json

# Same set as the planner, least-changing first.
COPY Cargo.toml Cargo.lock ./
COPY proto proto
COPY libs libs
COPY services services

RUN <<EOF
set -e
cargo build --target x86_64-unknown-linux-musl --locked --release --package bnv-manager-v2
cp -v /build/target/x86_64-unknown-linux-musl/release/bnv-manager-v2 /build
EOF

# An empty directory to copy into the runtime image below — the hardened base
# has no shell user that could `mkdir` one there.
RUN mkdir -p /build/state

FROM dhi.io/alpine-base:3.23@sha256:851d99ede519a3c3550d51d2f4f3998f91dfb3754cb510755dc8742fa50c1867

COPY --from=builder /build/bnv-manager-v2 /usr/local/bin/

# Applied automatically at startup
COPY ./services/bnv-manager-v2/migrations /migrations

# The OIDC module persists its RSA signing key in here (modules/oidc), so the
# directory has to exist and be writable by the uid the base image runs as
# (65532/nonroot). It has to exist *in the image*, not just in compose: a
# fresh named volume takes its ownership from the directory it is mounted
# over, and one mounted over a path the image does not have ends up owned by
# root — unwritable for this process.
#
# Copied in rather than created with `mkdir`: the hardened base image carries
# no root entry in /etc/passwd, so `USER root` cannot be switched to.
COPY --from=builder --chown=65532:65532 /build/state /var/lib/bnv-manager

ENTRYPOINT ["/usr/local/bin/bnv-manager-v2"]
CMD ["start"]
