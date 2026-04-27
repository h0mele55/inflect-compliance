# 2026-04-27 — Epic OI-2: NetworkPolicy + Ingress + per-env values

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Closes Epic OI-2. Builds on the prior three OI-2 notes (foundation
→ worker + migration → HPA + PgBouncer). Adds:

1. `templates/service.yaml` — ClusterIP Service (implicit dependency
   of Ingress; selects component=app pods only)
2. `templates/networkpolicy.yaml` — least-privilege egress
3. `templates/ingress.yaml` — TLS + rate limiting + HSTS,
   controller-agnostic
4. `values-staging.yaml` — 1 replica, smaller resources,
   NetworkPolicy off, staging hostname
5. `values-production.yaml` — autoscaling 2→10, larger resources,
   NetworkPolicy on with prod CIDR, HPA scale-up-fast/scale-down-slow
   behavior, AZ topology spread

## Design

### Service (cluster-internal)

Required for Ingress to have a backend. ClusterIP only — never
exposed externally directly. Selectors restricted to `component=app`
so the Service routes only to web pods, not workers or migration.

PgBouncer's port 5432 is **not** exposed via the Service — it lives
at `127.0.0.1:5432` in the pod network only, unreachable from
outside the pod.

### NetworkPolicy

Per OI-2 spec — egress allowed only to:

| Destination | Port | Why |
|---|---|---|
| kube-dns Service in `kube-system` | UDP+TCP 53 | DNS resolution; without this everything else breaks |
| VPC CIDR (`10.0.0.0/16` default) | TCP 5432 | Managed RDS Postgres |
| VPC CIDR | TCP 6379 | Managed ElastiCache Redis |
| `0.0.0.0/0` except `169.254.169.254/32` | TCP 443 | S3, Secrets Manager, STS, OAuth providers — IMDS deliberately blocked |

Everything else: **denied**.

**Why CIDR-scoped, not destination-hostname?** Kubernetes core
NetworkPolicy doesn't support DNS-based egress. The VPC CIDR is the
narrowest practical scope: every managed service in the VPC has an
IP in that range, plus the policy enforcement layer can validate at
packet routing time without DNS lookup.

**IMDS exception** (`169.254.169.254/32`) keeps pods from reaching
the EC2 metadata service. This is **IRSA-friendly** — IRSA uses
`STS:AssumeRoleWithWebIdentity` over the public AWS HTTPS endpoint,
not IMDS. Operators on EKS Pod Identity (which DOES use IMDS
internally) flip `networkPolicy.blockImdsEgress = false`.

**Targets only `component=app` pods** via selectorLabels. The
worker Deployment, migration Job, and PgBouncer sidecar are
unaffected by this policy. Worker policy is a follow-up; its
network surface is similar (DB + Redis + Secrets Manager) so the
same NetworkPolicy could be reused with a different `component:`
selector.

**Ingress allowed only from the configured controller's namespace**
(default `ingress-nginx`). Operators using a service mesh or a
different controller override `networkPolicy.ingressFrom`.

### Ingress

Controller-agnostic at the chart level. Defaults are NGINX-Ingress
flavored (the most common cross-cloud); ALB Ingress Controller
operators override `ingress.className` and `ingress.annotations`
wholesale.

**TLS termination**: required by default (`ingress.tls.enabled =
true`). The TLS Secret is **operator-managed** — chart references it
by name. cert-manager and pre-existing Secrets both work; the chart
doesn't try to manage certificate provisioning.

**Force SSL redirect** (HTTP → HTTPS) via
`nginx.ingress.kubernetes.io/{ssl-redirect,force-ssl-redirect}`,
gated on `ingress.forceSslRedirect = true`.

**Rate limiting** via `nginx.ingress.kubernetes.io/limit-rpm`
(requests per minute per source IP), default 600 RPM, configurable
burst multiplier. ALB operators rely on AWS WAF web ACLs instead
(annotation `alb.ingress.kubernetes.io/wafv2-acl-arn`); the chart's
generic `ingress.annotations` value is the override seam.

**HSTS** via the nginx-ingress `configuration-snippet` annotation:

```nginx
more_set_headers "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload";
```

Important detail: the template uses `{{ .Values.ingress.hsts.maxAgeSeconds | int }}` —
the explicit `int` cast is **load-bearing**. Helm's
YAML→`interface{}`→template round-trip otherwise renders large
integers in scientific notation (`31536000` → `3.1536e+07`),
which most browsers reject as an invalid `max-age`. Caught during
`helm template` validation; ratchet now locks the cast.

**Snippet-restricted controllers** (CVE-2021-25742 hardening, off
by default since ingress-nginx 1.9): operators set
`ingress.hsts.enabled = false` and configure HSTS at the controller
level instead. Chart documents this explicitly.

**`proxyBodySize: 100m`** matches the app's `FILE_MAX_SIZE_BYTES`
default — nginx-ingress otherwise rejects multipart uploads with
413 Request Entity Too Large.

