# 2026-04-27 — Epic OI-2: BullMQ worker + Prisma migration Job

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Builds on `2026-04-27-epic-oi-2-helm-chart-foundation.md`. Adds the
two non-app workloads to the chart:

1. `templates/worker.yaml` — BullMQ worker Deployment (separate from
   the web tier; manual scaling, no HPA per the OI-2 spec).
2. `templates/migration-job.yaml` — Prisma migrations as a Helm
   pre-install/pre-upgrade hook so schema is up-to-date before the
   new app image starts serving.

## Design

### Worker Deployment

Same image as the app, different command. The worker process lives
at `scripts/worker.ts` and runs under the Node 22 `--import tsx`
loader (so the TypeScript source ships unbuilt — same model the
existing local dev + worker use):

```yaml
worker:
  command:
    - node
    - --import
    - tsx
    - scripts/worker.ts
```

**Distinct selectors.** The worker's `spec.selector.matchLabels`
includes `app.kubernetes.io/component: worker`; the app's includes
`component: app`. Without this distinction, two Deployments with
overlapping selectors would fight over the same ReplicaSet pods.
Implemented via the dict form of the `inflect.labels` helper:

```
{{ include "inflect.labels" (dict "ctx" . "component" "worker") }}
```

The structural ratchet asserts both Deployments use the dict form,
so a future "simplification" can't collapse back to bare context.

**No probes by default.** BullMQ workers don't expose HTTP, so a
liveness probe needs an in-process /healthz server first. Probes
are gated on `worker.livenessProbe.enabled` / `worker.readinessProbe.enabled`,
both `false` by default. Enabling them later is a values-only
change.

**Resource defaults**: `cpu: 500m / 1`, `memory: 256Mi / 512Mi` —
smaller than the app tier (workers do CPU-bound job processing,
less memory than the Next.js render path). Override per-env in the
upcoming `values-{staging,production}.yaml` files.

**Manual scaling**: `replicaCount: 1` default. No HPA wired (per
OI-2 spec). Operators scale via `--set worker.replicaCount=N`.

