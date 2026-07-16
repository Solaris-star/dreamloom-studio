#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export MARKET_TREND_SCHEDULER=0
export AGENT_TASK_WS_ENABLED=false
export NOVEL_ALLOW_OPEN_AUTH=true
export NOVEL_AUTH_REDIS=false
export NOVEL_BOOKS_DIR=/tmp/dreamloom-a3-styles-books
exec node ./node_modules/vite/bin/vite.js --config vite.web.config.mjs --host 127.0.0.1 --port 5190
