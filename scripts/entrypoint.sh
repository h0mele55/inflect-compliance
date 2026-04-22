#!/bin/sh
set -e

echo "╔══════════════════════════════════════════╗"
echo "║  Inflect Compliance — Container Start    ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Apply Prisma migrations (idempotent) ──
#
# Pin the CLI version to match @prisma/client in package.json. If
# `prisma` is ever pruned from the image (e.g. someone moves it
# back to devDependencies), `npx prisma` would otherwise fetch
# `latest` from npm — Prisma 7 dropped the `url`/`directUrl`
# datasource properties, which silently broke prod boot in April
# 2026. Pinning forces the known-good resolver.
echo ""
echo "→ Applying database migrations..."
npx --yes prisma@5.22.0 migrate deploy --schema=./prisma/schema.prisma
echo "✓ Migrations applied"

# ── 2. Create upload directory if missing ──
FILE_DIR="${FILE_STORAGE_ROOT:-/data/uploads}"
mkdir -p "$FILE_DIR" 2>/dev/null || true
echo "✓ Upload directory ready: $FILE_DIR"

# ── 3. Start Next.js ──
echo ""
echo "→ Starting Next.js server on port ${PORT:-3000}..."
exec node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
