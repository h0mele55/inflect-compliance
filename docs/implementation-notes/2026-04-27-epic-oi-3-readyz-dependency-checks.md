# 2026-04-27 — Epic OI-3: readyz dependency checks

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Upgrades `GET /api/readyz` from a Postgres-only check + an
optional Redis ping into a real three-dependency readiness probe
(Postgres + Redis + S3) with per-check timeouts and structured
failure reporting.

## Design

### Probe contract

```
GET /api/readyz
  → 200 { "status": "ready", ... }                 if every dep ok / skipped
  → 503 { "status": "not_ready", "failed": [...] } if any dep failed
```

The response carries a flat `failed: string[]` AND a structured
`checks: { name: { status, latencyMs, error? } }` map. Probe
automation that doesn't parse the checks object can read `failed`
directly. Operators reading the JSON in a debug session see the
per-check latency + bounded error code.

### Check semantics

| Dependency | Test | Skipped when | Bounded error codes |
|---|---|---|---|
| Postgres | `prisma.$queryRaw` SELECT 1 | never | `connection_failed`, `timeout` |
| Redis | `client.ping()` (expects "PONG") | `REDIS_URL` is unset | `client_unavailable`, `unexpected_response`, `ping_failed`, `timeout` |
| S3 | `HeadBucketCommand` against `S3_BUCKET` | `STORAGE_PROVIDER != 's3'` | `bucket_not_configured`, `head_bucket_failed`, `timeout` |

