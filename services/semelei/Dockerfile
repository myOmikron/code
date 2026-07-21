FROM rust:1.96.0-trixie@sha256:58fe97504a0e4cbba5d85599619a589923d3e779472a6fb0840d58d1c4ba99d7 AS builder

RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends musl-tools protobuf-compiler libprotobuf-dev mold
rm -rf /var/lib/apt/lists/*
EOF

RUN rustup target add x86_64-unknown-linux-musl

WORKDIR /build
COPY . .

# Target dir lives in a cache mount, so the binary must be copied out of it.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target/ <<EOF
set -e
cargo build --target x86_64-unknown-linux-musl --locked --release --package semelei
cp -v /build/target/x86_64-unknown-linux-musl/release/semelei /build
EOF

FROM dhi.io/alpine-base:3.23@sha256:851d99ede519a3c3550d51d2f4f3998f91dfb3754cb510755dc8742fa50c1867

COPY --from=builder /build/semelei /usr/local/bin/

# Applied automatically at startup
COPY ./services/semelei/migrations /migrations

ENTRYPOINT ["/usr/local/bin/semelei"]
CMD ["start"]
