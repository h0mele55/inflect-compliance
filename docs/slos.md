# Service Level Objectives (SLOs)

> inflect-compliance — Production Operational Standards
>
> Epic 19: Observability & Operational Readiness

---

## Overview

This document defines measurable Service Level Objectives (SLOs) for the inflect-compliance platform. Each SLO specifies:

- **Exact objective** — the target value
- **Measurement formula** — how the SLO is computed
- **Scope** — what traffic/operations count
- **Exclusions** — what is intentionally excluded
- **Time window** — rolling evaluation period
- **Telemetry source** — which metric(s) power the measurement
- **Alert threshold** — when human attention is needed

These SLOs are designed to be immediately measurable using the OTel metrics
emitted by `src/lib/observability/metrics.ts` through `withApiErrorHandling`.

---

## Telemetry Inventory

The following OTel metrics are emitted at every API request completion:

| Metric Name | Type | Labels | Source |
|---|---|---|---|
| `api_request_count` | Counter | `http_method`, `http_route`, `http_status_code` | `metrics.ts` → `withApiErrorHandling` |
| `api_request_duration` | Histogram (ms) | `http_method`, `http_route`, `http_status_code` | `metrics.ts` → `withApiErrorHandling` |
| `api_request_errors` | Counter | `http_method`, `http_route`, `error_code` | `metrics.ts` → `withApiErrorHandling` |

> **Note**: OTel metric names use dots (`api.request.count`) but Prometheus
> convention converts these to underscores (`api_request_count`). All PromQL
> in this document uses the Prometheus-convention names.

### Health probes (separate from API SLO traffic):

| Endpoint | Purpose | Metric Coverage |
|---|---|---|
| `GET /api/livez` | Process liveness | HTTP status only (no OTel metrics) |
| `GET /api/readyz` | Dependency readiness | HTTP status + structured JSON checks |
| `GET /api/health` | Deprecated alias | Same as readyz |

---

## SLO 1: API Availability

### Objective

**≥ 99.9% of API requests return a non-5xx response** (rolling 30-day window).

### Measurement Formula

```
availability = 1 - (
  sum(api_request_count{http_status_code=~"5.."}) /
  sum(api_request_count)
)
```

### Scope

All HTTP requests that pass through `withApiErrorHandling` — this covers:

- All tenant-scoped API routes (`/api/t/[tenantSlug]/*`)
- All legacy API routes (`/api/controls`, `/api/risks`, etc.)
- Admin API routes (`/api/admin/*`)
- Auth API routes (`/api/auth/*`)
- SSO callback routes
- Webhook receivers (`/api/stripe/webhook`)

### Exclusions

| Excluded | Reason |
|---|---|
| `/api/livez` | Infrastructure probe — not user-facing |
| `/api/readyz` | Infrastructure probe — not user-facing |
| `/api/health` | Deprecated infrastructure probe |
| `/api/staging/seed` | Dev/staging-only endpoint |
| Client-side errors (4xx) | Expected application behavior |

### Time Window

**30-day rolling window**, evaluated continuously.

### Telemetry Source

- **Primary**: `api_request_count` counter with `http_status_code` label
- **Exporter**: OTel Collector → Prometheus remote-write
- **Dashboard**: "API Availability" panel in Grafana

### Alert Thresholds

| Severity | Condition | Window | Action |
|---|---|---|---|
| **Warning** | Availability < 99.9% (error rate > 0.1%) | 15 min | Investigate — check error logs |
| **Critical** | Availability < 99.5% (error rate > 0.5%) | 5 min | Page on-call — active incident |

### Error Budget

At 99.9% over 30 days:
- **Allowed downtime**: ~43 minutes/month
- **Allowed error count**: 1 in 1,000 requests

---

## SLO 2: API Latency — Reads (P95)

### Objective

**95th percentile of GET requests < 500ms** (rolling 30-day window).

### Why split read vs write

Reads and writes have fundamentally different cost profiles:
- Reads hit caches, denormalised columns, and read replicas. P95 < 500ms is achievable for the vast majority of read endpoints.
- Writes go through transaction commits, fan out to denormalised columns, sometimes trigger audit log writes + outbound webhook batches. A 500ms write target would be perpetually breached without delivering proportional user-experienced improvement.

OI-3 spec defines the two targets separately for exactly this reason. The previous single P95 SLO is split into SLOs 2a (reads) and 2b (writes); both are evaluated against `api_request_duration` filtered by HTTP method.

