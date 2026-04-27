# 2026-04-27 — Epic OI-3: repository instrumentation + dashboards

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Builds on `2026-04-27-epic-oi-3-readyz-dependency-checks.md`. Adds:

1. `src/lib/observability/repository-tracing.ts` — `traceRepository(method, ctx, fn)` wrapper that emits OTel span + four metrics on every repository call
2. Repository metric instruments (`repo.method.{duration, calls, errors, result_count}`) added to `src/lib/observability/metrics.ts`
3. Sample instrumentation across 12 methods in 3 high-traffic repos (Risk, Control, Evidence — top 4 methods each), proving the pattern + covering the OI-1 portfolio drill-down hot path
4. Four importable Grafana dashboards under `infra/dashboards/`: app-overview, database, redis, bullmq

## Telemetry design

**Per-call wrapper** with a fixed contract:

```ts
return traceRepository('risk.list', ctx, async () => {
  return db.risk.findMany(...);
});
```

The wrapper:
- Creates a span named `repo.<method>` with attributes `repo.method`, `repo.tenant_id`, `repo.duration_ms`, `repo.result_count`, plus `app.tenantId/userId/role/requestId`
- Records `repo.method.duration` (histogram, ms)
- Records `repo.method.calls` (counter, with `outcome=success|error`)
- Records `repo.method.errors` (counter, with `error.type` from the thrown error's `Error.name`)
- Records `repo.method.result_count` (histogram) — auto-detected from arrays / `{ items: [...] }` / `{ count: N }`
- Sets span status OK on success, ERROR + records exception on failure, ALWAYS ends the span in a finally block

**Cardinality safety — load-bearing**:

| Dimension | Span attribute (per-trace, queryable in trace search) | Metric label (per-aggregate, cardinality cost) |
|---|---|---|
| `repo.method` | ✅ | ✅ (bounded by code — fixed enum of method names) |
| `outcome` (success/error) | ✅ | ✅ (2 values) |
| `error.type` | ✅ | ✅ (bounded — Error class names) |
| **`tenant_id`** | ✅ | ❌ **NEVER** — would explode metric storage on multi-tenant deployments |
| `user.id`, `request.id` | ✅ | ❌ |

The structural ratchet asserts the helper's `.record(...)` and `.add(...)` call sites contain no `tenant_id` tokens. Tenant-pivot debugging happens via the trace backend (search by `repo.tenant_id` span attribute), not via metric label slicing.

**Result-count auto-detection** matches the codebase's three documented return shapes:
- `Array.isArray(result)` → `result.length`
- `{ items: [...] }` → `result.items.length` (paginated DTOs from `@/lib/dto/pagination`)
- `{ count: N }` → `result.count` (Prisma `count()`)
- Single object / scalar / void → null (skipped — not all repos return countable shapes)

The `detectResultCount` function is exported and unit-tested with all five cases.

## Repository instrumentation summary

**3 repos × 4 methods = 12 instrumentations** in this PR:

| Repo | Methods wrapped |
|---|---|
| `RiskRepository` | `list`, `listPaginated`, `getById`, `create` |
| `ControlRepository` | `list`, `listPaginated`, `getById`, `create` |
| `EvidenceRepository` | `list`, `listPaginated`, `getById`, `create` |

These three repos are the OI-1 portfolio drill-down's hot path (every CISO opening the org dashboard hits all three). The remaining 32 repository files use the same static-class-with-`(db, ctx, ...)`-method pattern; instrumenting them is a mechanical follow-up that lands as the related repos see traffic in production. The structural ratchet locks the 12 wrappings already in place; future PRs add coverage by extending the ratchet's `SAMPLES` array.

**Why selective coverage, not "every method everywhere"**: the wrapper's overhead is non-zero (one span per call, four metric records). Instrumenting 35 repos × ~5 methods each = ~175 wrappings would also balloon the PR diff. Targeted coverage of the load-bearing repos delivers operational value where it matters; expanding coverage is a follow-up driven by trace-search hits showing missing methods.

## Dashboard assets created

Four Grafana dashboards in `infra/dashboards/`. All use the standard `__inputs` Prometheus datasource pattern (importable via the Grafana UI's "Import dashboard JSON" flow OR provisionable via the Grafana operator's dashboard ConfigMap).

| Dashboard | UID | Panels | Source metrics |
|---|---|---|---|
| **App Overview** | `inflect-app-overview` | 8 | `api_request_count`, `api_request_duration_bucket` (existing OTel API metrics) |
| **Database (repository layer)** | `inflect-database` | 9 | `repo_method_calls`, `repo_method_duration_bucket`, `repo_method_errors`, `repo_method_result_count_bucket` (new OI-3 metrics) |
| **Redis / ElastiCache** | `inflect-redis` | 8 | `job_queue_depth` (BullMQ on Redis) + `aws_elasticache_*` (operator wires CloudWatch exporter) |
| **BullMQ** | `inflect-bullmq` | 8 | `job_execution_count`, `job_execution_duration_bucket`, `job_queue_depth` (existing job metrics) |

All four follow the same Grafana JSON v8+ schema as the existing `grafana-api-slos.json`. Standard panel set per dashboard:
- 4 stat panels at top (top-of-funnel KPIs)
- 2 timeseries panels (trend over time)
- 1–2 table panels (top-N by cost: slow methods, failing routes, etc.)

**Why an existing `grafana-api-slos.json` and a new `app-overview.json`**: SLOs (the existing one) are alert-source-of-truth focused; App Overview is debug-focused (more granular percentiles, route-level tables). Operators looking at "is the app okay?" land on App Overview; alert pagers land on SLOs.

## Files

| File | Status | Notes |
|---|---|---|
| `src/lib/observability/repository-tracing.ts` | **New** | `traceRepository` wrapper + `detectResultCount` helper |
| `src/lib/observability/metrics.ts` | Updated | Added `getRepository{DurationHistogram,CallCounter,ErrorCounter,ResultCountHistogram}` instruments + docstring section for repository metrics |
| `src/lib/observability/index.ts` | Updated | Re-exports `traceRepository`, `detectResultCount` |
| `src/app-layer/repositories/RiskRepository.ts` | Updated | 4 methods wrapped (list, listPaginated, getById, create) |
| `src/app-layer/repositories/ControlRepository.ts` | Updated | 4 methods wrapped |
| `src/app-layer/repositories/EvidenceRepository.ts` | Updated | 4 methods wrapped |
| `infra/dashboards/app-overview.json` | **New** | 8-panel app health dashboard |
| `infra/dashboards/database.json` | **New** | 9-panel repository-layer dashboard |
| `infra/dashboards/redis.json` | **New** | 8-panel BullMQ-on-Redis + ElastiCache dashboard |
| `infra/dashboards/bullmq.json` | **New** | 8-panel job throughput + queue depth dashboard |
| `tests/unit/repository-tracing.test.ts` | **New** | 22-assertion helper unit test (mocks tracer, all metric instruments, ctx); covers happy/error/cardinality/missing-context paths |
| `tests/guards/oi-3-observability.test.ts` | **New** | 28-assertion structural ratchet (readyz shape, helper exports, metric instrument names, sample-repo wrapping, dashboard JSON validity + UIDs + datasource inputs + per-dashboard required-metric expressions) |
| `docs/implementation-notes/2026-04-27-epic-oi-3-repository-tracing-and-dashboards.md` | **New** | This file |

## Decisions

- **Per-call wrapper, not Prisma middleware.** Prisma's `$extends({ query: ... })` would auto-wrap every query but loses the method-name dimension (every query at that layer looks like `prisma.risk.findMany`, not `risk.list` vs `risk.listPaginated`). The OI-3 spec explicitly wants method-name labels — the wrapper preserves that. Cost: per-method import + wrap. Benefit: clearer dashboards, easier per-method SLOs.

- **Helper accepts `ctx` directly, not via AsyncLocalStorage.** ALS context lookup adds overhead per call. The repos already receive `ctx` as their second argument — passing it explicitly is zero-cost. (Future extension: a thin variant that reads `getRequestContext()` from ALS for usecases that don't have ctx in scope.)

- **Auto-detect result count, don't require manual `recordResultCount`.** The two-arg form (`fn(span)` callback receiving the span) was the alternative — operators set `span.setAttribute('repo.result_count', n)` manually. Rejected because:
  - Mechanical: 99% of methods just return arrays / paginated DTOs
  - Forgettable: operators add new methods without recording the count
  - Auto-detection covers the common shapes; the rare "single object that has a meaningful sub-count" case can still be instrumented via plain `traceOperation`.

- **`error.type` IS a metric label.** Bounded by code (Error class names). Useful for alerting on specific Prisma error codes (e.g. `PrismaClientKnownRequestError` vs `PrismaClientUnknownRequestError`). Cardinality stays low — the universe of class names is finite and code-defined.

- **`outcome=success|error` as a metric label, not just two separate counters.** Simpler queries: `sum by (outcome) (rate(repo_method_calls[5m]))` gives the success/error split in one query. Two counters would need a sum at query-time. Either works; pick label.

- **Dashboards import via `__inputs`, not via env-var-replaced raw datasources.** `__inputs` is the Grafana standard for portable dashboards. Grafana prompts the operator to pick a datasource at import time. Provisioning via ConfigMap works the same way (the operator binds `${DS_PROMETHEUS}` to the actual datasource UID).

- **AWS ElastiCache panels in the Redis dashboard depend on a CloudWatch exporter.** The chart's app-side metrics (BullMQ queue depth) tell us about ElastiCache load from the client perspective. The server-side metrics (CPU, memory, evictions, ops/sec) come from CloudWatch — the operator wires `cloudwatch_exporter` or YACE between CloudWatch and Prometheus. The dashboard's CloudWatch-derived panels carry a description noting the dependency, so operators see "no data" with context, not as a mystery.

- **No alert routing in this PR.** Spec carved alerts out: "Focus in this prompt on telemetry and dashboards, not alert routing or backups yet." The dashboards visualize. Alert rules (already at `infra/alerts/rules.yml` for the existing SLOs) get extended by future PRs based on production traffic.

## Verification performed

- **Unit tests**:
  - `tests/unit/repository-tracing.test.ts` — **22/22 green**. Covers `detectResultCount` (5 shapes), happy path (span name, attributes, metrics, result-count detection across array/items/count shapes), error path (re-throw, error counter, ended span), cardinality (no tenant_id in metric labels), missing-context fallback to `'unknown'`.
  - `tests/unit/readyz.test.ts` — **16/16 green** (from the OI-3 part 1 PR; still passing).

- **Structural ratchet**: `tests/guards/oi-3-observability.test.ts` — **28 green** (50 total assertions across `it.each` expansions). Locks:
  - readyz imports HeadBucket + getRedis + uses `$queryRaw SELECT 1` + Promise.all + ≥3 withTimeout call sites + structured failed[] derivation
  - Helper file exists, both functions exported, barrel re-exports them
  - Span carries the four required attributes (`repo.method`, `repo.tenant_id`, `repo.duration_ms`, `repo.result_count`)
  - All four metric instruments accessed
  - **Metric label scan**: `.record(...)` / `.add(...)` lines contain no tenant_id token
  - Metric instruments registered with the canonical names (`repo.method.{duration,calls,errors,result_count}`) and right kinds (Histogram / Counter)
  - Sample repos import + wrap the 12 expected methods
  - All four dashboards exist, parse as JSON, have stable UIDs (kebab-case, ratchet-asserted), declare a `DS_PROMETHEUS` `__input`, have at least one panel + a title
  - Per-dashboard metric query assertions: app-overview uses `api_request_*`, database uses `repo_method_*`, redis uses `job_queue_depth + aws_elasticache_*`, bullmq uses `job_execution_* + job_queue_depth`

- **JSON validity**: each dashboard parses cleanly via `JSON.parse`. Panel counts: app-overview 8, database 9, redis 8, bullmq 8.

- **TypeScript**: helper compiles without errors; metrics module's new exports type-check; sample repo wrappings preserve the original return-type signatures (verified by tsc-via-jest).

- **No live integration test** because the OTel global meter/tracer needs initialized infrastructure — the unit test mocks them at the module boundary, which exercises the helper's actual logic without needing a real OTel collector.
