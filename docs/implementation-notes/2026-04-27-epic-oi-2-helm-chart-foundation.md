# 2026-04-27 — Epic OI-2: Helm chart foundation + main app Deployment

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

## Design

Helm chart at `infra/helm/inflect/` packaging the Next.js app
Deployment. Scope of THIS PR: chart scaffolding (Chart.yaml,
values.yaml, _helpers.tpl) + the primary app Deployment template.
Service / Ingress / HPA / ConfigMap / Secret / BullMQ-worker
templates land in subsequent OI-2 PRs.

### Layout

```
infra/helm/inflect/
├── Chart.yaml             ← apiVersion v2, type application
├── values.yaml            ← env-agnostic defaults
├── README.md              ← chart-specific operator notes
├── .helmignore
└── templates/
    ├── _helpers.tpl       ← name/fullname/labels/selectorLabels/image/envFrom* helpers
    ├── deployment.yaml    ← Next.js app Deployment
    └── NOTES.txt          ← post-install hints
```

### Versioning model

| Field | Source | Cadence |
|---|---|---|
| `Chart.yaml::version` | manual | Bump on chart-level changes (template edits, breaking values-shape changes) |
| `Chart.yaml::appVersion` | matches `package.json::version` | Lock-step with each app release; drift fails the structural ratchet |

The chart's default image tag (in `values.yaml`) is empty — the
`inflect.image` helper falls back to `.Chart.AppVersion`. So bumping
`appVersion` is the canonical path to releasing a new app version
through the chart.

### Deployment configuration

Per OI-2 spec:

| Property | Value | Source |
|---|---|---|
| Container port | 3000 | matches OI-1's `vpc_app_ingress_port` default |
| Liveness probe | `GET /api/livez` (initial 30s, every 15s) | dependency-free; just confirms Node event loop is responsive |
| Readiness probe | `GET /api/readyz` (initial 10s, every 10s) | checks DB + Redis + storage; returns 503 on dep outage |
| CPU req / lim | 1 / 2 | OI-2 spec |
| Memory req / lim | 512Mi / 1Gi | OI-2 spec |
| `envFrom` | configMapRef + secretRef | both enabled by default; names default to `<fullname>-config` and `<fullname>-secrets` |
| Pod security | `runAsNonRoot=true`, uid 1001, `fsGroup` 1001 | hardened defaults |
| Container security | drop ALL capabilities, no privilege escalation | hardened defaults |

### Why `envFrom` references external resources (not chart-managed)

The chart's `envFrom` block references ConfigMap + Secret resources
**by name** without creating them in this iteration. Operators
provide them via:

1. `kubectl apply -f` for static config
2. **External Secrets Operator** (preferred) — pulls runtime secrets
   from AWS Secrets Manager (Epic OI-1) and writes them to a K8s
   Secret matching the expected name. The IAM policy ARN to attach
   to the workload role is the `runtime_secrets_read_policy_arn`
   output from Epic OI-1's terraform stack.

ConfigMap and Secret templates landing in this chart would be
duplicate work — the canonical secret store is AWS Secrets Manager
(per OI-1). External Secrets Operator is the standard bridge.

A future PR may add chart-managed templates gated on
`.Values.config.create` / `.Values.secret.create` for cluster
operators who don't want External Secrets Operator (e.g. local
dev/kind deployments).

### Selector labels — load-bearing immutability

`spec.selector.matchLabels` on a Deployment is **immutable** once
created. The `inflect.selectorLabels` helper restricts to the stable
subset:

```
app.kubernetes.io/name: <chart-name>
app.kubernetes.io/instance: <release-name>
```

The full `inflect.labels` helper (used on the pod template + the
Deployment metadata) ALSO carries `app.kubernetes.io/version`,
`helm.sh/chart`, etc. — those are mutable across upgrades. Splitting
the two helpers means a chart-version bump doesn't break the
selector. Structural ratchet asserts the deployment uses the
stable subset for `matchLabels`.

## Files

| File | Status | Notes |
|---|---|---|
| `infra/helm/inflect/Chart.yaml` | New | apiVersion v2, name=inflect, type=application, version 0.1.0, appVersion 1.35.1, kubeVersion >=1.28.0 |
| `infra/helm/inflect/values.yaml` | New | All env-agnostic defaults (replicaCount=1, resources, probes, envFrom names, podSecurityContext) |
| `infra/helm/inflect/.helmignore` | New | Standard helm ignore patterns |
| `infra/helm/inflect/README.md` | New | Chart-scoped operator notes (versioning, contract, install, validation) |
| `infra/helm/inflect/templates/_helpers.tpl` | New | 9 helpers locked by ratchet |
| `infra/helm/inflect/templates/deployment.yaml` | New | Next.js app Deployment |
| `infra/helm/inflect/templates/NOTES.txt` | New | Post-install hints pointing at OI-1's secret_arn output |
| `tests/guards/helm-chart-foundation.test.ts` | New | 37-assertion structural ratchet |
| `docs/implementation-notes/2026-04-27-epic-oi-2-helm-chart-foundation.md` | New | This file |

