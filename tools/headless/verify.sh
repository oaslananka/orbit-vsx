#!/usr/bin/env bash
set -euo pipefail

version="${ORBIT_VSCODE_TEST_VERSION:-stable}"
artifacts_dir="${ORBIT_TEST_ARTIFACTS_DIR:-$(pwd)/.orbit-test-artifacts/container}"
docker_command=(docker)

if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    docker_command=(sudo -n docker)
  else
    cat >&2 <<'MESSAGE'
Docker is installed but the current user cannot access the Docker API.
Add the operator account to the docker group, configure rootless Docker, or run the
VS Code Compatibility workflow on a GitHub-hosted runner. No privilege changes were made.
MESSAGE
    exit 1
  fi
fi

mkdir -p "$artifacts_dir"
"${docker_command[@]}" build \
  --file tools/headless/Dockerfile \
  --target runner \
  --tag orbit-vsx-headless:local \
  .
"${docker_command[@]}" run --rm \
  --shm-size=1g \
  --env "ORBIT_VSCODE_TEST_VERSION=${version}" \
  --env ORBIT_TEST_ARTIFACTS_DIR=/artifacts \
  --volume "${artifacts_dir}:/artifacts" \
  orbit-vsx-headless:local \
  corepack pnpm run verify:headless
