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

## SLO 2: API Latency (P95)

### Objective

**95th percentile API response time < 500ms** (rolling 30-day window).

### Measurement Formula

```
p95_latency = histogram_quantile(
  0.95,
  sum(rate(api_request_duration_bucket[5m])) by (le)
)
```

### Scope

Same as SLO 1 — all requests through `withApiErrorHandling`.

### Exclusions

| Excluded | Reason |
|---|---|
| `/api/livez`, `/api/readyz`, `/api/health` | Infrastructure probes — trivially fast |
| Report generation endpoints (`/api/t/*/reports/export`) | Expected to be slow (PDF generation) |
| File upload endpoints (`/api/t/*/files`) | Bound by upload size, not server latency |
| Webhook receivers (`/api/stripe/webhook`) | External dependency latency |

### Time Window

**30-day rolling window**, evaluated over 5-minute rate windows.

### Telemetry Source

- **Primary**: `api_request_duration` histogram (unit: milliseconds)
- **Exporter**: OTel Collector → Prometheus remote-write
- **Dashboard**: "P95 API Latency" panel in Grafana

### Alert Thresholds

| Severity | Condition | Window | Action |
|---|---|---|---|
| **Warning** | P95 > 500ms | 10 min sustained | Investigate — check slow queries |
| **Critical** | P95 > 2000ms | 5 min sustained | Page on-call — likely DB or network issue |

### Exclusion Implementation

Routes excluded from the latency SLO are filtered in PromQL:

```promql
histogram_quantile(0.95,
  sum(rate(api_request_duration_bucket{
    http_route!~"/api/(livez|readyz|health|staging/seed)",
    http_route!~"/api/t/[^/]+/(reports/export|files)",
    http_route!="/api/stripe/webhook"
  }[5m])) by (le)
)
```

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

## SLO Summary Table

| SLO | Target | Window | Primary Metric |
|---|---|---|---|
| API Availability | ≥ 99.9% | 30 days | `api_request_count` |
| API Latency (P95) | < 500ms | 30 days | `api_request_duration` |
| API Error Rate | < 1% | 30 days | `api_request_count` |
| Health Check Availability | ≥ 99.95% | 7 days | Synthetic probe |

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
