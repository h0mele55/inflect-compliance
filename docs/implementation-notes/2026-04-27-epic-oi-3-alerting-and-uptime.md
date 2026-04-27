# 2026-04-27 — Epic OI-3: Alerting + receivers + external uptime

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Closes Epic OI-3's alerting + uptime layer. Builds on the prior two
OI-3 notes (readyz dependency checks; repository instrumentation +
dashboards). Adds:

1. 6 alert rules in `infra/alerts/rules.yml` (4 new + 2 existing
   ratchet-asserted) covering the OI-3 spec.
2. `infra/alerts/receivers.yml` — Alertmanager config with
   PagerDuty-for-critical and Slack-for-warning routing, plus
   inhibit rules to prevent double-pages.
3. `infra/alerts/external-uptime.yml` — provider-agnostic monitor
   spec for `/api/livez`, distinct from in-cluster readyz.

## Alerting strategy

**Two-tier severity routing**:

| Tier | Source | Routes to | repeat_interval | Examples |
|---|---|---|---|---|
| `critical` | source-of-truth = OI-3 spec items that are immediate user-impact (P95 > 2s, queue > 1000, DB pool exhausted, Redis > 95%, cert < 3d, livez external 503) | PagerDuty (`pagerduty-critical` receiver) | 1h | Page on-call within 10s grouping window |
| `warning` | OI-3 spec items that are leading-indicators (error rate > 1%, Redis > 80%, queue > 100, cert < 14d, staging livez fail) | Slack (`slack-warnings` receiver) | 4h | Investigate next business day |

**Inhibit rules** prevent double-paging when both tiers fire for the
same underlying incident:
- Generic: any `severity=critical` of an `alertname` suppresses any
  `severity=warning` of the same `alertname` (matched by `service`).
- Specific: explicit pairs for the warning↔critical ladders
  (`QueueDepthBacklogCritical` ↔ `QueueDepthBacklogWarning`,
  `RedisMemoryHighCritical` ↔ `RedisMemoryHighWarning`,
  `CertificateExpiryCritical` ↔ `CertificateExpiryWarning`).
  Redundant with the generic rule but explicit at PR-review time.

**Default route catches misrouted alerts**: the top-level
`route.receiver` is `slack-warnings` (not empty / not silent). If a
future alert is misconfigured with an unknown severity tier, it
lands in Slack instead of disappearing. Defence in depth.

**Internal vs external observability split** (OI-3 source-of-truth):

```
                          Internal probe         External probe
                          (Kubernetes)            (UptimeRobot etc.)
                              │                          │
                              ▼                          ▼
   GET /api/readyz                            GET /api/livez
   (DB + Redis + S3                            (process alive,
    dependency-aware)                           dependency-free)
                              │                          │
                              ▼                          ▼
   503 → pod NotReady                         200 always when up
   k8s rotates traffic                        Multi-region probes
   in-cluster                                 If it 503s → user
                                              actually saw downtime
                              │                          │
                              ▼                          ▼
   ReadyzProbeFailure /                       External monitor's
   ReadyzProbeCritical                        on_failure routing →
   alerts                                     pagerduty-critical
```

A blip on RDS triggers `ReadyzProbeFailure` (warning → Slack)
because k8s already rotates traffic. A multi-region external
livez 503 page (critical → PagerDuty) fires only when ALL pods
across ALL pops fail — which is what the user actually sees.

## Rules added or updated

**New (4 alerts, 2 ladders)**:

| Alert | Severity | Threshold | Source | Route |
|---|---|---|---|---|
| `DatabaseConnectionPoolExhausted` | critical | `repo_method_errors{error_type=~"PrismaClient.*"}` rate > 20% of total `repo_method_calls` for 3m | OI-3 part 2 metrics | PagerDuty |
| `RedisMemoryHighWarning` | warning | `aws_elasticache_database_memory_usage_percentage_average` > 80% for 10m | CloudWatch exporter | Slack |
| `RedisMemoryHighCritical` | critical | > 95% for 5m | CloudWatch exporter | PagerDuty |
| `QueueDepthBacklogCritical` | critical | `job_queue_depth{queue_state="waiting"}` > 1000 for 5m | OTel job metrics | PagerDuty |
| `CertificateExpiryWarning` | warning | `(probe_ssl_earliest_cert_expiry - time()) / 86400 < 14` for 1h | blackbox_exporter | Slack |
| `CertificateExpiryCritical` | critical | < 3 days for 5m | blackbox_exporter | PagerDuty |

