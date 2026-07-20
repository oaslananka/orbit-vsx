# renovate: datasource=docker depName=node
FROM node:24.18.0-bookworm-slim@sha256:d45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6 AS runner

COPY scripts/install-headless-deps.sh /usr/local/bin/install-orbit-headless-deps
RUN /usr/local/bin/install-orbit-headless-deps

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack enable \
  && corepack prepare "$(node -p "require('./package.json').packageManager")" --activate \
  && corepack pnpm install --frozen-lockfile

COPY . .
RUN node scripts/check-headless-runner.mjs

ARG ORBIT_VSCODE_TEST_VERSION=stable
ENV ORBIT_VSCODE_TEST_VERSION=${ORBIT_VSCODE_TEST_VERSION}
ENV ORBIT_TEST_ARTIFACTS_DIR=/workspace/.orbit-test-artifacts

CMD ["corepack", "pnpm", "run", "verify:headless"]

FROM runner AS verify
RUN corepack pnpm run verify:headless
