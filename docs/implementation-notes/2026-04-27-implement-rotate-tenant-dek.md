# 2026-04-27 — Implement `rotateTenantDek`

**Commit:** _(pending)_

Replaces the Epic F.2 stub at
`src/lib/security/tenant-key-manager.ts::rotateTenantDek`. The stub
threw with a runbook-carrying error pointing at the master-KEK
rotation workaround. This change makes per-tenant DEK rotation a
first-class admin operation, gated by `admin.tenant_lifecycle`
(OWNER-only) per CLAUDE.md's role model.

Operator surface: `POST /api/t/:slug/admin/tenant-dek-rotation`.
Returns 202 + a BullMQ job id for the re-encrypt sweep.

## Design

```
                          ┌───────────────────────────────┐
   POST /tenant-dek-      │  rotateTenantDek (sync)       │
   rotation               │                               │
   ────────────────▶      │  1. read Tenant row           │
   admin.tenant_lifecycle │  2. generate + wrap new DEK   │
   202 + jobId            │  3. atomic UPDATE             │
                          │     SET encryptedDek=new      │
                          │         previousEncryptedDek=old │
                          │     WHERE previousEncryptedDek IS NULL │
                          │  4. cache discipline          │
                          │     - drop primary cache      │
                          │     - prime previous cache    │
                          │     - drop negative cache     │
                          │  5. enqueue sweep             │
                          └───────────────┬───────────────┘
                                          │ BullMQ
                                          ▼
                          ┌───────────────────────────────┐
                          │ tenant-dek-rotation (async)   │
                          │                               │
                          │  for each (model, field) in   │
                          │      ENCRYPTED_FIELDS with    │
                          │      tenantId column:         │
                          │    cursor over rows v2:%      │
                          │    decrypt(previousDek)       │
                          │    encrypt(newDek)            │
                          │    UPDATE one row             │
                          │                               │
                          │  on totalErrors === 0:        │
                          │    UPDATE Tenant SET          │
                          │      previousEncryptedDek=NULL│
                          │    clearTenantPreviousDekCache│
                          └───────────────────────────────┘

   Mid-rotation reads (encryption-middleware on every operation):

       resolveTenantDekPair(model)
           ⇣
       { primary: Buffer, previous: Buffer | null }
           ⇣
       v2 ciphertext encountered
           ⇣
       decryptWithKeyOrPrevious(primary, previous, ct)
           ├─ try decryptWithKey(primary, ct)   ← steady state
           └─ on AES-GCM auth failure, retry
              decryptWithKey(previous, ct)       ← mid-rotation
```

The mid-rotation read story is the load-bearing piece. Without the
fallback, every v2 row written before the rotation becomes
unreadable until the sweep job rewrites it — unacceptable for a
security operation that's already a stress event for the operator.

