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

COPY . .
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
RUN cargo chef cook --release --target x86_64-unknown-linux-musl --package mtg --recipe-path recipe.json

COPY . .

RUN <<EOF
set -e
cargo build --target x86_64-unknown-linux-musl --locked --release --package mtg
cp -v /build/target/x86_64-unknown-linux-musl/release/mtg /build
EOF

FROM dhi.io/alpine-base:3.23@sha256:851d99ede519a3c3550d51d2f4f3998f91dfb3754cb510755dc8742fa50c1867

COPY --from=builder /build/mtg /usr/local/bin/

# Applied automatically at startup
COPY ./services/mtg/migrations /migrations

ENTRYPOINT ["/usr/local/bin/mtg"]
CMD ["start"]