### Measurement Formula

```promql
p95_read_latency = histogram_quantile(
  0.95,
  sum by (le) (rate(api_request_duration_bucket{http_method=~"GET|HEAD"}[5m]))
)
```

### Scope

GET + HEAD requests through `withApiErrorHandling`. Per-route exclusions identical to the write SLO below.

### Exclusions

| Excluded | Reason |
|---|---|
| `/api/livez`, `/api/readyz`, `/api/health` | Infrastructure probes — trivially fast (would dominate the histogram and skew P95 down) |
| Report generation endpoints (`/api/t/*/reports/export`) | Expected to be slow (PDF generation on demand) |
| File upload endpoints (`/api/t/*/files`) | POST-only, but if a HEAD lands here it's bound by upload size |

### Telemetry Source

- **Primary**: `api_request_duration` histogram, filtered by `http_method=~"GET|HEAD"`
- **Dashboard**: `inflect-app-overview` (panel 5: "Latency percentiles")
- **Alert**: `ApiP95LatencyWarning` (>500ms 10m), `ApiP95LatencyCritical` (>2000ms 5m). Both currently match on full traffic; future PR splits the alert by method to avoid write-induced false positives on the read SLO.

---

## SLO 2b: API Latency — Writes (P95)

### Objective

**95th percentile of state-mutating requests < 1000ms** (rolling 30-day window).

### Measurement Formula

```promql
p95_write_latency = histogram_quantile(
  0.95,
  sum by (le) (rate(api_request_duration_bucket{http_method=~"POST|PUT|PATCH|DELETE"}[5m]))
)
```

### Scope

All POST/PUT/PATCH/DELETE through `withApiErrorHandling`.

### Exclusions

Same as SLO 2 (reads), plus:

| Excluded | Reason |
|---|---|
| `/api/auth/*` | NextAuth flows — bound by external IdP redirect, not server latency |
| `/api/stripe/webhook`, `/api/storage/av-webhook` | Inbound webhook receivers — bound by sender retry, not server latency |

### Telemetry Source

- **Primary**: `api_request_duration` histogram, filtered by `http_method=~"POST|PUT|PATCH|DELETE"`
- **Dashboard**: `inflect-app-overview` (panel 5: "Latency percentiles") — split by method via the panel's `legendFormat`
- **Alert**: same thresholds as SLO 2 today; per-method split is a follow-up

---

## SLO 3: API Error Rate

### Objective

**< 1% of API requests result in a 5xx error** (rolling 30-day window).

### Measurement Formula

```
error_rate = (
  sum(rate(api_request_count{http_status_code=~"5.."}[5m])) /
  sum(rate(api_request_count[5m]))
) * 100
```

### Scope

Same as SLO 1.

### Exclusions

Same as SLO 1.

### Time Window

**30-day rolling window**, evaluated over 5-minute rate windows.

### Telemetry Source

- **Primary**: `api_request_count` counter, partitioned by `http_status_code`
- **Secondary**: `api_request_errors` counter for error-code breakdown
- **Dashboard**: "Error Rate" panel in Grafana

### Alert Thresholds

| Severity | Condition | Window | Action |
|---|---|---|---|
| **Warning** | Error rate > 1% | 10 min sustained | Investigate error logs |
| **Critical** | Error rate > 5% | 5 min sustained | Page on-call — significant breakage |

---

## SLO 4: Health Check Availability

### Objective

**Readiness probe (`/api/readyz`) returns 200 at least 99.95% of the time** (rolling 7-day window).

### Measurement Formula

```
readyz_availability = (
  sum(probe_success{instance="inflect-compliance", job="readyz"}) /
  count(probe_success{instance="inflect-compliance", job="readyz"})
)
```

If using synthetic monitoring (e.g., Grafana Synthetic Monitoring, Blackbox Exporter):

```
readyz_availability = avg_over_time(probe_success{job="readyz"}[7d])
```

### Scope

- `GET /api/readyz` — checks PostgreSQL and Redis (when configured)
- `GET /api/livez` — checks process responsiveness

### Exclusions

None — if the probe fails, the service is unhealthy.

### Time Window

**7-day rolling window** — tighter window because probe failures indicate infrastructure problems, not traffic-dependent issues.

### Telemetry Source

- **Primary**: External synthetic monitoring (Blackbox Exporter or platform probe)
- **Secondary**: Container orchestrator health check results (K8s, Docker, Fly.io)
- **Dashboard**: "Health Check Status" panel in Grafana

