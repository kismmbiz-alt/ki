#!/usr/bin/env bash
# Запуск CRM на своём компьютере (macOS / Linux)
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Установите Node.js с https://nodejs.org (кнопка LTS)"; exit 1; }
[ -d node_modules ] || npm ci --no-audit --no-fund
exec node scripts/local.mjs