**Existing (already covered)**:

| Alert | Why it covers the OI-3 spec |
|---|---|
| `ApiP95LatencyCritical` | OI-3 spec item "P95 latency > 2s" — already at threshold 2000ms |
| `ApiErrorRateWarning` | OI-3 spec item "error rate > 1%" — already at threshold 0.01 |

`promtool check rules rules.yml` — **SUCCESS: 16 rules found** (the existing 10 + 6 new).

### Why "DB connection pool exhausted" alerts on Prisma error rate

Prisma doesn't expose pool metrics by default. Connection-pool
exhaustion manifests as **rapid Prisma errors across multiple repo
methods at once**. Watching `repo_method_errors{error_type=~"PrismaClient.*"}`
rate against total `repo_method_calls` rate captures the symptom
without needing a separate pool-stats exporter.

The 20% error rate threshold + 3-minute `for:` window screens out
single-bad-query noise. A real pool exhaustion produces 50%+ errors
within seconds across most repo methods. The alert description's
runbook walks operators to PgBouncer's `SHOW POOLS;` for the
ground-truth pool state.

### Why Redis warning at 80% / critical at 95%

The chart's redis parameter group enforces `maxmemory-policy=noeviction`
(BullMQ requirement — jobs must never be evicted). At 100% memory,
ElastiCache REJECTS writes. Workers fail to enqueue.

- **80%** gives ~20% headroom for the operator to scale or evict
  completed jobs before reaching the cliff.
- **95%** is rejection-imminent; on-call needs to act within minutes.

A "70%" first-warning would be too noisy (occasional spikes up to
70% are routine). A "90%" first-warning would leave too little
runway for a graceful response.

### Why cert expiry warning at 14d / critical at 3d

cert-manager renews certs at **30 days remaining** by default. If
the cert is still valid for less than 14 days, automated renewal
has FAILED — operator action required. 3 days is the
operator-acts-NOW boundary (browsers reject HTTPS once expired;
service-down imminent).

## Receiver / routing design

`infra/alerts/receivers.yml` is a standard Alertmanager v0.27+ config:

```
route (default → slack-warnings, group_wait 30s, repeat 4h)
├── matchers: severity = "critical"
│       └─→ pagerduty-critical (group_wait 10s, repeat 1h)
└── matchers: severity = "warning"
        └─→ slack-warnings    (group_wait 30s, repeat 4h)

receivers:
  pagerduty-critical:  Events API v2, dedup by alertname+service,
                       send_resolved=true (incidents auto-close on
                       recovery)
  slack-warnings:      Webhook to #alerts-warnings, distinct color
                       cue for firing vs resolved messages

inhibit_rules:  generic critical→warning suppression by alertname,
                plus explicit pairs for the three new ladders
```

**Secret hygiene**: `${PAGERDUTY_SERVICE_KEY}` and `${SLACK_WEBHOOK_URL}`
are env-var references — Alertmanager substitutes at start. The
ratchet asserts no 32-char hex (PagerDuty integration key shape) or
`hooks.slack.com/services/T*/B*/...` URLs land as literals in the
file. Real values live in the cluster's Alertmanager Secret,
populated from AWS Secrets Manager via External Secrets Operator
(same model as Epic OI-1).

**`send_resolved: true` on both receivers**: when the underlying
condition recovers, PagerDuty auto-closes the incident and Slack
gets a green-checkmark message. Without this, on-call pages keep
showing as open even after the alert is no longer firing.

## External uptime contract

`infra/alerts/external-uptime.yml` is provider-agnostic — operators
implement the spec in UptimeRobot / Pingdom / Statuscake / AWS Route
53 Health Checks via that tool's API. The file documents the
contract; the operator owns the wire-up.

