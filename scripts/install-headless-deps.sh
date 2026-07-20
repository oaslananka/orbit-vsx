#!/usr/bin/env bash
set -euo pipefail

packages=(
  ca-certificates
  git
  unzip
  xauth
  xvfb
  libcairo2
  libdrm2
  libgbm1
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

select_package() {
  local candidate version
  for candidate in "$@"; do
    version="$(apt-cache policy "$candidate" 2>/dev/null | awk '/Candidate:/ { print $2; exit }')"
    if [ -n "$version" ] && [ "$version" != '(none)' ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "No installable package candidate found for: $*" >&2
  return 1
}

packages+=("$(select_package libasound2t64 libasound2)")
packages+=("$(select_package libatk1.0-0t64 libatk1.0-0)")
packages+=("$(select_package libatk-bridge2.0-0t64 libatk-bridge2.0-0)")
packages+=("$(select_package libatspi2.0-0t64 libatspi2.0-0)")
packages+=("$(select_package libcups2t64 libcups2)")
packages+=("$(select_package libgtk-3-0t64 libgtk-3-0)")

"${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${packages[@]}"
"${elevate[@]}" rm -rf /var/lib/apt/lists/*
