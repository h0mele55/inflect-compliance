#!/usr/bin/env bash
# Local CI pipeline (bash wrapper for ci-local.mjs)
# Usage: bash scripts/ci-local.sh [--skip-db] [--no-build]
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/ci-local.mjs "$@"
