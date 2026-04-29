# 2026-04-27 — Epic OI-3 closing layer: incident response + SLOs

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Closes Epic OI-3. Builds on the prior four OI-3 notes (readyz, repo
tracing + dashboards, alerting + uptime, backup/restore). Adds the
operator-facing layer: incident-response runbooks tied to the
concrete tooling, and SLOs with measurable targets covering all the
spec's required dimensions.

## Runbooks added

`docs/incident-response.md` ships **7 playbooks** + **5 communication
templates**, each tied directly to specific alerts, dashboards, and
commands shipped by prior epics:

| Playbook | Triggered by | Dashboard | Recovery mechanism |
|---|---|---|---|
| 1. App Down | external uptime monitor (multi-region 503) → PagerDuty critical; or `LivezProbeFailure` | `inflect-app-overview` | `helm rollback` (Epic OI-2) or `kubectl rollout restart` |
| 2. Database Unavailable / Slow | `DatabaseConnectionPoolExhausted`, `ApiP95LatencyCritical` | `inflect-database` | PgBouncer `SHOW POOLS;` triage → scale app down OR `restore-db-instance-to-point-in-time` (Epic OI-1 + OI-3 part 4) |
| 3. Redis OOM / Degraded Queueing | `RedisMemoryHighWarning` (>80%), `RedisMemoryHighCritical` (>95%) | `inflect-redis` | BullMQ queue clean (`queue.clean(...)`) → cache node scale via Terraform (Epic OI-1) |
| 4. Queue Backlog | `QueueDepthBacklogWarning` (>100), `QueueDepthBacklogCritical` (>1000) | `inflect-bullmq` | Manual worker scale (`helm upgrade --set worker.replicaCount=N`) — no HPA on workers per OI-2 spec |
| 5. Certificate Expiry | `CertificateExpiryWarning` (<14d), `CertificateExpiryCritical` (<3d) | `inflect-app-overview` | cert-manager renew, OR manual ACME issue + replace TLS Secret |
| 6. Rollback | post-deploy smoke fail / 5xx spike / operator decision | n/a | `helm rollback inflect-production` with revision-history walk |
| 7. Data Breach Response | log audit / suspicious access / leaked credentials | `AuditLog` table (hash-chained per Epic A.4) | KEK rotation via Epic B's v1→v2 sweep (NOT a Terraform regenerate); cascading rotation of all secrets |

