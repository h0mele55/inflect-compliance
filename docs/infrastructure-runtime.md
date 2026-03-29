# Infrastructure Runtime Guide — Epic 15

Production-aware runtime architecture for Inflect Compliance.

## Service Map

```
┌─────────────┐    ┌───────────┐    ┌──────────┐
│  Next.js    │───▶│ PgBouncer │───▶│ Postgres │
│   App       │    │ (pool)    │    │  16      │
│             │    └───────────┘    └──────────┘
│             │
│             │───▶ Redis 7 ◀────── BullMQ Worker
│             │      │
│             │      └── Queue: inflect-jobs
│             │
│             │───▶ S3 / MinIO ◀─── ClamAV
└─────────────┘
```

## 1. PgBouncer

| Setting | Value |
|---|---|
| Mode | `transaction` |
| Pool size | 25 default, 50 max |
| Max client conns | 200 |

**URLs:**
- `DATABASE_URL` → PgBouncer (port 5433 dev, 5432 internal)
- `DIRECT_DATABASE_URL` → Postgres direct (migrations only)

Append `?pgbouncer=true` to `DATABASE_URL` for Prisma compatibility.

## 2. Redis

| Env var | Required | Default |
|---|---|---|
| `REDIS_URL` | Optional | none (graceful degradation) |

**Connection helpers** (`src/lib/redis.ts`):
- `getRedis()` — singleton, returns `null` if unconfigured
- `getRedisOrThrow()` — throws if unavailable
- `createRedisClient()` — isolated connection (for BullMQ workers)

## 3. BullMQ

### Queue
Single queue `inflect-jobs` with typed named jobs.

```typescript
import { enqueue } from '@/app-layer/jobs/queue';
await enqueue('health-check', { enqueuedAt: new Date().toISOString() });
```

### Worker
```bash
npx tsx scripts/worker.ts    # standalone daemon
```
- 6 processors: health-check, automation-runner, daily-evidence-expiry, data-lifecycle, policy-review-reminder, retention-sweep
- Dynamic imports (Prisma loads on first job, not at boot)
- Concurrency: 5, rate limit: 50/min
- SIGTERM/SIGINT graceful shutdown

### Scheduler
```bash
npx tsx scripts/scheduler.ts          # register (run once on deploy)
npx tsx scripts/scheduler.ts --list   # list registered
npx tsx scripts/scheduler.ts --clean  # remove all
```

### Schedules (UTC)

| Job | Pattern | Cadence |
|---|---|---|
| automation-runner | `*/15 * * * *` | Every 15 min |
| daily-evidence-expiry | `0 6 * * *` | Daily 06:00 |
| data-lifecycle | `0 3 * * *` | Daily 03:00 |
| policy-review-reminder | `0 8 * * *` | Daily 08:00 |
| retention-sweep | `0 4 * * *` | Daily 04:00 |

## 4. S3 Storage

| Env var | Required | Default |
|---|---|---|
| `STORAGE_PROVIDER` | No | `s3` |
| `S3_BUCKET` | When s3 | — |
| `S3_REGION` | When s3 | `us-east-1` |
| `S3_ENDPOINT` | For MinIO/R2 | — |
| `S3_ACCESS_KEY_ID` | Optional (IAM) | — |
| `S3_SECRET_ACCESS_KEY` | Optional (IAM) | — |

**Object keys:** `tenants/<tenantId>/<domain>/yyyy/mm/<uuid>_<name>`

Domains: `evidence`, `reports`, `exports`, `temp`, `general`

## 5. ClamAV Scanning

| Env var | Required | Default |
|---|---|---|
| `AV_SCAN_MODE` | No | `strict` |
| `CLAMAV_HOST` | When strict | — |
| `AV_WEBHOOK_SECRET` | Prod webhook | — |

**Modes:**
- `strict` — downloads blocked until scan completes
- `permissive` — downloads allowed while scan pending
- `disabled` — no scanning (dev only)

**Scanning paths:**
1. Direct: `scanBuffer()` via clamd TCP INSTREAM
2. Webhook: POST `/api/storage/av-webhook` (HMAC-authenticated)

**Lifecycle:** Upload → STORED (scanStatus: PENDING) → CLEAN/INFECTED

## 6. Local Dev vs Production

| Concern | Dev (`.env`) | Production |
|---|---|---|
| DB | PgBouncer :5433 | PgBouncer internal |
| Redis | localhost:6379 | redis:6379 internal |
| Storage | `local` filesystem | `s3` (default) |
| AV Scan | `disabled` | `strict` |
| ClamAV | optional | required (health-gated) |
| Worker | manual `npx tsx` | daemon process |

## 7. Deployment Checklist

```bash
# 1. Start infrastructure
docker compose -f docker-compose.prod.yml up -d

# 2. Run migrations (direct connection)
npx prisma migrate deploy

# 3. Register BullMQ schedules
npx tsx scripts/scheduler.ts

# 4. Start worker daemon
npx tsx scripts/worker.ts

# 5. Start app
npm start
```
