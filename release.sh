#!/usr/bin/env bash
# Builds the desktop app and installs it into ~/Apps, where Spotlight and Launchpad find it.

set -euo pipefail

SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
APP_NAME="Base.app"
BUNDLE="${SCRIPT_DIR}/src-tauri/target/release/bundle/macos/${APP_NAME}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "release.sh installs the macOS app only, use 'npm run desktop:build' elsewhere" >&2
  exit 1
fi

target_dir="${HOME}/Apps"
target="${target_dir}/${APP_NAME}"

cd "$SCRIPT_DIR"
[[ -d node_modules ]] || npm ci
npm run desktop:build

mkdir -p "$target_dir"
# cp -R onto an existing bundle merges into it and keeps files the new build no longer has
rm -rf "$target"
ditto "$BUNDLE" "$target"
mdimport "$target"

echo "installed ${target}"
if pgrep -x base >/dev/null; then
  echo "Base is still running the old build - quit and start it again"
fi
