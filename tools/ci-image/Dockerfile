FROM rust:1.96.0-slim-trixie@sha256:26abcef3d79b8d890c4ceb17093154573e1f6479cf6dd7c1450043b8458350f6

RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    libprotobuf-dev \
    apt \
    mold \
    python3 \
    sccache
rm -rf /var/lib/apt/lists/*
EOF

RUN rustup component add clippy

RUN rustup toolchain install nightly --profile minimal --component rustfmt

# renovate: datasource=github-releases depName=EmbarkStudios/cargo-deny versioning=semver
ARG CARGO_DENY_VERSION=0.19.4
RUN <<EOF
set -e
curl -fsSL "https://github.com/EmbarkStudios/cargo-deny/releases/download/${CARGO_DENY_VERSION}/cargo-deny-${CARGO_DENY_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    | tar xz --strip-components=1 -C /usr/local/bin/ "cargo-deny-${CARGO_DENY_VERSION}-x86_64-unknown-linux-musl/cargo-deny"
cargo-deny --version
EOF

COPY --chmod=0755 run-ci.sh /usr/local/bin/run-ci

# Cache locations — bind these to volumes / runner cache to persist across runs.
#   /usr/local/cargo/registry  cargo registry cache (CARGO_HOME default)
#   /usr/local/cargo/git       cargo git deps
#   /var/cache/cargo-target    workspace target dir (kept off the bind-mounted
#                              host workspace to avoid platform/glibc skew)
#   /var/cache/sccache         sccache cache
ENV CARGO_TARGET_DIR=/var/cache/cargo-target \
    SCCACHE_DIR=/var/cache/sccache \
    RUSTC_WRAPPER=sccache
RUN mkdir -p /var/cache/cargo-target /var/cache/sccache

WORKDIR /workspace

CMD ["run-ci"]