**Communication templates** (5):
- PagerDuty incident (auto-populated from alert annotation; in-incident commentary goes in PagerDuty's Notes field, not the alert annotation)
- Status page: initial / mitigation / resolved
- Internal Slack incident-channel kickoff
- Customer email — service degradation
- Customer email — confirmed data breach (separate, with regulatory reminders)

**Severity definitions** (table in the runbook):

| Severity | Routing | Acknowledge SLA | Resolve SLA |
|---|---|---|---|
| CRITICAL | PagerDuty page | 15 min | 4 hours (matches RTO) |
| WARNING | Slack #alerts-warnings | Next business day | One sprint |

The severity is set by the alert's `labels.severity` field — operators don't choose. Manual escalation requires filing a fresh PagerDuty incident referencing the alert.

## SLOs documented

`docs/slos.md` extended from 4 SLOs (pre-OI-3, Epic 19) to **8 SLOs** covering every OI-3-spec dimension:

| SLO | Target | Window | Measurement source |
|---|---|---|---|
| 1. API Availability | ≥ 99.9% | 30 days | `api_request_count` 5xx rate |
| 2. API Latency — Reads (P95) | < 500ms | 30 days | `api_request_duration_bucket{http_method=~"GET\|HEAD"}` |
| 2b. API Latency — Writes (P95) | < 1000ms | 30 days | `api_request_duration_bucket{http_method=~"POST\|PUT\|PATCH\|DELETE"}` |
| 3. API Error Rate | < 1% | 30 days | `api_request_count{http_status_code=~"5.."}` rate |
| 4. Health Check Availability | ≥ 99.95% | 7 days | external uptime probe of `/api/livez` |
| 5. Repository Latency (P95) | < 100ms | 7 days | `repo_method_duration_bucket` (Epic OI-3 part 2) |
| 6. RPO (Recovery Point) | ≤ 1 hour | continuous | RDS continuous transaction log shipping + monthly `restore-test.sh` validation |
| 7. RTO (Recovery Time) | ≤ 4 hours | per-incident | `helm rollback` (5 min) → `restore-db-instance` (60-120 min) → cross-region (out of OI-3 scope) |

**Read/write latency split** is the headline change vs the previous single-P95 SLO. Why: reads and writes have fundamentally different cost profiles (cache-friendly reads vs transaction-committing writes). A single 500ms P95 was perpetually breached on writes without delivering proportional user-experience improvement. Splitting per OI-3 spec gives each path a target it can actually hit.

**RPO/RTO sections** explicitly map each recovery scenario to the mechanism that meets it:

| Scenario | RTO |
|---|---|
| Single pod failure | < 1 minute (k8s auto-restart) |
| Bad deploy | < 5 minutes (`helm rollback`) |
| Single AZ failure | 60-180 seconds (RDS multi-AZ failover) |
| RDS instance corruption | 60-120 minutes (`restore-db-instance-from-db-snapshot`) |
| Master KEK loss within 30-day window | 15-30 minutes (`aws secretsmanager restore-secret`) |
| Master KEK loss beyond window | hours-to-days; may exceed RTO |
| Regional AWS outage | 2-4 hours (manual restore in alternate region) |

## Files

| File | Status | Notes |
|---|---|---|
| `docs/slos.md` | Extended | Replaced single P95 SLO with separate read (<500ms) and write (<1000ms) SLOs; added SLO 5 (Repository latency from OI-3 part 2 metrics); added SLO 6 (RPO 1h, mapped to RDS PITR + monthly restore-test.sh); added SLO 7 (RTO 4h, mapped to helm rollback / restore-db-instance / DR runbooks); refreshed summary table to 8 entries; revision history records the OI-3 update |
| `docs/incident-response.md` | **New** | ~750 lines. Quick-reference table mapping every alert→playbook, dashboards table, severity definitions, common first-steps, 7 playbooks, 5 communication templates, operational alignment summary tying every section to its supporting epic |
| `tests/guards/oi-3-runbook-and-slos.test.ts` | **New** | 35-assertion ratchet asserting the docs cover the OI-3 spec items, every required playbook is present, alerts/dashboards/commands are referenced by name, and the runbook + alerts + dashboards are ALIGNED (every critical alert has a playbook section; every alert's dashboard annotation is referenced in the runbook) |
| `docs/implementation-notes/2026-04-27-epic-oi-3-incident-response-and-slos.md` | **New** | This file |

## Decisions

- **Extend `docs/slos.md`, don't rewrite.** The pre-existing SLOs (Epic 19) had the right structure (objective + measurement formula + scope + exclusions + telemetry source + alert thresholds). OI-3 adds 4 new SLOs in the same shape and modifies SLO 2 to split reads/writes. Operators reading the doc see one continuous evolution, not two parallel SLO documents.

- **Single runbook, not per-failure-mode files.** A 7-section single doc with anchor links is more navigable under pressure than 7 separate files. Operators land on the page from the alert annotation and scroll to their section without context-switching.

- **Quick-reference table at the top.** First thing an operator sees: "I see X → page severity → dashboard → playbook section". Three clicks (or even zero clicks if they're skimming) to the relevant playbook. Designed for 3am cognitive load.

- **Every playbook has explicit `kubectl` / `aws` / `helm` commands.** Not "investigate connectivity" but `kubectl --namespace inflect-production run --rm -it --image=curlimages/curl debug -- curl -v http://inflect-production.inflect-production.svc.cluster.local/api/livez`. The 30 seconds of operator typing time matters at incident-time + the explicit command path forms an audit trail of "what we tried".

- **Severity routing is alert-determined, not operator-determined.** The runbook documents this explicitly so a paged operator doesn't think "this isn't a real critical, let me silence it" — the severity tier reflects an architectural decision (this signal warrants a page); silencing it is a policy change, not an in-incident decision.

- **Migration safety on rollback gets its own subsection.** The Helm rollback playbook would otherwise be unsafe — rolling back the app image past a Contract migration leaves OLD code reading NEW schema. Calling out expand-and-contract discipline IN the rollback section means the operator who's about to rollback in a hurry sees the warning. Ratchet asserts the section is present.

- **Data breach playbook is action-first, then assess, then notify.** The 5-phase structure (contain → assess → notify → recover → post-mortem) reflects regulatory clocks (GDPR Art. 33: 72h to supervisory authority). Containing the bleed within 30 minutes — credential rotation, evidence preservation — is the only thing that matters in the first phase. Lawyer-readable notification language is phase 3.

- **Communication templates are explicit, with placeholders, not abstract.** The status-page templates use exact wording fields (`<UTC time>`, `<root cause description>`) so an operator under pressure isn't writing prose from scratch. Customer-facing breach email is a separate template with regulatory reminders, NOT a variant of the degradation template.

- **Operational alignment summary at the bottom of the runbook.** Every section in the runbook references a deliverable from a prior epic (Helm chart for rollback, RDS PITR for restore, Secrets Manager for KEK, AuditLog for breach forensics). The summary table makes the cross-epic dependency graph explicit so a reviewer can confirm the runbook isn't generic — it's anchored in this codebase's specific machinery.

- **Tests assert ALIGNMENT, not just presence.** The ratchet doesn't just check that "AppDown" is in the runbook — it asserts that:
  - Every critical alert in `rules.yml` is named in the runbook
  - Every dashboard UID referenced in alert annotations appears in the runbook's dashboards table
  - The runbook's `helm rollback` examples use the canonical release name (`inflect-production`)
  - The data-breach section references `epic-b-encryption.md` for KEK rotation (not a free-form "rotate keys" instruction)

  Drift between the alerts/dashboards/runbook breaks one of these alignment assertions. CI catches it before merge.

## Operational alignment summary

This closing PR brings OI-3 from "instrumented" to "operable". The
runbook is the **handle** by which an operator drives the
machinery shipped across the 12 OI-1 / OI-2 / OI-3 PRs:

```
                            ┌────────────────────────────────────┐
                            │   docs/incident-response.md        │
                            │   docs/slos.md                     │
                            └──────────────┬─────────────────────┘
                                           │
                ┌──────────────────────────┴──────────────────────────┐
                │                          │                          │
                ▼                          ▼                          ▼
       ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
       │  Detection     │         │  Diagnosis     │         │  Recovery      │
       │  (Epic OI-3.3) │         │  (Epic OI-3.2) │         │ (OI-1 + OI-2 + │
       │                │         │                │         │  OI-3.4)       │
       │ - alerts       │         │ - dashboards   │         │ - helm rollback│
       │ - external     │         │ - readyz route │         │ - restore-test │
       │   uptime       │         │ - repo metrics │         │ - secrets mgr  │
       │ - PagerDuty    │         │ - audit log    │         │ - PITR restore │
       │ - Slack        │         │                │         │ - K8s controls │
       └────────────────┘         └────────────────┘         └────────────────┘
```

Each runbook section names which alert fires it, which dashboard
diagnoses it, and which command (with the correct release name +
namespace) recovers it. The structural ratchet enforces the
cross-references so they don't drift over time.

## Verification performed

- **Documentation completeness review** via `tests/guards/oi-3-runbook-and-slos.test.ts` — **35 assertions, all green**:
  - SLOs cover the 4 OI-3-spec dimensions (availability ≥99.9%, latency <500/1000ms split, RPO 1h, RTO 4h, plus the OI-3-part-2 repository SLO)
  - Each SLO references its measurement metric/mechanism by name
  - SLO summary table contains all 8 entries
  - Runbook contains all 7 required playbooks
  - Quick-reference table maps every OI-3-required alert to a playbook
  - All 5 dashboard UIDs referenced
  - Each playbook references the right alert + dashboard + command
  - **Alignment**: every critical alert in `rules.yml` is named in the runbook; every dashboard UID in alert annotations is in the runbook's dashboards table; SLO doc references the alert names that protect each SLO
  - Communication templates: 5 named templates + 2 customer-email variants
  - Severity definitions table is present
  - Operational alignment section names every prior epic + key deliverable

- **Total OI-3 ratchet count across all 5 PRs**: **189 assertions**:
  - 16 readyz unit tests
  - 22 repository-tracing unit tests
  - 50 observability dashboards ratchet
  - 34 alerting ratchet
  - 32 backup-restore ratchet
  - 35 runbook + SLOs ratchet

  All green. Run with:
  ```
  npx jest tests/guards/oi-3-*.test.ts \
           tests/unit/repository-tracing.test.ts \
           tests/unit/readyz.test.ts
  ```

- **Documentation-vs-implementation alignment** confirmed via the ratchet's "final readiness check" describe block:
  - Every `severity: critical` alert in `infra/alerts/rules.yml` is referenced by name in `docs/incident-response.md`
  - Every `dashboard:` annotation value in `rules.yml` resolves to a dashboard UID present in the runbook's dashboards table
  - `docs/slos.md` references the alert names (`ApiP95LatencyWarning`, `ApiP95LatencyCritical`) that fire when SLO budgets burn
  - `docs/incident-response.md` references `restore-test.sh`, `manage_master_user_password`, `external-uptime.yml` — the canonical artefacts of OI-1 / OI-3.4 / OI-3.3 respectively

- **No live incident drill** — would require coordinating an actual incident with on-call. The structural ratchet asserts the docs are reviewable + operationally usable + aligned with the underlying machinery; first-real-incident is the operator validation.

## Final Epic OI-3 completion summary

5 PRs across the epic, 5 implementation notes (counting this one), **189 structural + unit assertions** locking the entire layer.

### Source-of-truth coverage

| OI-3 requirement | Delivered | Phase |
|---|---|---|
| `/api/readyz` checks Postgres / Redis / S3 | ✅ | OI-3.1 — readyz dependency checks |
| 503 with failed component on dep failure | ✅ (`failed[]` array + structured `checks{}` map) | OI-3.1 |
| Per-check timeout + bounded error codes (no credential leakage) | ✅ | OI-3.1 |
| OTel instrumentation across `src/app-layer/repositories/*.ts` | ✅ helper + 12 methods × 3 high-traffic repos as exemplars | OI-3.2 — repository tracing |
| Records method name, duration, tenant_id, result_count | ✅ (tenant_id span-only — cardinality-safe) | OI-3.2 |
| 4 dashboards (App / DB / Redis / BullMQ) under `infra/dashboards/` | ✅ all importable + provisionable | OI-3.2 |
| 6 alert rules (P95 >2s, error >1%, DB pool, Redis >80%, queue >1000, cert <14d) | ✅ (4 new + 2 existing already at threshold) | OI-3.3 — alerting |
| `infra/alerts/receivers.yml` PagerDuty (critical) + Slack (warning) | ✅ + inhibit rules + secret hygiene | OI-3.3 |
| External uptime monitoring on `/api/livez` | ✅ provider-agnostic spec, multi-region prod, single-region staging | OI-3.3 |
| Managed DB PITR verified | ✅ Terraform validation refuses 0; production retention 14d | OI-3.4 — backup + restore |
| Self-hosted `pg_dump` to S3 with 30d retention (fallback) | ✅ `infra/scripts/pg-dump-to-s3.sh` | OI-3.4 |
| `infra/scripts/restore-test.sh` monthly automated restore test | ✅ + `.github/workflows/restore-test.yml` cron | OI-3.4 |
| Restore validates against smoke + tears down | ✅ 7 psql validation checks + bash trap cleanup | OI-3.4 |
| `docs/incident-response.md` with 6 playbooks + comm templates | ✅ 7 playbooks + 5 comm templates | OI-3 closing (this PR) |
| `docs/slos.md` with availability 99.9% / latency p95 < 500ms reads & < 1s writes / RPO 1h / RTO 4h | ✅ 8 SLOs total in summary | OI-3 closing |

### Observability stack — end-to-end map

```
              Production traffic
                     │
                     ▼
        ┌─────────────────────────────────┐
        │   Next.js app + worker pods     │
        │   (Helm chart — Epic OI-2)      │
        └────────┬─────────────┬──────────┘
                 │             │
   src/lib/observability/      kubectl probes (livez, readyz)
   metrics.ts (OTel)             │
   tracing.ts                    ▼
   repository-tracing.ts   ┌─────────────────┐
                 │         │  k8s pod        │
                 │         │  rotation       │
                 │         └─────────────────┘
                 ▼
     ┌─────────────────────┐
     │  OTel Collector     │ ─── slow-log + engine-log
     │   (operator-wired)  │     (Epic OI-1 RDS + Redis)
     └────────┬────────────┘
              │ remote_write
              ▼
     ┌─────────────────────┐
     │     Prometheus      │
     └────────┬────────────┘
              │
   ┌──────────┼──────────────────────────┐
   ▼          ▼                          ▼
┌──────┐  ┌──────────┐              ┌─────────────┐
│ Graf │  │Alertmgr  │  ──────────► │ PagerDuty   │ critical
│ ana  │  │          │              │ (on-call)   │
│      │  │          │  ──────────► │ Slack       │ warnings
│ 5    │  │ rules.yml│              │ #alerts-warn│
│dashb │  │ inhibit  │              └─────────────┘
└──────┘  └──────────┘                     │
                                           │
                                           ▼
                              External uptime monitor
                              (UptimeRobot / Pingdom /
                               Statuscake / Route 53)
                              probing /api/livez
                              from multiple regions
```

### File footprint

OI-3 across all 5 PRs:

| Layer | Count |
|---|---|
| Application source (route + helper) | 3 files (readyz, repository-tracing, metrics extension) |
| App instrumentation | 3 repos × ~4 methods each (12 wrappings total) |
| Infra config (dashboards, alerts) | 4 dashboards + rules.yml extension + receivers.yml + external-uptime.yml |
| Operational scripts | 2 scripts (restore-test, pg-dump-to-s3) |
| GitHub Actions workflows | 1 new (restore-test.yml) |
| Documentation | 2 main docs (slos.md extended, incident-response.md new) + 5 implementation notes |
| Tests | 6 test files (2 unit + 4 ratchet) — 189 assertions |

**Epic OI-3 is complete and production-credible.** Detection, diagnosis, and recovery are all instrumented end-to-end; SLOs are measurable against the shipped telemetry; runbooks reference the exact commands an operator runs; backup is not just configured but exercised monthly; and 189 ratchet assertions guard against silent regression.