| Property | Production | Staging |
|---|---|---|
| URL | `https://app.example.com/api/livez` | `https://staging.example.com/api/livez` |
| Interval | 60s | 300s |
| Timeout | 10s | 10s |
| Locations | us-east, us-west, eu-west, ap-southeast | us-east only |
| Expected status | 200 | 200 |
| Expected body | `"status":"alive"` substring | same |
| SSL validity check | yes (catches expired cert externally) | yes |
| Failure consecutive | 2 (= 2 min before paging prod) | 3 (= 15 min before warning) |
| On failure → severity | critical | warning |
| On failure → route | pagerduty | slack |

**Why /api/livez, not /api/readyz**:
- livez is dependency-free — always 200 when the process is alive.
- An external probe of livez tests the FULL chain: DNS → LB → Ingress
  controller → Service → pod → app. Any link breaking causes the
  probe to 503/timeout.
- readyz returns 503 on internal dep blips (RDS failover, ElastiCache
  refresh). From the user's perspective the SERVICE is still up
  (k8s rotates traffic). Probing readyz externally would flap on
  blips that the user never saw.

**Why multi-region for production**: a single uptime-tool POP can
itself fail. 4 regions × 2 consecutive failures means the alert
only fires when the failure is GLOBAL — i.e. the user is actually
seeing the service down.

## Files

| File | Status | Notes |
|---|---|---|
| `infra/alerts/rules.yml` | Extended | +6 new alert rules (DatabaseConnectionPoolExhausted, RedisMemoryHighWarning + Critical, QueueDepthBacklogCritical, CertificateExpiryWarning + Critical) in 3 new groups (`inflect.database`, `inflect.redis`, `inflect.certificates`) |
| `infra/alerts/receivers.yml` | **New** | Alertmanager config: top-level route → slack-warnings default; child routes for severity=critical → pagerduty-critical and severity=warning → slack-warnings; pagerduty + slack receivers with templates; inhibit rules (generic + 3 explicit) |
| `infra/alerts/external-uptime.yml` | **New** | Provider-agnostic monitor spec: 2 monitors (production critical→pagerduty, staging warning→slack), targeting /api/livez with `"status":"alive"` body match + SSL validity, multi-region for prod |
| `tests/guards/oi-3-alerting.test.ts` | **New** | 34-assertion ratchet validating: rules.yml shape + 6 spec-required alerts present with correct thresholds + every new alert carries severity/service/runbook/dashboard; receivers.yml has both PD + Slack receivers with right routing + default-receiver guard + secret-hygiene check + inhibit rules; external-uptime.yml targets livez (NOT readyz), expects 200 + body substring + SSL valid, prod=critical-pagerduty + staging=warning-slack, prod=multi-region |
| `docs/implementation-notes/2026-04-27-epic-oi-3-alerting-and-uptime.md` | **New** | This file |

## Decisions

- **Reuse existing alerts where they cover the spec.** `ApiP95LatencyCritical` already exists at the OI-3 threshold (>2s); `ApiErrorRateWarning` exists at >1%. Adding new alerts with similar names would create duplicate-fire scenarios. The structural ratchet asserts the existing alerts cover the spec's threshold values, so a future "simplify" PR that drops them fails CI in the same diff.

- **DB pool exhaustion via repo error rate, not a dedicated metric.** Prisma's `$metrics.json()` exposes pool stats but requires Prisma client config + an extra OTel collector. The repo error rate signal is **already available** (Epic OI-3 part 2 added `repo_method_errors`). Pragmatic fit: alerts on the symptom that operators care about (rapid query failures) without adding a new collector. The runbook directs operators to PgBouncer's `SHOW POOLS;` for ground truth — that's where they'd look anyway.

- **20% error rate threshold for the pool-exhaustion alert.** Lower (5%) would page on transient network blips; higher (50%) would let real exhaustion linger. 20% over 3 minutes screens out single-bad-query noise while catching real saturation within ~1 PR-review cycle of operator response.

- **Inhibit rules collapse warning + critical of same alertname.** Without this, on-call gets paged for the critical AND messaged in Slack for the warning — same incident, two surfaces, twice the cognitive load. Generic rule + 3 explicit pairs is belt-and-braces.