**`terminationGracePeriodSeconds: 60`** — gives in-flight BullMQ
jobs time to drain before SIGKILL. The worker's existing graceful
shutdown handler (per `scripts/worker.ts` "Graceful shutdown on
SIGTERM/SIGINT") catches SIGTERM and stops accepting new jobs;
60s is enough for most jobs to complete.

### Migration Job

Helm pre-install + pre-upgrade hook. Lifecycle:

```
helm install / upgrade
       │
       ▼
[hook] migration Job runs
       │
       ▼ (waits for Job.status.succeeded == 1)
       │
       ▼
       app + worker Deployments roll out
```

**On migration failure**: Helm aborts the install/upgrade. The app
Deployment is NOT rolled to the new image. The previous revision's
pods continue serving. Operator inspects the Job's pod logs (which
are kept because the delete-policy doesn't include `hook-failed`),
fixes the issue, re-runs.

**`backoffLimit: 0`**. A failed Prisma migration is an intentional
stop — half-applied migrations are usually NOT safely retryable
(schema-already-modified, lock-not-released, etc.). Auto-retry would
mask the real issue. Surfacing the failure to Helm + the operator at
the right boundary is the correct behaviour.

**Hook annotations**:
```yaml
"helm.sh/hook": pre-install,pre-upgrade
"helm.sh/hook-weight": "-5"
"helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
```

- `pre-install,pre-upgrade` — runs on both fresh installs and upgrades
- `hook-weight: -5` — runs early (lower weight first); leaves room for
  higher-priority hooks (e.g. namespace setup at -10) and lower-priority
  cleanup hooks (>0) without re-shuffling
- `before-hook-creation` — deletes any prior Job with the same name
  before recreating; lets re-running an upgrade work without "Job
  already exists" errors
- `hook-succeeded` — auto-deletes the Job after success (clean ns)
- **No `hook-failed` in delete-policy** — failed Jobs are PRESERVED
  so operators can read their logs

**Pinned Prisma CLI**: `npx --yes prisma@5.22.0 migrate deploy --schema=./prisma/schema.prisma`. Matches the version pin in
`scripts/entrypoint.sh`, which has a comment explaining the Prisma 7
incident in April 2026 (datasource property removal silently broke
prod boot). The structural ratchet locks the exact command array.

### App Deployment update

Added optional `command` + `args` overrides to `values.yaml`. The
default values explicitly run `node_modules/.bin/next start ...` —
bypassing the image's `./scripts/entrypoint.sh` ENTRYPOINT, which
embeds a `prisma migrate deploy` step. Without this override, every
app pod restart would re-run migrations against the live DB
(idempotent but wasteful and ordering-fragile — concurrent app
restarts could race the Helm-hook migration).

For non-Helm deployments (e.g. the existing SSH/VM stack), the
embedded migrate step in entrypoint.sh keeps working — those
deployments don't run Helm hooks. Two delivery models, one image.

## Files

| File | Status | Notes |
|---|---|---|
| `infra/helm/inflect/values.yaml` | Updated | Added `command`/`args` overrides for app; new top-level `worker:` section (replicas, image, command, resources, probes off-by-default, security context, scheduling); new top-level `migration:` section (image, command pinned to prisma@5.22.0, resources, hook config) |
| `infra/helm/inflect/templates/_helpers.tpl` | Updated | Refactored `inflect.labels` + `inflect.selectorLabels` to accept either context OR `(dict "ctx" "component")` form. Added `inflect.workerImage` and `inflect.migrationImage` helpers (both inherit from `.Values.image.*` when their overrides are empty). Removed duplicate `app.kubernetes.io/component` line from the labels block (now sourced via the included selectorLabels) |
| `infra/helm/inflect/templates/deployment.yaml` | Updated | Honors optional `command`/`args` from values; uses dict form for labels/selectorLabels with `component=app` |
| `infra/helm/inflect/templates/worker.yaml` | New | BullMQ worker Deployment — gated on `.Values.worker.enabled`, distinct `component=worker` labels/selectors |
| `infra/helm/inflect/templates/migration-job.yaml` | New | Prisma migrations as Helm pre-install/pre-upgrade hook with `backoffLimit=0`, `restartPolicy=Never`, `before-hook-creation,hook-succeeded` delete policy |
| `tests/guards/helm-chart-foundation.test.ts` | Extended | 60 assertions total (was 37): adds 9 worker assertions, 9 migration-job assertions, 4 helper-inheritance assertions, 2 app-deployment-update assertions, plus 1 file-presence per template |
| `docs/implementation-notes/2026-04-27-epic-oi-2-worker-and-migration.md` | New | This file |

## Decisions

- **Worker uses `node --import tsx scripts/worker.ts`, not a built
  artifact.** The repo's existing pattern keeps worker source as
  TypeScript and runs it via the tsx loader (per
  `scripts/worker.ts` docstring). A "build the worker" step would
  be a new pipeline; reusing the existing model means the chart
  ships a working worker on day one without Dockerfile changes.

- **App command override is explicit, not just args.** `command:`
  REPLACES the image's ENTRYPOINT (the migrate-then-start script);
  `args:` only replaces CMD. We need to bypass the embedded
  migrate step entirely, so `command:` is the right primitive.
  Operators can opt back in by setting `command: []` (empty array
  = use image default) — useful for local kind-cluster testing
  where the Helm hook isn't wired.

- **Distinct selectors for app vs worker, enforced by the dict-form
  helper.** Two Deployments with the same `name` + `instance`
  selector labels would conflict — both would try to own pods
  matching those labels. Adding `component` to the selector is
  the conventional fix; the dict form makes it ergonomic at every
  call site.

- **Helper refactor is backward-compatible.** Bare-context calls
  (`include "inflect.labels" .`) still work — the helper checks
  whether the input is a dict with `ctx`/`component` keys and falls
  back to bare context with `component=app` default. So the
  existing deployment.yaml call sites kept working through the
  refactor.

- **`backoffLimit: 0` over a small retry count.** Auto-retry of
  Prisma Migrate is genuinely dangerous when the failure is a lock
  contention (the migration may have partially applied) or a
  schema-already-modified error (idempotent retries are fine, but
  if the FIRST run was the one that broke an invariant, retries
  just compound). Operator-driven re-run is the safer default.

- **`hook-failed` deliberately NOT in the delete-policy.** Helm's
  `hook-failed` policy deletes the Job pod after a failure — which
  ALSO deletes its logs. Operators NEED the logs to debug.
  Surviving Job + pod after failure is one extra `kubectl delete
  job` for the operator but a much better debugging experience.

- **Migration runs as a Job, not an init container on the app pod.**
  Init containers would re-run the migrate logic on every app pod
  restart — multiplied by replicaCount, that's lots of wasted DB
  work plus race conditions when pods restart simultaneously. A
  single Job per Helm release runs migrations exactly once at the
  right moment.

- **Workers and migrations DON'T need component-specific
  ConfigMap/Secret.** All three (app, worker, migrate) read the
  same env vars (DATABASE_URL, REDIS_URL, DATA_ENCRYPTION_KEY,
  etc.). One ConfigMap + one Secret, mounted via envFrom on every
  workload. Simpler than per-component splits.

- **Migration job uses the workload `serviceAccountName`.** Same SA
  as the app + worker — gives migrations access to whatever
  External Secrets Operator already wired into the namespace.
  Could split to a `<fullname>-migrate` SA later if migrations
  ever need scoped permissions different from the app, but YAGNI
  for OI-2.

- **`terminationGracePeriodSeconds: 60` for the worker, not for the
  app.** App pods drain via the connection-handling layer (ALB
  drains connections in <30s typical); worker drain is
  job-completion-bound, which can be longer. The app's default
  `terminationGracePeriodSeconds: 30` (Kubernetes default) is fine.

## Verification performed

- **`helm lint`** (via `alpine/helm:3.14.0`):
  `1 chart(s) linted, 0 chart(s) failed` (single optional INFO
  about a missing icon).
- **`helm template my-release inflect`**: renders **3 documents** —
  `Deployment my-release-inflect (component=app)`,
  `Deployment my-release-inflect-worker (component=worker)`,
  `Job my-release-inflect-migrate (component=migration)`.
  All three pull the correct image (`ghcr.io/h0mele55/inflect-compliance:1.35.1`),
  share the same envFrom (configMap + secret), have distinct
  selectors. Migration Job carries the right hook annotations
  (`pre-install,pre-upgrade`, weight `-5`,
  `before-hook-creation,hook-succeeded`).
- **YAML round-trip via `js-yaml`** of rendered output: parses
  cleanly; no duplicate keys (post the labels-helper dedup fix).
- **Direct inspection of rendered YAML**:
  - Migration Job command: `npx --yes prisma@5.22.0 migrate deploy --schema=./prisma/schema.prisma` ✓
  - Worker command: `node --import tsx scripts/worker.ts` ✓
  - App selector: `{name: inflect, instance: my-release, component: app}` ✓
  - Worker selector: `{name: inflect, instance: my-release, component: worker}` (distinct) ✓
- **Structural ratchet**:
  `tests/guards/helm-chart-foundation.test.ts` — **60/60 green**.
  New coverage (vs the OI-2 part 1 baseline of 37):
  - 9 worker assertions (Deployment shape, gating, command, image
    helper, selectors, envFrom, default values, resources)
  - 9 migration-job assertions (Job shape, hook annotations,
    delete policy, command pinned to 5.22.0, backoffLimit=0,
    image helper, envFrom, restartPolicy=Never)
  - 4 helper-inheritance assertions (workerImage + migrationImage
    fallback to `.Values.image.*`)
  - 2 app-deployment-update assertions (command/args override
    honored, dict-form labels)
  - 2 file-presence assertions (worker.yaml + migration-job.yaml)
  - 3 net new file assertions on the canonical-files list