**'skipped' counts as ready.** Local-dev environments without Redis
(`REDIS_URL` unset) or with filesystem storage (`STORAGE_PROVIDER=local`)
return 200 with the corresponding check marked `skipped`.
Production deployments (per Epic OI-2's chart values) set both
env vars, so all three checks always run.

### Per-check timeout (2s)

Every check is wrapped in `Promise.race(check, setTimeout(reject))`
with a 2-second budget. Without this, a hung dependency (RDS
endpoint reachable at TCP level but unresponsive at SQL level,
ElastiCache failover in progress, S3 partial regional outage) would
hang the probe indefinitely — Kubernetes' probe timeout would fire
first, but the underlying connection would still be held by the
probe handler and the next probe would compound the issue.

The timeout error message uses a bounded `<dep>_timeout` suffix so
the response classifier can map it to `error: 'timeout'` without
matching free-form error strings (which can carry creds — the raw
Postgres "connection refused" error message includes
`host:port:role`).

### Bounded error codes — credential safety

Every error is mapped to a small enum of bounded codes:
`connection_failed`, `ping_failed`, `head_bucket_failed`,
`unexpected_response`, `bucket_not_configured`, `client_unavailable`,
`timeout`. Raw exception messages NEVER appear in the response. Test
verifies the response body never contains the underlying host/port
string.

This matters because readyz is unauthenticated by design (k8s probes
hit it without credentials). An attacker probing the surface should
learn at most "DB is down" — not "DB host is `inflect-prod-db.xxx.us-east-1.rds.amazonaws.com`
on port 5432, accepted user 'postgres'".

### Module-level client reuse

`PrismaClient`, the ioredis client (via `getRedis()`), and the
S3Client are all instantiated at module load + reused across
probes. K8s probes hit `/api/readyz` every 5–10 seconds; spawning
a fresh client per probe would churn the connection pool and
inflate cold-start latency.

The S3Client construction mirrors `src/lib/storage/s3-provider.ts::getS3Client()`
exactly — same env vars, same fallback chain — so the probe and
the upload path see the same backend. A divergence (e.g. probe
uses `S3_REGION_PROBE` and uploads use `S3_REGION`) would mask
real outages.

### What did NOT change

- The route file path stays at `src/app/api/readyz/route.ts` —
  Kubernetes probes already point here (via the chart's
  `livenessProbe.httpGet.path: /api/readyz` from Epic OI-2).
- The 200/503 status code semantics were already correct in the
  prior implementation — the upgrade extends the check coverage
  rather than reshaping the contract.
- The `livez` endpoint is **untouched**. It stays a process-only
  check (no dependency reaching). Conflating `livez` with `readyz`
  would cause k8s to RESTART pods (livez failure) when only their
  upstream dependency is briefly unhealthy (readyz-shaped failure)
  — that's a recipe for a cascading outage.

## Files

| File | Status | Notes |
|---|---|---|
| `src/app/api/readyz/route.ts` | Rewritten | Adds S3 HeadBucket check; per-check 2s timeout via Promise.race; bounded error codes (no credential leakage); module-level S3Client cache; `failed[]` + structured `checks{}` in response; logs failures via `logger.warn` |
| `tests/unit/readyz.test.ts` | New | 16-assertion unit test using jest.mock on PrismaClient, ioredis (`@/lib/redis::getRedis`), and S3Client to test all 7 spec cases (all-ready / per-dep failure / multi-failure / skipped paths / per-dep timeout / response shape / bucket-not-configured); includes credential-leak negative test |
| `docs/implementation-notes/2026-04-27-epic-oi-3-readyz-dependency-checks.md` | New | This file |

## Decisions

- **Per-check timeout, not request timeout.** A single global
  timeout would fail one slow check by reporting "everything
  failed". Per-check lets a slow Redis surface as `redis: timeout`
  while Postgres and S3 still report their real status.

- **Bounded error codes, not raw error messages.** Probe responses
  go to public k8s probe handlers (no auth). Raw error messages
  routinely carry hostnames, ports, role names — sometimes even
  passwords (Prisma errors with the URL). Mapping to a fixed enum
  keeps the surface safe by construction. The cost is operators
  losing detail in the probe response — but operators have the
  application logs (which DO carry the full error via the
  underlying Prisma/ioredis/S3 client logging).

- **'skipped' as a third check status.** Without it, the probe
  would either fail a local-dev environment that doesn't have
  Redis/S3 configured (annoying), or silently pass an env where
  Redis is misconfigured (dangerous). 'skipped' makes the local-dev
  case explicit + still-passing, while leaving 'error' for actual
  failures.

- **Storage check requires explicit `STORAGE_PROVIDER=s3` opt-in.**
  Mirrors how the existing storage provider factory branches at
  `getStorageProvider()`. A deployment with `STORAGE_PROVIDER=local`
  doesn't have an S3 bucket to check — running HeadBucket against
  an empty `S3_BUCKET` env would always fail. 'skipped' is correct.

- **Misconfigured S3 (provider=s3 but no bucket) → 'error', not
  'skipped'.** The combination implies operator intent + incomplete
  config. Failing the readiness probe surfaces the misconfiguration
  loudly at boot — operator notices, fixes, redeploys. 'skipped'
  here would silently mask an actually-broken upload path.

- **`livez` deliberately untouched.** Liveness should stay
  dependency-free. If RDS becomes unreachable, k8s should mark the
  pod NotReady (readyz fails) and route traffic away — but should
  NOT restart it (livez stays passing). Restarting wouldn't help
  (the new pod would also fail readyz against the same RDS) and
  would inflate the connection-pool churn at exactly the wrong
  moment.

- **Logging on failure is fire-and-forget.** `logger.warn(...)` runs
  AFTER the response body is computed, never blocks the probe
  response. Log fields carry only the bounded `failed[]` array —
  not the raw error messages, for the same credential-safety reason
  the response body uses bounded codes.

- **Tests use `jest.mock` on three layers, not a stub server.** The
  upgraded route imports `PrismaClient`, `@/lib/redis::getRedis`,
  and `@aws-sdk/client-s3`. Mocking those modules at test time
  exercises the real route handler logic without spinning up a
  Postgres / Redis / S3 mock infrastructure. Faster to run, easier
  to debug failure modes that would be flaky against real
  dependencies.

## Verification performed

- **Unit tests**: `tests/unit/readyz.test.ts` — **16/16 green**.
  Coverage:
  - all-ready (200, every check ok or skipped)
  - database failure → 503, `checks.database.error='connection_failed'`
  - redis failure → 503, `checks.redis.error='ping_failed'`
  - redis unexpected ping response (`!= 'PONG'`) → 503, `error='unexpected_response'`
  - storage failure → 503, `checks.storage.error='head_bucket_failed'`
  - missing `S3_BUCKET` with `STORAGE_PROVIDER=s3` → 503, `error='bucket_not_configured'`
  - multi-failure (all 3 down) → 503, `failed=['database','redis','storage']`
  - skipped paths (no `REDIS_URL` / `STORAGE_PROVIDER=local`) → 200
  - per-check timeout (each dep tested independently) → 503, `error='timeout'`, probe completes <5s
  - response shape (timestamp, uptime, version, checks, failed, latencyMs)
  - HeadBucketCommand issued with the configured bucket name
  - **credential-leak negative test**: response body never contains the raw error message (e.g. `127.0.0.1:5432`)

- **Manual structural inspection**:
  - Route file imports the right SDK pieces (`HeadBucketCommand`, `S3Client`)
  - Module-level `_s3Client` cache exists for client reuse
  - `withTimeout` wraps every check
  - `classifyError` maps to bounded codes
  - `failed[]` derived from `checks` entries with `status === 'error'`
  - 'skipped' explicitly excluded from `failed[]`

- **`livez` route**: untouched (verified via `git diff`).
