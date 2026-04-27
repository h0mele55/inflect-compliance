#!/usr/bin/env bash
# Resolves runtime secrets from AWS Secrets Manager and writes them to
# a local env file the compose stack consumes via env_file.
#
# Companion to Epic OI-1's secrets module:
#   infra/terraform/modules/secrets/
#
# Production model (replaces plaintext .env.production):
#   1. Terraform applies the secrets module → secret containers exist
#      and are populated with generated or operator-supplied values.
#   2. Operator runs this script on the deploy host (with an IAM role
#      attached, OR with AWS_PROFILE set).
#   3. .env.runtime is written. docker-compose.prod.yml's env_file
#      directive points at it.
#   4. `docker compose up -d`. Container env now carries the resolved
#      runtime secrets without any of them having lived on disk in
#      plaintext outside this short-lived file.
#
# Once compute migrates to ECS, this script becomes obsolete — the
# task definition's native `secrets:` mapping resolves Secrets Manager
# values into env vars at task-launch with zero on-disk footprint.

set -euo pipefail

# ─── Defaults ───
ENV_PREFIX=""
OUTPUT_FILE=".env.runtime"
DB_HOST=""
DB_PORT="5432"
DB_NAME="inflect_compliance"
REDIS_HOST=""
REDIS_PORT="6379"
S3_BUCKET=""
S3_REGION="us-east-1"
APP_HOSTNAME=""
RDS_SECRET_NAME=""
REDIS_SECRET_NAME=""

usage() {
    cat <<'EOF'
Usage:
  bootstrap-env-from-secrets.sh \
    --env-prefix <inflect-compliance-{staging,production}> \
    --rds-secret <rds-managed-secret-name> \
    --redis-secret <inflect-compliance-{env}-redis-auth> \
    --db-host <rds-endpoint-host> \
    --redis-host <elasticache-primary-endpoint> \
    --s3-bucket <bucket-name> \
    --s3-region <aws-region> \
    --app-hostname <fqdn-without-scheme> \
    [--output <path>]                  default: .env.runtime
    [--db-port <port>]                 default: 5432
    [--db-name <name>]                 default: inflect_compliance
    [--redis-port <port>]              default: 6379

Required IAM (on the EC2 role / operator AWS_PROFILE):
  secretsmanager:GetSecretValue + DescribeSecret on:
    <env-prefix>-data-encryption-key
    <env-prefix>-auth-secret
    <env-prefix>-jwt-secret
    <env-prefix>-av-webhook-secret
    <env-prefix>-google-client-secret
    <env-prefix>-microsoft-client-secret
    <rds-secret-name>            (RDS-managed master credentials)
    <env-prefix>-redis-auth      (ElastiCache AUTH token)

Resolves these into a single env file at OUTPUT_FILE. Discover the
right values for the connection-target inputs from the terraform root
outputs (db_address, redis_primary_endpoint, storage_bucket_id,
runtime_secret_names, db_secret_arn).

Exit codes:
  0 — all secrets resolved, file written
  1 — missing required arg
  2 — missing required tool (aws, jq)
  3 — secret fetch failed (permission denied, missing secret, etc.)
  4 — placeholder value detected (operator forgot to put-secret-value)
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --env-prefix)    ENV_PREFIX="$2"; shift 2 ;;
        --output)        OUTPUT_FILE="$2"; shift 2 ;;
        --db-host)       DB_HOST="$2"; shift 2 ;;
        --db-port)       DB_PORT="$2"; shift 2 ;;
        --db-name)       DB_NAME="$2"; shift 2 ;;
        --redis-host)    REDIS_HOST="$2"; shift 2 ;;
        --redis-port)    REDIS_PORT="$2"; shift 2 ;;
        --s3-bucket)     S3_BUCKET="$2"; shift 2 ;;
        --s3-region)     S3_REGION="$2"; shift 2 ;;
        --app-hostname)  APP_HOSTNAME="$2"; shift 2 ;;
        --rds-secret)    RDS_SECRET_NAME="$2"; shift 2 ;;
        --redis-secret)  REDIS_SECRET_NAME="$2"; shift 2 ;;
        -h|--help)       usage; exit 0 ;;
        *)               echo "Unknown arg: $1"; usage; exit 1 ;;
    esac
done

# ─── Required-arg check ───
require_arg() {
    if [ -z "$2" ]; then
        echo "missing required arg: --$1" >&2
        usage
        exit 1
    fi
}
require_arg "env-prefix"    "$ENV_PREFIX"
require_arg "rds-secret"    "$RDS_SECRET_NAME"
require_arg "redis-secret"  "$REDIS_SECRET_NAME"
require_arg "db-host"       "$DB_HOST"
require_arg "redis-host"    "$REDIS_HOST"
require_arg "s3-bucket"     "$S3_BUCKET"
require_arg "app-hostname"  "$APP_HOSTNAME"

# ─── Tool check ───
for tool in aws jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "missing required tool: $tool" >&2
        exit 2
    fi
done

# ─── Secret fetch helper ───
fetch_secret() {
    local secret_name="$1"
    local result
    if ! result="$(aws secretsmanager get-secret-value \
        --secret-id "$secret_name" \
        --query SecretString \
        --output text 2>&1)"; then
        echo "FATAL: failed to fetch secret '$secret_name': $result" >&2
        exit 3
    fi
    if [[ "$result" == PLACEHOLDER_set_via_aws_secretsmanager* ]]; then
        echo "FATAL: secret '$secret_name' still holds the terraform placeholder" >&2
        echo "       run: aws secretsmanager put-secret-value --secret-id $secret_name --secret-string <real-value>" >&2
        exit 4
    fi
    printf '%s' "$result"
}