- **Default route → slack-warnings (not empty).** If a future alert ships with `severity=info` or `severity=urgent` (typos OR new tiers), it lands in Slack instead of disappearing into the route's nowhere-receiver. Defence in depth against silent loss.

- **External uptime probes /api/livez specifically, not the homepage.** A homepage probe tests the same chain BUT is sensitive to frontend bundle changes, A/B tests, content updates. /api/livez is a stable contract — body shape locked, status code locked. Won't flap on UI changes.

- **Multi-region production probes.** Single-region uptime tools have their own outages. Four geographic POPs × 2 consecutive failures means the alert fires only when the failure is GLOBAL (which is what the user sees). Cost: 4× monitor charges per provider plan; usually negligible.

- **Staging external uptime is warning-tier, not critical.** Staging being down doesn't impact users. Operators investigate next business day; NOT a paging event. Severity escalation matches env importance.

- **`infra/alerts/external-uptime.yml` is documentation, not executable config.** No tool natively consumes this file (every uptime provider has its own API). The file's value is the operator-readable contract — a reviewer can verify in 30 seconds that the spec's livez/multi-region/severity-routing requirements are met. Wiring it to UptimeRobot's API or AWS Route 53 Health Checks is the operator's wire-up; the file is the source-of-truth for what to wire.

- **Dashboards referenced in alert annotations.** Every new alert points at the right dashboard via the `dashboard:` annotation key (`/d/inflect-database` for DB-pool, `/d/inflect-redis` for memory, `/d/inflect-bullmq` for queue, `/d/inflect-app-overview` for cert). On-call clicks straight from the page to the chart that shows the trend. Saves 30 seconds per page; matters at 3am.

## Verification performed

- **`promtool check rules rules.yml`**: `SUCCESS: 16 rules found` (10 existing + 6 new). Validated via Prometheus 2.51.0 Docker image. Confirms PromQL syntax, label cardinality, and rule structure are valid.

- **YAML parse**: `js-yaml` round-trips `receivers.yml` and `external-uptime.yml` cleanly. Receivers file has 2 receivers + 4 inhibit rules; external-uptime has 2 monitors.

- **Structural ratchet**: `tests/guards/oi-3-alerting.test.ts` — **34 assertions, all green**. Locks:
  - rules.yml structural shape + 6 OI-3-required alerts present at the right thresholds
  - Every new alert carries severity/service/summary/description/dashboard annotations + a `Runbook:` section in the description
  - receivers.yml has both `pagerduty-critical` (with pagerduty_configs) AND `slack-warnings` (with slack_configs) receivers
  - severity=critical routes to pagerduty-critical; severity=warning routes to slack-warnings
  - Default route receiver is non-empty (anti-silent-loss)
  - **Secret hygiene**: env-var references present (`${PAGERDUTY_SERVICE_KEY}`, `${SLACK_WEBHOOK_URL}`); no 32-char hex tokens or `hooks.slack.com/services/...` URLs leaked
  - inhibit_rules collapse critical + warning of same alertname (anti-double-page)
  - external-uptime targets `/api/livez` (NOT `/api/readyz`)
  - Every monitor expects 200 + the stable `"status":"alive"` body substring
  - production = critical → pagerduty; staging = warning → slack
  - production checks SSL validity + probes from multiple regions

- **Total OI-3 ratchet count**: **122 assertions** across the three OI-3 ratchet files (16 readyz + 22 repository-tracing + 50 observability dashboards + 34 alerting). All green.

- **Live alert simulation**: not executed in this session (would need a live Prometheus + Alertmanager + PagerDuty test integration + Slack channel). Sanity-checked via promtool's static rule validation, the structural ratchet's assertion of routing semantics, and the explicit inhibit-rule shape. End-to-end fire-and-route simulation is operator validation post-merge.

- **`/api/livez` external suitability check**: read the route source — confirms always-200, dependency-free, `{"status":"alive",...}` body. Both properties locked in the structural ratchet (status_code: 200 + body_contains: `"status":"alive"`). If a future PR adds dependency checks to livez, this ratchet fails.
