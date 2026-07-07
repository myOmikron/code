FROM node:24@sha256:5a593d74b632d1c6f816457477b6819760e13624455d587eef0fa418c8d0777b AS final

WORKDIR /app

RUN <<EOF
set -e
apt-get update
apt-get install -y wget default-jre-headless
EOF

CMD ["npm", "run", "dev"]