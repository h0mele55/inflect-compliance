# 2026-04-27 — Epic OI-2: HPA + PgBouncer sidecar

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Builds on the prior OI-2 notes (foundation → worker + migration).
Adds the runtime scalability and connection-management layer:

1. `templates/hpa.yaml` — HorizontalPodAutoscaler for the **app**
   Deployment (worker stays manual-scaled per OI-2 spec).
2. PgBouncer sidecar in the app Deployment so the app connects via
   `localhost:5432` instead of holding direct upstream Postgres
   connections.

## Design

### HorizontalPodAutoscaler

**`autoscaling/v2`** API (modern, stable since K8s 1.23). Gated on
`autoscaling.enabled` (default `true`).

Default behaviour:
- `minReplicas: 2`
- `maxReplicas: 10`
- CPU resource metric, target **70% utilization** (always emitted)
- Latency Pods metric — **conditionally appended** when
  `autoscaling.latency.enabled` (default `false`)

The CPU metric is emitted unconditionally so the chart works in any
cluster — no Prometheus Adapter required. The latency metric is
opt-in because it depends on a custom-metrics adapter publishing
the OTel `api.request.duration` histogram (see `infra/README.md` §
"Metrics Inventory") to `custom.metrics.k8s.io`. Default values:

```yaml
autoscaling:
  latency:
    enabled: false
    metricName: api_request_duration_p95_milliseconds
    targetAverageValue: "500"          # 500ms P95 (matches docs/slos.md)
```

The structural ratchet asserts the gating expression is exactly
`if .Values.autoscaling.latency.enabled` — so a future "always emit
the metric" change is a deliberate diff.

### Deployment ↔ HPA cooperation

When the HPA owns the replica count, the Deployment **must NOT**
carry `spec.replicas` — Helm and HPA would fight on every upgrade
(Helm sets it from `replicaCount`, HPA overrides to current scale,
next upgrade resets, …). Implemented with a single conditional:

```yaml
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
```

Verified by rendering with `--set autoscaling.enabled=false`:
`spec.replicas: 3` appears (using passed `replicaCount`), no HPA
in the manifest list.

### PgBouncer sidecar

Regular sidecar container in the **app** pod (not worker, not
migration — per OI-2 spec). Lives at port `127.0.0.1:5432` so only
the app container in the same pod can reach it. App connects via
`localhost:5432`, removing direct DB connection pressure from the
upstream RDS.

**Image**: `bitnami/pgbouncer:1.22.1` — pinned, ratchet-asserted
non-`:latest`.

**Configuration model** — three sources:

