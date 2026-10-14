#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ ! -d node_modules/sharp ]; then
  npm ci --no-audit --no-fund
fi
node export.mjs
