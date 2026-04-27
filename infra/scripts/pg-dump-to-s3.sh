#!/usr/bin/env bash
# Self-hosted Postgres → S3 nightly dump (Epic OI-3 fallback path).
#
# When the primary deployment model is managed RDS (Epic OI-1 / OI-2),
# automated PITR is the canonical backup mechanism — operator-side
# verification via Terraform's backup_retention_days, and restore
# validation via infra/scripts/restore-test.sh.
#
# This script handles the FALLBACK case: deployments still using the
# self-hosted docker-compose path at deploy/docker-compose.prod.yml.
# Those run vanilla Postgres in a container; PITR isn't available
# without a separate backup tool. pg_dump → S3 is the pragmatic
# substitute.
#
# Schedule via cron on the deploy host (1am local, daily):
#
#   0 1 * * * /opt/inflect/infra/scripts/pg-dump-to-s3.sh \
#               > /var/log/inflect-pg-dump.log 2>&1
#
# Required env (set in cron environment or sourced from /etc/inflect/backup.env):
#   PG_HOST                 — e.g. 127.0.0.1 (or the compose service name)
#   PG_PORT                 — default 5432
#   PG_USER                 — superuser-or-equivalent
#   PG_PASSWORD             — exposed via PGPASSWORD env var below
#   PG_DATABASE             — default inflect_compliance
#   S3_BUCKET               — destination bucket (must have SSE-S3 default
#                             encryption; the chart's storage module
#                             enforces this)
#   S3_PREFIX               — default: pg-backups
#   AWS_REGION              — default: us-east-1
#   GPG_RECIPIENT           — optional. If set, the dump is GPG-encrypted
#                             before upload (defence in depth on top of S3
#                             SSE).
#
# Required tooling: pg_dump (matching server major version), aws cli,
# gpg (only if GPG_RECIPIENT is set).
#
# Retention: enforced server-side via S3 lifecycle. Set the bucket's
# lifecycle config (chart's storage module values: storage_force_destroy
# is the destroy-allow flag, NOT retention. Lifecycle is set
# separately) to expire `pg-backups/*` after 30 days.

set -euo pipefail

# ─── Defaults + required env ───
: "${PG_HOST:?PG_HOST must be set}"
: "${PG_PORT:=5432}"
: "${PG_USER:?PG_USER must be set}"
: "${PG_PASSWORD:?PG_PASSWORD must be set}"
: "${PG_DATABASE:=inflect_compliance}"
: "${S3_BUCKET:?S3_BUCKET must be set}"
: "${S3_PREFIX:=pg-backups}"
: "${AWS_REGION:=us-east-1}"

# ─── Tooling check ───
for tool in pg_dump aws; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FATAL: required tool not found: $tool" >&2
        exit 2
    fi
done

if [ -n "${GPG_RECIPIENT:-}" ]; then
    if ! command -v gpg >/dev/null 2>&1; then
        echo "FATAL: GPG_RECIPIENT set but gpg is not installed" >&2
        exit 2
    fi
fi

# ─── Naming + paths ───
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
HOSTNAME="$(hostname -s 2>/dev/null || echo unknown)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

DUMP_FILE="$TMPDIR/${PG_DATABASE}_${TIMESTAMP}.sql.gz"
S3_KEY="${S3_PREFIX}/${PG_DATABASE}/${TIMESTAMP}_${HOSTNAME}.sql.gz"

if [ -n "${GPG_RECIPIENT:-}" ]; then
    DUMP_FILE="${DUMP_FILE}.gpg"
    S3_KEY="${S3_KEY}.gpg"
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  pg_dump → S3"
echo "  Source: $PG_USER@$PG_HOST:$PG_PORT/$PG_DATABASE"
echo "  Target: s3://$S3_BUCKET/$S3_KEY"
[ -n "${GPG_RECIPIENT:-}" ] && echo "  GPG:    enabled (recipient: $GPG_RECIPIENT)"
echo "═══════════════════════════════════════════════════════════════"

# ─── Dump → compress → (optionally encrypt) → upload ───
export PGPASSWORD="$PG_PASSWORD"

echo ""
echo "── 1. pg_dump (custom format → gzip) ──"
if [ -n "${GPG_RECIPIENT:-}" ]; then
    pg_dump \
        -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        | gpg --batch --yes --trust-model always \
              --encrypt --recipient "$GPG_RECIPIENT" \
              --output "$DUMP_FILE"
else
    pg_dump \
        -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        --file="$DUMP_FILE"
fi

unset PGPASSWORD

DUMP_SIZE_BYTES="$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")"
echo "✓ Dumped: $DUMP_SIZE_BYTES bytes"

if [ "$DUMP_SIZE_BYTES" -lt 1024 ]; then
    echo "FATAL: dump file is suspiciously small (<1KB) — likely a failed dump" >&2
    exit 3
fi

# ─── Upload to S3 ───
echo ""
echo "── 2. Upload to s3://$S3_BUCKET/$S3_KEY ──"
aws s3 cp "$DUMP_FILE" "s3://$S3_BUCKET/$S3_KEY" \
    --region "$AWS_REGION" \
    --no-progress \
    --metadata "source-host=$HOSTNAME,source-database=$PG_DATABASE,timestamp=$TIMESTAMP"

echo "✓ Upload complete"

# ─── Sanity-check the upload ───
echo ""
echo "── 3. Verify upload ──"
aws s3api head-object \
    --bucket "$S3_BUCKET" \
    --key "$S3_KEY" \
    --region "$AWS_REGION" \
    --output text \
    --query "{size: ContentLength, sse: ServerSideEncryption}" \
    | awk '{ printf "  size=%s  sse=%s\n", $1, $2 }'

echo ""
echo "✓ pg_dump backup complete"
echo ""
echo "Note: 30-day retention is enforced server-side via S3 lifecycle."
echo "      Verify with:"
echo "        aws s3api get-bucket-lifecycle-configuration --bucket $S3_BUCKET"
