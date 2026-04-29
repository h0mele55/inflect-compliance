# 2026-04-29 — GAP-22 finalisation

**Commit:** _(pending)_

GAP-22 was framed as "implement the `rotateTenantDek` stub", but the
real engine, BullMQ job, admin route, and three correctness tests
were already merged 2026-04-27 (Epic F.2 follow-up — see
`docs/implementation-notes/2026-04-27-implement-rotate-tenant-dek.md`).
This change closes the remaining gaps that the GAP-22 success
criteria expose.

## What was missing

| Criterion | Pre-GAP-22 state | Why it mattered |
|---|---|---|
| **Live progress tracking** | `runJob` wraps the executor; the BullMQ Job's `updateProgress` channel was never called. The GET status endpoint returned `progress: 0` until the job completed. | Operators polling during a long sweep saw a binary "running / done" status instead of "field 4 of 12, 1240 / 3500 rewritten". |
| **End-to-end lifecycle proof** | 3 integration tests covered atomic-swap, double-rotation rejection, and the CHECK constraint. None asserted that pre-rotation v2 ciphertexts stay readable via the dual-DEK fallback after the swap, or that all rows decrypt under the new DEK alone after the sweep. | The dual-DEK fallback is the load-bearing safety property of the whole rotation design — it had no end-to-end test. |
| **GAP-22 short URL** | Canonical route at `/api/t/:tenantSlug/admin/tenant-dek-rotation`. The GAP-22 spec asked for `/admin/rotate-dek`. | The repo's admin namespace consistently uses resource-noun naming (`/admin/key-rotation`, `/admin/tenant-dek-rotation`, `/admin/sso`). Adding the GAP-22 URL as an alias rather than a rename keeps existing operator scripts working. |

## Files changed

| File | Role |
|---|---|
| `src/app-layer/jobs/executor-registry.ts` | Adds optional `JobExecutorContext` (currently `{ updateProgress? }`) so worker-injected hooks reach executors without coupling them to BullMQ types. Backward-compatible — every existing executor signature still works. |
| `src/app-layer/jobs/tenant-dek-rotation.ts` | Adds `TenantDekRotationProgress` JSON shape, threads `onProgress` through `runTenantDekRotation` → `sweepV2Field`, fires updates at `starting` / `sweeping` (per-batch, per-field) / `finalising` / `complete` / `noop` phases. Progress is best-effort: a Redis blip never aborts a sweep. |
| `scripts/worker.ts` | Forwards the BullMQ Job's `updateProgress` to the registry as `(p) => job.updateProgress(p)`. |
| `src/app/api/t/[tenantSlug]/admin/rotate-dek/route.ts` | Alias route — single-line `export { POST, GET }` from the canonical handler. Documented in the file header. |
| `src/lib/security/route-permissions.ts` | Adds the alias-path entry to the route permission matcher with `admin.tenant_lifecycle`. The matcher is path-string based, so the alias needs its own entry even though it shares a handler. |
| `tests/integration/tenant-dek-rotation.test.ts` | Adds the lifecycle test. Seeds Risk.threat v2 ciphertexts under the initial DEK, calls `rotateTenantDek` (sync swap), verifies rows still readable via `decryptWithKeyOrPrevious`, runs `runTenantDekRotation` directly with a progress callback, verifies all rows decrypt under the new DEK alone post-sweep, verifies `previousEncryptedDek` cleared, verifies a fresh write uses the new DEK. Also enriches `afterAll` cleanup to handle the FK chain (AuditLog + Risk → Tenant). |

## Decisions

- **`JobExecutorContext` as the contract extension point.** The
  alternative — passing the BullMQ `Job` directly — would couple
  every executor to `bullmq` types just to use `updateProgress`. The
  context wrapper keeps the executor pure (`(payload, ctx?) =>
  Promise<JobRunResult>`) and lets future entrypoints (Vercel Cron,
  CLI, tests) inject their own progress sinks (or none).

- **Progress updates are best-effort.** A `try { await onProgress(p) }
  catch {}` wrapper at every emission site. A Redis blip during a
  multi-minute sweep is exactly the kind of transient that must NOT
  abort the rotation. The trade-off: an admin polling the GET
  endpoint may see stale progress for a few seconds. Acceptable —
  the audit log + final result are the durable signals.

- **Progress payload shape is stable, secret-free.** No DEK material,
  no row IDs, no plaintext — just phase + counts + the current
  (model, field) being swept. Surfaced via the existing GET status
  route exactly as-is, no transformation.

- **Two URLs, one handler.** Re-exporting the canonical `POST` /
  `GET` from the alias path keeps the implementation in lockstep
  across the two URLs. If a future PR consolidates to one URL, this
  file is the single deletion point.

- **Lifecycle test bypasses the BullMQ worker.** The runner is
  invoked directly via `runTenantDekRotation` because the test is
  asserting the engine's correctness, not the worker's wiring (the
  worker's responsibilities — receiving a job, calling the
  executor, surfacing progress — are exercised by other tests that
  use a real BullMQ harness, and by manual smoke checks). The
  `onProgress` callback in the test asserts that progress events
  fire in the expected phase order without needing Redis.

- **Test seeds via `encryptWithKey` rather than the runtime
  middleware.** The encryption middleware writes `v2:` only when an
  audit context with a tenantId is bound to the request. In a
  bare integration test, that context isn't set up — and faking it
  would obscure what we're testing. Direct ciphertext construction
  is precisely the state we want before rotation.
