#!/usr/bin/env bash
# Local E2E pipeline (bash wrapper for e2e-local.mjs)
# Usage: bash scripts/e2e-local.sh [--skip-db] [--headed]
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/e2e-local.mjs "$@"