`decryptWithKeyOrPrevious` mirrors the existing v1 dual-KEK pattern
(`decryptField` falls back to `DATA_ENCRYPTION_KEY_PREVIOUS` on auth
failure) at per-tenant DEK granularity. Same invariants:
- always re-throw the PRIMARY error on dual-failure (the operator's
  mental model is "my current key doesn't fit", not "my old key
  didn't either").
- `previous: null` short-circuits past the fallback so steady-state
  reads pay zero extra cost.

## Files

| File | Role |
|---|---|
| `src/lib/security/encryption.ts` | New `decryptWithKeyOrPrevious(primary, previous, ct)` helper. |
| `src/lib/security/tenant-key-manager.ts` | New `getTenantPreviousDek` + `clearTenantPreviousDekCache`; new `rotateTenantDek(options)` real implementation; previous-DEK cache + 30 s negative TTL cache. |
| `src/lib/db/encryption-middleware.ts` | `resolveTenantDek` → `resolveTenantDekPair` (returns primary + previous). v2 reads now use `decryptWithKeyOrPrevious`. `walkReadResult` accepts `TenantDekPair \| null`. |
| `src/app-layer/jobs/tenant-dek-rotation.ts` | New BullMQ job — cursor-paginated sweep that decrypts under previous DEK, re-encrypts under new DEK, clears `Tenant.previousEncryptedDek` on a clean run. |
| `src/app-layer/jobs/types.ts` | New `TenantDekRotationPayload` + JOB_DEFAULTS entry. |
| `src/app-layer/jobs/executor-registry.ts` | Register the new executor. |
| `src/app/api/t/[tenantSlug]/admin/tenant-dek-rotation/route.ts` | New POST + GET endpoint. POST gated by `admin.tenant_lifecycle`, rate-limited to `API_KEY_CREATE_LIMIT` (5/hr). |
| `src/lib/security/route-permissions.ts` | New rule for the route. Existing `key-rotation` rule note clarified ("master-KEK", not per-tenant). |
| `tests/integration/tenant-dek-rotation.test.ts` | Renamed from `…-stub.test.ts`. Real-impl happy path + double-rotation refusal + the original CHECK-constraint assertion preserved. |
| `tests/unit/tenant-key-manager.rotate.test.ts` | New — 24 unit assertions on the rotation control flow + previous-DEK cache + clear helpers. |
| `tests/unit/encryption-dual-tenant-dek.test.ts` | New — 7 unit assertions on `decryptWithKeyOrPrevious`. |
| `tests/unit/encryption-middleware.tenant-dek.test.ts` | Updated for the pair shape; +3 assertions for the mid-rotation fallback. |
| `tests/unit/encryption-middleware.test.ts` | Updated to pass `NO_DEKS` instead of bare `null`. |
| `tests/unit/encryption-middleware.perf.test.ts` | Same shape update. |
| `tests/guardrails/tenant-dek-rotation-fallback.test.ts` | New ratchet — 7 assertions. Locks `decryptWithKeyOrPrevious` export, `getTenantPreviousDek` export, middleware import + invocation, the rotation real-impl shape, and the OWNER-only permission key. |
| `CLAUDE.md` | Field-Encryption section updated to describe the real implementation. Epic F.2 paragraph annotated as superseded with a pointer to this note. |
| `docs/epic-f-finishing-touches.md` | Banner at the top noting F.2 has been superseded; companion-tests cell updated. |

## Decisions

- **Cache shape: independent primary + previous + negative caches.**
  The primary cache is unchanged (Epic B.2 design). Adding a
  previous-DEK cache shaped the same way means the LRU eviction +
  refresh-on-hit semantics carry over. The negative cache (30 s TTL)
  exists specifically because the encryption middleware queries the
  previous DEK on EVERY operation, and the steady-state answer is
  null — without negative-caching we'd double DB load on every read.
  30 s is a deliberate tradeoff: a sibling-process rotation (worker
  rotates while web tier serves reads) takes up to 30 s to be
  visible; during that window v2 reads of stale rows fail in this
  process. Acceptable because (a) rotations are rare and (b) the
  failed reads recover automatically once the cache expires.

- **Lazy fallback was rejected in favour of eager pair resolution.**
  Lazy fallback (only resolve the previous DEK on AES-GCM auth
  failure inside the traversal) was the first design — it has zero
  steady-state cost. But it requires turning the synchronous
  decrypt traversal in the middleware into an async traversal,
  which is a larger refactor. Eager resolution + a negative TTL
  cache gets the same steady-state cost (cache hit short-circuits
  to null) without that surgery.

- **Concurrent-rotation rejection over silent collapse.**
  Two rotation attempts racing have one winner via the
  `WHERE previousEncryptedDek IS NULL` predicate on the swap
  UPDATE. The losing caller sees `count = 0` and throws a clear
  "concurrent rotation detected; retry once the in-flight sweep
  completes" error, instead of silently no-op'ing. Operators
  responding to a compromise deserve to know if they ran a second
  rotation by mistake — the silent path is the worse user
  experience even if the outcome is the same.

- **Sweep job uses cursor pagination on `id`.**
  Rewritten rows are still `v2:%` (just under a different DEK), so
  a no-cursor SELECT would re-fetch the same first batch
  indefinitely. Per-row `id > $cursor` advances unconditionally on
  every row processed (rewritten OR skipped), guaranteeing forward
  progress. The existing `key-rotation.ts` (master-KEK) does NOT
  have this fix — it works because individual tenants typically
  have ≤ batchSize (500) v1 rows. Worth a follow-up to align.

- **Sweep job decrypts strictly under the previous DEK, not the
  dual-key helper.** A row that primary-decrypts on the sweep path
  has already been rewritten (by us in a prior crash-recovery run,
  or by a read-modify-write through the middleware). Counting it
  as "skipped" is correct — re-encrypting under primary would just
  waste bytes. Using the dual-key helper here would obscure the
  invariant.

- **Half-rotation surfaces a clear error.** If the swap succeeds
  but `enqueue('tenant-dek-rotation', ...)` fails, the function
  throws a self-contained error explaining the state ("DEK was
  swapped but the re-encrypt job could not be enqueued. Reads
  still work via the previous-DEK fallback. Manually re-enqueue
  ..."). The previous-DEK fallback in the middleware keeps reads
  correct; the operator follows the inline runbook to recover.

- **`admin.tenant_lifecycle` over `admin.manage`.** CLAUDE.md's
  role model explicitly lists "rotate DEK" under
  `admin.tenant_lifecycle` (OWNER-only). The existing master-KEK
  `key-rotation` route under `admin.manage` is a fleet-operator
  surface — different blast radius (re-wrap, not rotate). The
  distinction is locked in by the new guardrail.
