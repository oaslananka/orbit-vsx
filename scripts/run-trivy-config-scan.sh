#!/usr/bin/env bash
set -euo pipefail

# renovate: datasource=github-releases depName=aquasecurity/trivy
TRIVY_VERSION='0.72.0'
TRIVY_ARCHIVE_SHA256='bbb64b9695866ce4a7a8f5c9592002c5961cab378577fa3f8a040df362b9b2ea'
TRIVY_ARCHIVE="trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
TRIVY_URL="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${TRIVY_ARCHIVE}"

if [[ "$(uname -s)" != 'Linux' || "$(uname -m)" != 'x86_64' ]]; then
  echo 'This checksum-pinned Trivy helper currently supports Linux x86_64 only.' >&2
  echo 'Run the Workflow Security GitHub Actions job for the authoritative scan.' >&2
  exit 2
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

curl \
  --fail \
  --location \
  --proto '=https' \
  --retry 3 \
  --show-error \
  --silent \
  --tlsv1.2 \
  --output "$workdir/$TRIVY_ARCHIVE" \
  "$TRIVY_URL"

printf '%s  %s\n' "$TRIVY_ARCHIVE_SHA256" "$workdir/$TRIVY_ARCHIVE" | sha256sum --check --strict -
tar -xzf "$workdir/$TRIVY_ARCHIVE" -C "$workdir" trivy

TRIVY_CACHE_DIR="$workdir/cache" "$workdir/trivy" config \
  --disable-telemetry \
  --exit-code 1 \
  --quiet \
  --severity HIGH,CRITICAL \
  --skip-check-update \
  --skip-version-check \
  tools/headless