### Alert Thresholds

| Severity | Condition | Window | Action |
|---|---|---|---|
| **Warning** | 2 consecutive readyz failures | 30s interval | Check DB/Redis connectivity |
| **Critical** | 3+ consecutive readyz failures | 45s | Page on-call — service degraded |
| **Critical** | Any livez failure | Immediate | Container should be restarted |

---

## SLO 5: Repository latency (Epic OI-3)

### Objective

**Repository-method P95 < 100ms** for all OI-3-instrumented methods (rolling 7-day window).

### Why

Repository methods are the dominant cost in API latency. A repo P95 over 100ms typically explains a corresponding API P95 spike. Tracking the repo SLO independently lets us catch DB-side regressions (slow query, missing index, lock contention) before they break the API SLO.

### Measurement Formula

```promql
repo_p95 = histogram_quantile(
  0.95,
  sum by (le, repo_method) (rate(repo_method_duration_bucket[5m]))
)
```

### Scope

All methods wrapped with `traceRepository(...)` from `src/lib/observability/repository-tracing.ts`. Today: 12 methods across `RiskRepository`, `ControlRepository`, `EvidenceRepository`. Future PRs extend coverage.

### Telemetry Source

- **Metric**: `repo_method_duration` histogram (Epic OI-3 part 2)
- **Dashboard**: `inflect-database` (panel 5: "Repo duration percentiles", panel 7: "Top slow repo methods (P95)")
- **Alert**: indirect — `DatabaseConnectionPoolExhausted` fires on Prisma error rate, which correlates with sustained slow queries

---

## SLO 6: RPO — Recovery Point Objective (Epic OI-3)

### Objective

**Maximum 1 hour of data loss** in a worst-case recovery scenario.

### Why 1 hour

Tighter (e.g. 5 minutes) requires synchronous cross-region replication — meaningful infrastructure cost increase + write-latency penalty. Looser (e.g. 24 hours) is unacceptable for a compliance SaaS where audit logs + evidence reviews are the work product. 1 hour reflects the AWS RDS automated-snapshot frequency floor + transaction-log shipping cadence; achievable within the existing OI-1 module without architectural changes.

### How it's met

| Layer | Mechanism | Recoverable to |
|---|---|---|
| RDS Postgres | Continuous transaction log shipping + 5-minute granularity restore | Any second within `backup_retention_days` window (production: 14 days) |
| RDS automated snapshots | Daily during the `backup_window` (03:00-04:00 UTC) | The snapshot moment, < 24h freshness |
| Encrypted column data | Same RDS recovery path | Same |
| File storage (S3) | Versioning enabled on the bucket | Any prior version (until lifecycle expiry) |
| AWS Secrets Manager | 30-day recovery window on the master KEK; 7-day on rotatable secrets | Up to recovery-window deletion ceiling |

### Measurement / Verification

- **`infra/scripts/restore-test.sh`** (Epic OI-3 part 4) runs **monthly** against the latest automated snapshot and verifies the snapshot is no older than 14 days (psql check 4: `AuditLog has rows from within 14d of snapshot`).
- A failed restore-test fails the GitHub Actions monthly workflow; production rotation kicks in via PagerDuty if the workflow has been failing for more than 14 days running.
- The 1-hour objective is implicit: PITR's continuous transaction log shipping means the recoverable point is always within the latest log ship cycle, which AWS guarantees at <5 minutes typical (well inside the 1-hour SLA).

### Risk

The 1-hour RPO assumes the RDS instance + the regional log archive are both reachable. A regional AWS outage that takes both down is recoverable only from the daily snapshot (RPO degrades to <24h). Cross-region read replica deployment is the mitigation; not in scope for OI-3.

---

## SLO 7: RTO — Recovery Time Objective (Epic OI-3)

### Objective

**Service restored within 4 hours** of a critical incident.

### Why 4 hours

Aligns with our compliance customers' standard SLAs (most enterprise SaaS contracts allow 4-hour MTTR for critical incidents). Also matches the realistic floor for a multi-step recovery: detection (alert) + triage (15-30 min) + restore-from-backup (RDS restore is 30-60 min for production-sized data) + smoke testing + DNS / traffic re-routing.

### Recovery scenarios mapped to RTO