# ─── Fetch generated secrets (raw strings) ───
echo "fetching: ${ENV_PREFIX}-data-encryption-key" >&2
DATA_ENCRYPTION_KEY="$(fetch_secret "${ENV_PREFIX}-data-encryption-key")"

echo "fetching: ${ENV_PREFIX}-auth-secret" >&2
AUTH_SECRET="$(fetch_secret "${ENV_PREFIX}-auth-secret")"

echo "fetching: ${ENV_PREFIX}-jwt-secret" >&2
JWT_SECRET="$(fetch_secret "${ENV_PREFIX}-jwt-secret")"

echo "fetching: ${ENV_PREFIX}-av-webhook-secret" >&2
AV_WEBHOOK_SECRET="$(fetch_secret "${ENV_PREFIX}-av-webhook-secret")"

echo "fetching: ${ENV_PREFIX}-google-client-secret" >&2
GOOGLE_CLIENT_SECRET="$(fetch_secret "${ENV_PREFIX}-google-client-secret")"

echo "fetching: ${ENV_PREFIX}-microsoft-client-secret" >&2
MICROSOFT_CLIENT_SECRET="$(fetch_secret "${ENV_PREFIX}-microsoft-client-secret")"

# ─── Fetch chained JSON secrets (RDS + Redis) ───
echo "fetching: $RDS_SECRET_NAME (RDS-managed)" >&2
RDS_JSON="$(fetch_secret "$RDS_SECRET_NAME")"
DB_USER="$(printf '%s' "$RDS_JSON" | jq -r '.username')"
DB_PASSWORD="$(printf '%s' "$RDS_JSON" | jq -r '.password')"

if [ -z "$DB_USER" ] || [ "$DB_USER" = "null" ] || [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "null" ]; then
    echo "FATAL: RDS secret JSON missing username/password fields" >&2
    exit 3
fi

echo "fetching: $REDIS_SECRET_NAME" >&2
REDIS_JSON="$(fetch_secret "$REDIS_SECRET_NAME")"
REDIS_AUTH_TOKEN="$(printf '%s' "$REDIS_JSON" | jq -r '.auth_token')"

if [ -z "$REDIS_AUTH_TOKEN" ] || [ "$REDIS_AUTH_TOKEN" = "null" ]; then
    echo "FATAL: Redis secret JSON missing auth_token field" >&2
    exit 3
fi

# ─── URL encode helper (for password chars in DSN) ───
urlencode() {
    local raw="$1"
    local encoded=""
    local i ch
    for ((i=0; i<${#raw}; i++)); do
        ch="${raw:i:1}"
        case "$ch" in
            [a-zA-Z0-9.~_-]) encoded+="$ch" ;;
            *) encoded+=$(printf '%%%02X' "'$ch") ;;
        esac
    done
    printf '%s' "$encoded"
}

DB_PASSWORD_ENC="$(urlencode "$DB_PASSWORD")"
REDIS_AUTH_ENC="$(urlencode "$REDIS_AUTH_TOKEN")"

# ─── Write the runtime env file ───
# Permissions: 0600 — only the deploy user can read.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

cat > "$TMP" <<EOF
# Generated by scripts/bootstrap-env-from-secrets.sh
# DO NOT commit. DO NOT copy to a long-lived location.
# Regenerate before each deploy.

NODE_ENV=production

# ── Database (assembled from RDS-managed credentials) ──
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD_ENC}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public&sslmode=require
DIRECT_DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD_ENC}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public&sslmode=require

# ── Redis (assembled from ElastiCache AUTH; rediss:// = TLS) ──
REDIS_URL=rediss://default:${REDIS_AUTH_ENC}@${REDIS_HOST}:${REDIS_PORT}

# ── NextAuth / JWT ──
NEXTAUTH_URL=https://${APP_HOSTNAME}
AUTH_URL=https://${APP_HOSTNAME}
AUTH_SECRET=${AUTH_SECRET}
JWT_SECRET=${JWT_SECRET}

# ── OAuth ──
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
MICROSOFT_CLIENT_SECRET=${MICROSOFT_CLIENT_SECRET}

# ── Storage ──
STORAGE_PROVIDER=s3
S3_BUCKET=${S3_BUCKET}
S3_REGION=${S3_REGION}
# S3_ENDPOINT left unset → defaults to AWS S3 regional endpoint.
# IAM-based auth — no S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY needed
# when running on EC2/ECS with the runtime-secrets-read role attached
# (or use the storage module's access_policy_arn directly).

# ── Antivirus ──
AV_WEBHOOK_SECRET=${AV_WEBHOOK_SECRET}

# ── Data protection (master KEK) ──
DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY}

# ── App URLs ──
APP_URL=https://${APP_HOSTNAME}
CORS_ALLOWED_ORIGINS=https://${APP_HOSTNAME}
EOF

# Move into place atomically with restrictive perms
install -m 0600 "$TMP" "$OUTPUT_FILE"

# Final placeholder check — defence in depth (fetch_secret already
# guards this, but a shell typo above could let one through).
if grep -q PLACEHOLDER "$OUTPUT_FILE"; then
    echo "FATAL: placeholder values leaked into $OUTPUT_FILE — refusing to deploy with this file" >&2
    rm -f "$OUTPUT_FILE"
    exit 4
fi

echo "wrote: $OUTPUT_FILE (mode 0600)" >&2
