FROM node:24-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS buildfrontend

WORKDIR /app

COPY ./frontend/package.json .
COPY ./frontend/package-lock.json .
COPY ./frontend/ .

RUN --mount=type=cache,target=./node_modules/ \
    <<EOF
set -e
npm clean-install
npm run build
mv ./dist /frontend
EOF

FROM debian:trixie-slim@sha256:b6e2a152f22a40ff69d92cb397223c906017e1391a73c952b588e51af8883bf8 AS buildswagger

WORKDIR /app

RUN <<EOF
set -e
apt-get update
apt-get install -y wget
EOF

RUN <<EOF
set -e
wget https://github.com/swagger-api/swagger-ui/archive/refs/tags/v5.18.2.tar.gz
tar xf v5.18.2.tar.gz
mv swagger-ui-5.18.2/dist swagger-ui
EOF


FROM  dhi.io/nginx:1.31@sha256:e44f44309ad57c6db303a9a2fe6efc96649a5784a486e5d020b97f96eb584289 AS final
LABEL org.opencontainers.image.source=https://github.com/myOmikron/bnv-manager-v2

COPY --from=buildfrontend /frontend /usr/share/nginx/html/frontend
COPY --from=buildswagger /app/swagger-ui /usr/share/nginx/html/swagger-ui
COPY ./build/nginx/swagger-initializer.js /usr/share/nginx/html/swagger-ui/