| Scenario | Mechanism | Estimated RTO |
|---|---|---|
| Single pod failure | Kubernetes auto-restart | < 1 minute |
| Single AZ failure | RDS multi-AZ failover (production only) + ALB cross-AZ routing | 60-180 seconds |
| Bad deploy | `helm rollback` to prior revision | < 5 minutes |
| App-image bug requiring patched build | Deploy via `Deploy` workflow + build + smoke | 15-30 minutes |
| RDS instance corruption (single-region) | `restore-db-instance-from-db-snapshot` to new instance, point app's `DATABASE_HOST` at new endpoint | 60-120 minutes |
| Master KEK loss (within 30-day recovery window) | `aws secretsmanager restore-secret`, redeploy | 15-30 minutes |
| Master KEK loss (beyond recovery window) | DR rebuild from a backup-encrypted-with-known-KEK; cross-customer notification likely | hours-to-days; may exceed RTO |
| Regional AWS outage | Manual restore in alternate region from cross-region snapshot copy | 2-4 hours; cross-region replica deployment would shorten this |

### Measurement / Verification

- **Detection**: covered by the alert pipeline (Epic OI-3 part 3). Critical alerts page within ~10 seconds of trigger via PagerDuty.
- **Decision tree + runbook**: `docs/incident-response.md` walks operators through each scenario above.
- **Restore mechanism validation**: the monthly `restore-test.sh` exercises the RDS-restore path (60-120 min RTO scenario) end-to-end.
- The 4-hour SLA is the SUM of detection + triage + recovery time; the budget allocation per stage is documented in `docs/incident-response.md` § "Severity definitions".

### Risk

The RTO assumes operator availability at the time of the incident. Out-of-hours incidents extend MTTR by the on-call response time (typically 15 minutes via PagerDuty). The 4-hour SLA accommodates this; tighter targets would require follow-the-sun on-call coverage (out of scope for OI-3).

---

## SLO Summary Table

| SLO | Target | Window | Primary Metric / Mechanism |
|---|---|---|---|
| API Availability | ≥ 99.9% | 30 days | `api_request_count` |
| API Latency — Reads (P95) | < 500ms | 30 days | `api_request_duration` (GET/HEAD) |
| API Latency — Writes (P95) | < 1000ms | 30 days | `api_request_duration` (POST/PUT/PATCH/DELETE) |
| API Error Rate | < 1% | 30 days | `api_request_count` |
| Health Check Availability | ≥ 99.95% | 7 days | Synthetic probe of `/api/livez` |
| Repository Latency (P95) | < 100ms | 7 days | `repo_method_duration` (OI-3 part 2) |
| RPO (Recovery Point) | ≤ 1 hour | continuous | RDS PITR + monthly `restore-test.sh` |
| RTO (Recovery Time) | ≤ 4 hours | per incident | `helm rollback` / `restore-db-instance` / runbook |

---

## Metric Dependencies

### Available Today (Phase 1)

| Metric | Status | Source |
|---|---|---|
| `api_request_count` | ✅ Emitted | `metrics.ts` via `withApiErrorHandling` |
| `api_request_duration` | ✅ Emitted | `metrics.ts` via `withApiErrorHandling` |
| `api_request_errors` | ✅ Emitted | `metrics.ts` via `withApiErrorHandling` |
| Structured JSON logs | ✅ Emitted | Pino logger → stdout |

### Required Infrastructure

| Component | Purpose | Status |
|---|---|---|
| OTel Collector | Receives OTLP metrics/traces from the app | ⏳ Deploy alongside app |
| Prometheus | Stores metrics from OTel Collector | ⏳ Deploy alongside app |
| Grafana | Dashboard visualization and alerting | ⏳ Deploy alongside app |
| Blackbox Exporter | Synthetic health probe monitoring | ⏳ Optional |

### Pipeline

```
App (metrics.ts)
  → OTLP HTTP (:4318)
    → OTel Collector
      → Prometheus remote-write
        → Grafana (dashboards + alerts)
```

---

## Revision History

| Date | Change |
|---|---|
| 2026-04-18 | Initial SLO definitions (Epic 19 Phase 2) |
| 2026-04-27 | Epic OI-3: split SLO 2 into reads (<500ms) and writes (<1000ms); add SLO 5 (repository P95 from `repo_method_*` metrics); add SLO 6 (RPO 1h, met by RDS PITR + monthly `restore-test.sh`); add SLO 7 (RTO 4h, met by `helm rollback` / `restore-db-instance` paths documented in `docs/incident-response.md`) |
