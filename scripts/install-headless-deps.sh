#!/usr/bin/env bash
set -euo pipefail

packages=(
  ca-certificates
  git
  unzip
  xauth
  xvfb
  libasound2
  libatk1.0-0
  libatk-bridge2.0-0
  libatspi2.0-0
  libcairo2
  libcups2
  libdrm2
  libgbm1
  libgtk-3-0
  libnspr4
  libnss3
  libpango-1.0-0
  libx11-6
  libx11-xcb1
  libxcb1
  libxcomposite1
  libxdamage1
  libxext6
  libxfixes3
  libxkbcommon0
  libxrandr2
  libxss1
)

if ! command -v apt-get >/dev/null 2>&1; then
  echo 'This installer currently supports Debian/Ubuntu apt-based runners.' >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  elevate=()
elif command -v sudo >/dev/null 2>&1; then
  elevate=(sudo)
else
  echo 'Root privileges or sudo are required to install headless test dependencies.' >&2
  exit 1
fi

"${elevate[@]}" apt-get update
"${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${packages[@]}"
"${elevate[@]}" rm -rf /var/lib/apt/lists/*