### Per-env values strategy

Two committed files:

| File | Posture |
|---|---|
| `values-staging.yaml` | 1 replica, autoscaling **off**, smaller resources (250m/256Mi), NetworkPolicy **off** (easier debugging), Ingress on `staging.example.com`, HSTS preload **off** (staging hostname shouldn't pin to preload list), rate limit 300 rpm |
| `values-production.yaml` | Autoscaling **on** (2–10), larger resources (1/512Mi req, 2/1Gi lim), NetworkPolicy **on** with prod VPC CIDR, Ingress on `app.example.com`, HSTS preload **on**, rate limit 600 rpm, HPA behavior with scale-up-fast/scale-down-slow, AZ topology spread |

Both files include explicit `pgbouncer.config` blocks because the
upstream `POSTGRESQL_HOST` is env-specific (defaults empty in chart
values; per-env files supply the value — operator pulls from
`terraform output db_address` per Epic OI-1).

**HSTS preload** (`preload: true`) submits the domain to the
[hstspreload.org](https://hstspreload.org) list. Browsers will
refuse plain HTTP to that domain forever — removing the domain from
the list later is slow. Staging deliberately disables preload so
hostname rotation doesn't lock real users out.

**`topologySpreadConstraints` in production**:
```yaml
- maxSkew: 1
  topologyKey: topology.kubernetes.io/zone
  whenUnsatisfiable: ScheduleAnyway
```
spreads app pods across AZs — losing one AZ doesn't take all replicas
down. Staging's `replicaCount: 1` makes spread irrelevant there.

### Lifecycle integration with prior OI-2 parts

```
helm install / upgrade
       │
       ├── pre-install/upgrade hook: migration Job
       │     (waits for completion before next steps)
       │
       ▼
Service           ──┐
Deployment (app)   ─┤   selectors: component=app    ──┐
                    │                                  │
HPA → scaleTargetRef┘   (when autoscaling.enabled)    │
                                                       ▼
NetworkPolicy   ──── targets: component=app pods    Ingress
(when enabled)        └── PgBouncer sidecar shares    │
                          the pod's egress allowance   ▼
Deployment (worker)   selectors: component=worker     ALB / NGINX
                      (NetworkPolicy doesn't apply)   (TLS termination,
                                                       HSTS, rate limit)
```

## Files

| File | Status |
|---|---|
| `infra/helm/inflect/values.yaml` | Updated — added `service:`, `networkPolicy:`, `ingress:` top-level sections with sensible defaults (Service on, NP/Ingress off in chart defaults) |
| `infra/helm/inflect/values-staging.yaml` | **New** — 1 replica, no HPA/NP, staging hostname |
| `infra/helm/inflect/values-production.yaml` | **New** — HPA 2→10, NP on, prod hostname + HSTS preload |
| `infra/helm/inflect/templates/service.yaml` | **New** — ClusterIP, component=app selector |
| `infra/helm/inflect/templates/networkpolicy.yaml` | **New** — least-privilege egress (DNS, VPC:5432/6379, HTTPS-with-IMDS-except) |
| `infra/helm/inflect/templates/ingress.yaml` | **New** — TLS, rate limit, HSTS via configuration-snippet with `int` cast |
| `tests/guards/helm-chart-foundation.test.ts` | Extended — 109 assertions (was 79); 4 Service + 8 NetworkPolicy + 8 Ingress + 5 per-env values + 5 file-presence |
| `docs/implementation-notes/2026-04-27-epic-oi-2-networking-and-envs.md` | **New** — this file |

## Decisions

- **Service is implicit but added explicitly.** OI-2 spec covered
  Ingress; an Ingress without a Service is non-functional. Adding
  the Service in this PR lets the chart be installed end-to-end
  without operator scaffolding.

- **Service selectors are component-aware.** Without
  `component=app`, the Service would also route to PgBouncer
  sidecar pods (which share the app pod) — but PgBouncer doesn't
  speak HTTP and would 502 every request. The component=app
  selector targets ALL pods labeled component=app (which means the
  app+pgbouncer pods together — pods, not containers — and the
  Service's `targetPort: http` picks the named port from the app
  container specifically). Net effect: requests reach the app
  container's port 3000, never the sidecar.

- **NetworkPolicy default `enabled: false`.** Most non-prod
  clusters don't have a NetworkPolicy controller (kindnet, calico,
  cilium). Enabling it without a controller is silent (rules just
  aren't enforced) — but flipping `enabled: true` in a controller-
  less cluster ends up creating dead resources. Default off in
  chart values, on in production values.

- **CIDR-scoped egress, not pod-selector.** Managed services (RDS,
  ElastiCache) live OUTSIDE the cluster, so pod-selector egress
  rules don't apply. CIDR scoping to the VPC is the narrowest
  workable boundary. Operators with VPC interface endpoints (so S3
  also routes via the VPC) get even tighter egress control.

- **IMDS deliberately excluded from HTTPS egress.** IRSA is the
  modern AWS workload identity primitive — uses public STS
  endpoints, NOT IMDS. Excepting IMDS narrows blast radius if a
  pod is compromised. EKS Pod Identity flips `blockImdsEgress=false`
  via values; documented in values.yaml comment.

- **Ingress controller stays operator-supplied.** Defaults are
  NGINX-Ingress because it's the most common cross-cloud choice
  and the spec listed it first. ALB Ingress Controller users
  override `ingress.className` and `ingress.annotations` —
  controller-agnostic seam, no template branching.

- **HSTS via configuration-snippet, not via controller-level
  config.** Chart-level annotation lets Helm-managed deployments
  configure HSTS without controller-level coordination. The
  snippet-restricted controller path (CVE-2021-25742-disabled)
  is documented as a fallback; the chart doesn't try to detect or
  work around it automatically.

- **HSTS `int` cast is intentional and locked.** Caught during
  validation: Helm rendered `31536000` as `3.1536e+07` because
  the YAML→Go-template path goes through `float64`. The fix
  (`| int` filter) is a one-character change but the regression
  class is severe (silent HSTS misconfiguration). Ratchet asserts
  the cast.

- **Per-env files override values, never templates.** Spec was
  explicit: "Do not hardcode staging/production values inside
  templates; use environment values files." All env-specific
  knobs live in values; templates remain env-agnostic.

- **Staging NetworkPolicy off, production on.** Staging
  debugging is significantly easier without packet-drop
  surprises. Production deserves the locked-down default. The
  values toggle preserves the chart's principle that env-specific
  posture lives in values.

- **HSTS preload off for staging, on for production.** Preload
  list submission is irreversible in a practical timeframe;
  staging hostnames may rotate. Production hostname stays put,
  preload is appropriate.

- **`topologySpreadConstraints` in production-only values.**
  Spread is meaningless with replicaCount=1 (staging). Production
  with HPA min=2 can actually utilize AZ spread. Constraint uses
  `whenUnsatisfiable: ScheduleAnyway` so a single-AZ cluster
  doesn't refuse to schedule (degrades gracefully).

## Verification performed

- **`helm lint`**: `1 chart(s) linted, 0 chart(s) failed`.

- **`helm template`** rendered three states:

  **Default** (chart values, no -f): 5 documents — Service,
  Deployment (app), Deployment (worker), HPA, migration Job. No
  Ingress (gated off in chart values), no NetworkPolicy (gated
  off).

  **Staging** (`-f values-staging.yaml`): 5 documents — Service,
  Deployment (app, replicas:1), Deployment (worker, replicas:1),
  Ingress, migration Job. **No HPA** (autoscaling disabled), **no
  NetworkPolicy** (disabled in staging).

  **Production** (`-f values-production.yaml`): **7 documents** —
  NetworkPolicy, Service, Deployment (app, no spec.replicas), HPA
  (min 2, max 10, behavior set), Deployment (worker, replicas:2),
  Ingress, migration Job.

- **NetworkPolicy egress inspection** (production render):
  ```
  - ns:{kube-system, k8s-app:kube-dns} → UDP:53, TCP:53
  - ipBlock:10.0.0.0/16 → TCP:5432, TCP:6379
  - ipBlock:0.0.0.0/0 except 169.254.169.254/32 → TCP:443
  ```
  Matches OI-2 spec exactly.

- **Ingress annotation inspection** (production render):
  ```
  rate-limit-rpm: 600
  force-ssl-redirect: true
  HSTS: more_set_headers "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload";
  TLS: [{ hosts: [app.example.com], secretName: app-example-com-tls }]
  ```

- **YAML round-trip via `js-yaml`**: all three render states parse
  cleanly, no duplicate keys.

- **Structural ratchet**: `tests/guards/helm-chart-foundation.test.ts`
  — **109/109 green** (was 79). Lock highlights:
  - Service exists with `kind: Service`, ClusterIP default,
    selector targets component=app
  - NetworkPolicy gated on `enabled`, declares both Ingress + Egress
    policy types, DNS rule references kube-dns, VPC CIDR + DB +
    Redis ports as variables, HTTPS rule with IMDS except gated
    on `blockImdsEgress`
  - Ingress gated on `enabled`, TLS section emits `secretName`,
    rate-limit annotations gated, HSTS uses `| int` cast (locked
    to prevent the scientific-notation regression), force-ssl-redirect
    gated, default values match OI-2 spec
  - values-staging: replicaCount=1, autoscaling off, NetworkPolicy
    off, HSTS preload off
  - values-production: autoscaling on (2-10), NetworkPolicy on,
    HPA behavior set, worker replicaCount=2, HSTS preload on,
    topologySpreadConstraints across AZs
  - staging and production point at DIFFERENT ingress hostnames