| Concern | Where | Why |
|---|---|---|
| Static config (port, bind address, pool mode, auth, pool sizes) | `pgbouncer.config` map in values; emitted as `env: [{name,value}]` entries | Operator-tunable; non-secret |
| Upstream host / user (env-specific) | `pgbouncer.config.POSTGRESQL_HOST` / `POSTGRESQL_USERNAME` | Env-specific via per-env values files (`POSTGRESQL_HOST` defaults empty in chart values; per-env files supply it from `terraform output db_address`) |
| Upstream password (secret) | `valueFrom.secretKeyRef` pointing at `<fullname>-pgbouncer` Secret | Operator provides via External Secrets Operator pulling from AWS Secrets Manager (Epic OI-1's RDS-managed creds) |

The structural ratchet asserts the password is **never** an inline
`value:` field — it must be `valueFrom.secretKeyRef`. Violating that
would leak the credential into the rendered manifest.

**Pool mode**: `transaction` — matches the existing PgBouncer
config in `deploy/docker-compose.prod.yml`. Compatible with the
app's PgBouncer URL flag (`?pgbouncer=true` in DATABASE_URL).

**Probes**: TCP socket on port 5432 (PgBouncer doesn't speak HTTP).
Liveness probe with 30s initial delay + 30s period; readiness probe
with 5s initial delay + 10s period.

**Security**: `runAsNonRoot=true`, uid 1001, drop ALL capabilities,
no privilege escalation — same posture as the app container.

### App connectivity contract change

The chart's contribution is the sidecar wiring. The runtime env
contract that the app reads is operator-supplied (per OI-1) — but
this PR explicitly documents the contract change:

| Variable | Before | After |
|---|---|---|
| `DATABASE_URL` | `postgresql://...@<rds-endpoint>:5432/...?pgbouncer=true` | `postgresql://...@localhost:5432/inflect_compliance?pgbouncer=true` |
| `DIRECT_DATABASE_URL` | `postgresql://...@<rds-endpoint>:5432/...` | **unchanged** — direct upstream so migrations bypass PgBouncer |

Migration Job and worker Deployment **DO NOT** get the sidecar:
- Migrations need direct connection for DDL (transaction-mode pools
  break Prisma's session-level locks).
- Workers tend to hold connections longer for batch processing —
  pooling matters less, and adding a sidecar to every worker pod is
  a memory/cost sink.

The structural ratchet asserts `worker.yaml` does NOT reference
`pgbouncer` anywhere.

## Files

| File | Status | Notes |
|---|---|---|
| `infra/helm/inflect/values.yaml` | Updated | Repurposed `replicaCount` comment for HPA-aware semantics; new top-level `autoscaling:` section (enabled/min/max/CPU/latency/behavior); new top-level `pgbouncer:` section (image pinned to 1.22.1, port 5432, transaction pool mode, config map + password secret reference, TCP probes, non-root security) |
| `infra/helm/inflect/templates/_helpers.tpl` | Updated | Added `inflect.pgbouncerSecretName` helper (defaults to `<fullname>-pgbouncer`) |
| `infra/helm/inflect/templates/deployment.yaml` | Updated | Conditional `spec.replicas` (omitted when HPA on); PgBouncer sidecar appended to `containers:` block, gated on `.Values.pgbouncer.enabled`, env from values map + password via `secretKeyRef` |
| `infra/helm/inflect/templates/hpa.yaml` | New | `autoscaling/v2` HPA, gated, CPU metric always-on, latency metric conditional, behavior block plumbed through |
| `tests/guards/helm-chart-foundation.test.ts` | Extended | 79 assertions total (was 60): adds 8 HPA assertions, 1 deployment-cooperation assertion, 9 PgBouncer assertions, 1 worker-isolation assertion |
| `docs/implementation-notes/2026-04-27-epic-oi-2-hpa-and-pgbouncer.md` | New | This file |

## Decisions

- **Default `autoscaling.enabled: true`.** OI-2 spec says "app
  scales 2 → 10 replicas". On-by-default matches the spec
  intent. Operators in dev/test clusters who don't want autoscaling
  flip the flag in their values file; the off-path is fully tested
  (drops back to `replicaCount` Deployment-managed scaling).

- **CPU metric always emitted, latency conditional.** Production
  clusters typically don't ship Prometheus Adapter on day one. A
  hard-required latency metric would block install in those
  clusters. CPU is universally available (kubelet's metrics-server
  / cAdvisor pipeline). Latency stays as a one-line opt-in once
  the adapter is wired.

- **Pods metric type for latency, not External.** The OTel
  `api.request.duration` histogram is published per-pod via the
  Prometheus Adapter. A `Pods` metric averages across pods (which
  is what HPA wants for scale decisions). `External` is for
  non-pod-scoped sources (queue depths, third-party SaaS metrics).

- **`spec.replicas` omitted when HPA active.** Standard
  Bitnami/Charts pattern. Without this, every `helm upgrade`
  flickers the replica count and may scale-in pods that the HPA
  had just scaled out. Implemented with a one-line conditional.

- **PgBouncer as a regular sidecar, not native init-sidecar.**
  Native sidecars (init container with `restartPolicy: Always`)
  are stable in Kubernetes 1.29+. The chart's `kubeVersion: ">=
  1.28.0"` would force operators on 1.28 to skip native sidecars
  anyway. Regular containers are universally compatible — the
  startup race (app readyz fails until PgBouncer is ready) is
  handled by the readyz probe's failureThreshold giving ~25s
  grace. Adequate for now; native sidecar opt-in is a one-line
  follow-up when the chart's kubeVersion floor moves to 1.29+.

- **Worker has NO sidecar.** Per OI-2 spec, but also for two
  practical reasons: (a) BullMQ workers hold connections longer
  for batch processing, defeating pool-on-localhost benefits;
  (b) running PgBouncer in every worker pod would be a memory + DB
  connection multiplier (each PgBouncer-to-RDS pool is a separate
  set of upstream connections).

- **Migration Job has NO sidecar.** Prisma migrations need direct
  Postgres connections for DDL — transaction-mode PgBouncer pools
  break Prisma's session-level migration locks. The migration
  Job's `DIRECT_DATABASE_URL` (operator-supplied via the
  ConfigMap) keeps targeting RDS directly.

- **PgBouncer password is its OWN Secret, separate from the app's
  envFrom Secret.** The bitnami image expects a SPECIFIC env name
  (`POSTGRESQL_PASSWORD`); the app's runtime Secret carries the
  full DATABASE_URL with the password embedded. Two different
  consumption shapes — one Secret each is simpler than mapping the
  password between the two.

- **Static PgBouncer config as a values MAP, iterated into env.**
  Helm templating iterates `range` over the map and emits each as
  a `name/value` env entry. Operators add new PgBouncer knobs
  without editing the template. Limitation: secret-bearing fields
  must remain in `valueFrom` style outside the map (just
  `POSTGRESQL_PASSWORD` today).

- **`latency.metricName` and `targetAverageValue` are exposed as
  values.** Adapter configurations vary — some publish histogram
  buckets, some publish derived percentiles. Locking the metric
  name in the chart would force operators to fork. Default name
  matches the OTel-derived shape (`api_request_duration_p95_milliseconds`)
  but operators override per cluster.

- **`autoscaling.behavior` plumbed through, not hardcoded.** HPA
  scale-up/scale-down behaviour (stabilization windows, percent vs
  pods policies) is workload-specific. Default empty so K8s built-in
  defaults apply; per-env files override for production (typical:
  scale-up fast, scale-down slow). Example included in values.yaml
  comment.

## Verification performed

- **`helm lint`**: `1 chart(s) linted, 0 chart(s) failed` (single
  optional INFO about a missing icon).

- **`helm template my-release inflect`** (default values):
  renders **4 documents** —
  ```
  Deployment my-release-inflect
  Deployment my-release-inflect-worker
  HorizontalPodAutoscaler my-release-inflect
  Job my-release-inflect-migrate
  ```
  - App Deployment OMITS `spec.replicas` ✓
  - App pod has 2 containers: `inflect` (the app) + `pgbouncer` ✓
  - PgBouncer config: 10 env keys (PGBOUNCER_*, POSTGRESQL_*); password from `secretKeyRef: my-release-inflect-pgbouncer/POSTGRESQL_PASSWORD` ✓
  - HPA: min 2, max 10, single CPU metric ✓

- **`helm template ... --set autoscaling.latency.enabled=true`**:
  HPA emits **2 metrics** — Resource:cpu and Pods:api_request_duration_p95_milliseconds (target 500). Both states render valid YAML.

- **`helm template ... --set autoscaling.enabled=false --set replicaCount=3`**:
  - App Deployment: `spec.replicas: 3` ✓
  - HPA: not rendered ✓ (no fight between Helm and HPA)

- **YAML round-trip via `js-yaml`**: 4 docs default / 4 docs with
  latency / 3 docs without HPA — all parse cleanly, no duplicate
  keys.

- **Structural ratchet**: `tests/guards/helm-chart-foundation.test.ts`
  — **79/79 green** (was 60 before this PR). New coverage:
  - 8 HPA assertions: API version, gating, scaleTargetRef,
    OI-2-spec defaults (min 2 / max 10 / CPU 70%), Resource:cpu
    always emitted, Pods latency conditional, latency disabled by
    default, behavior plumbing.
  - 1 deployment-cooperation assertion: `spec.replicas` is
    conditional on `not autoscaling.enabled`.
  - 9 PgBouncer assertions: sidecar gating, port 5432 + bind
    127.0.0.1, transaction pool mode, password via valueFrom
    (NEVER inline), helper exists with right default, TCP probes,
    image pin (not :latest), non-root security context, worker
    has NO sidecar.
  - 1 file-presence: `templates/hpa.yaml`.
