FROM rust:1.95.0-slim-trixie@sha256:81099830a1e1d244607b9a7a30f3ff6ecadc52134a933b4635faba24f52840c9 AS buildrust

WORKDIR /app

RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends musl-tools
rm -rf /var/lib/apt/lists/*
EOF

RUN rustup target add x86_64-unknown-linux-musl

RUN --mount=type=bind,source=mailcow/,target=mailcow/ \
    --mount=type=bind,source=webserver/,target=webserver/ \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=bind,source=Cargo.lock,target=Cargo.lock \
    --mount=type=cache,target=/app/target/ \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    <<EOF
set -e
cargo build --locked --target x86_64-unknown-linux-musl -p webserver
cp ./target/x86_64-unknown-linux-musl/debug/webserver /bin/server
EOF


FROM dhi.io/alpine-base:3.23@sha256:27d91b0ae2dbb1bbf89398f4ee4564a0c7a14a82c34c8cffd3b2687033a9d97a AS final
LABEL org.opencontainers.image.source=https://github.com/myOmikron/bnv-manager-v2

# Copy the executable from the "build" stage.
COPY --from=buildrust /bin/server /bin/

# What the container should run when it is started.
CMD ["/bin/server", "start"]