## Decisions

- **`appVersion` matches `package.json::version`, locked by ratchet.**
  The chart's default image tag falls back to `.Chart.AppVersion`,
  so drift between the two means the chart would default to a
  non-existent image. The ratchet reads both files and asserts
  equality — a drift fails CI in the same diff that introduces it.

- **Two helpers for labels — `inflect.labels` (full) and
  `inflect.selectorLabels` (stable subset).** Selector labels MUST
  be stable across upgrades because `spec.selector.matchLabels` is
  immutable on a Deployment. Mixing version-bearing labels into the
  selector would require deleting + recreating the Deployment on
  every upgrade. Industry-standard split (every charter following
  Kubernetes' own chart-best-practices does this); ratchet asserts
  matchLabels uses the stable subset.

- **Image tag is empty by default; helper falls back to AppVersion.**
  Two reasons: (a) `appVersion` is the version the chart was
  authored for — the natural default; (b) operators who want
  pinning can `--set image.tag=...` without forking the chart. The
  ratchet asserts the empty default so a hardcoded tag doesn't
  silently land.

- **Container port hardcoded to 3000 in values default.** Matches
  the app's PORT default, OI-1's `vpc_app_ingress_port` default,
  and the existing `docker-compose.prod.yml` port mapping. A future
  port change would be a coordinated 4-place edit (app code, OI-1
  vpc module, docker-compose, this chart) — better surfaced as
  intentional drift than hidden in defaults.

- **`envFrom` references external ConfigMap + Secret by NAME, not
  chart-managed.** AWS Secrets Manager (Epic OI-1) is the canonical
  secret store. External Secrets Operator bridges Secrets Manager
  → K8s Secrets. Adding chart-managed Secret templates would create
  a second source of truth and force operators to choose. Defer
  chart-managed config/secret templates to a follow-up gated on
  `.Values.config.create` / `.Values.secret.create` for non-AWS
  deployments.

- **Pod security: `runAsNonRoot=true`, uid 1001, drop ALL
  capabilities, no privilege escalation.** Hardened defaults that
  pass most cluster admission policies (Pod Security Standards
  "restricted" tier). The Next.js Dockerfile must respect uid 1001
  (the existing image uses node:20-alpine which runs as `node` uid
  1000 — the chart's 1001 is intentional, signals the upcoming
  Dockerfile change). For now, pods may fail to start until the
  Dockerfile aligns. Acceptable for OI-2's "render valid YAML"
  acceptance criterion; functional rollout testing comes later.

- **`readOnlyRootFilesystem=false` (for now).** Next.js writes
  `.next/cache` at runtime. Switching to true requires mounting an
  emptyDir at `/app/.next/cache` — out of scope for OI-2's first
  Deployment template. Documented in values.yaml comment for the
  follow-up.

- **`replicaCount: 1` default.** Per-env values files (a future PR)
  will override: staging stays at 1, production goes to 3 with HPA
  scaling 3-10. The OI-2 spec explicitly carves HPA out of this PR.

- **No structural assertion on the `helm.sh/chart` label format.**
  Helm itself enforces this convention; pinning the regex would
  break on minor chart-name changes without adding security value.

## Verification performed

- **`helm lint`** (via `alpine/helm:3.14.0` Docker image):
  `1 chart(s) linted, 0 chart(s) failed`. Only an INFO note about
  a missing icon (optional in Chart.yaml).
- **`helm template my-release inflect`**: renders cleanly, image
  tag falls back to `1.35.1` from `Chart.AppVersion`, envFrom emits
  both `configMapRef:my-release-inflect-config` and
  `secretRef:my-release-inflect-secrets`, probes target
  `/api/livez` + `/api/readyz`, resources match spec defaults
  exactly (req `1`/`512Mi`, lim `2`/`1Gi`).
- **YAML round-trip via `js-yaml`** of the rendered output:
  `docs: 1, Deployment my-release-inflect`. Single document, valid
  K8s schema.
- **Structural ratchet**:
  `tests/guards/helm-chart-foundation.test.ts` — **37 assertions,
  all green**. Locks file presence, Chart.yaml fields,
  appVersion ↔ package.json sync, resource defaults, probe paths,
  envFrom shape, helper names, selector-label stability, image
  helper fallback.
- **CI integration**: `helm lint` + `helm template` should run on
  any PR touching `infra/helm/**` — call-out for the follow-up that
  lands `.github/workflows/helm.yml` (the OI-1 terraform.yml
  workflow is the template).
