#!/bin/sh
set -e

echo "╔══════════════════════════════════════════╗"
echo "║  Inflect Compliance — Container Start    ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Apply Prisma migrations (idempotent) ──
echo ""
echo "→ Applying database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma
echo "✓ Migrations applied"

# ── 2. Create upload directory if missing ──
FILE_DIR="${FILE_STORAGE_ROOT:-/data/uploads}"
mkdir -p "$FILE_DIR" 2>/dev/null || true
echo "✓ Upload directory ready: $FILE_DIR"

# ── 3. Start Next.js ──
echo ""
echo "→ Starting Next.js server on port ${PORT:-3000}..."
exec node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
