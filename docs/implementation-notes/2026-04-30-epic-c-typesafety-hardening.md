# 2026-04-30 — Epic C: Type-Safety Hardening

**Commit:** _(pending)_

Closes the highest-risk type-safety holes left after Epic A's auth
migration. The starting point was 274 `as any` casts in `src/`; this
PR removes 99 of them, locks in the new ceiling with a count ratchet,
and turns explicit `any` into a hard ESLint error in the highest-risk
directories. Long-tail cleanup is now ratchet-driven.

## Scope reality check

The original epic mandate assumed the prompt-designated security-
critical files (`src/auth.ts`, `src/middleware.ts`, `src/lib/db-context.ts`,
`src/app-layer/context.ts`) were the heavy lift. Discovery showed they
were already at **zero** — Epic A's auth migration cleared them.
The actual security-critical work was 2 casts in `src/lib/security/csp-violations.ts`.

The real volume turned out to be data-path:

  • ~50 mechanical `(prisma|db) as any` casts that were stale "the
    Prisma client doesn't yet have this model" workarounds. The
    models all exist in the generated client today; the casts were
    just historical debt.
  • ~75 raw-SQL row recasts (`(rows as any[]).map(...)`) where
    `runInTenantContext<T>` already infers the right type but
    callers had defensively re-cast.
  • ~10 error-augmentation casts (`(error as any).code = 'X'`).
  • ~15 enum-string boundary casts in repository signatures
    (`status: filters.status as any`) — these need caller cooperation
    and are deferred.
  • Genuine edge cases: Prisma `Json` columns, dynamic delegate
    indexing for soft-delete operations, third-party UI typing
    quirks. These remain as documented exceptions.

## Replacement strategies used

| Pattern | Used for | Replacement |
|---|---|---|
| `(prisma\|db) as any).<model>.<method>` | 50+ stale workarounds | Drop the cast — model accessor is typed via `PrismaClient` |
| `runInTenantContext(...) as any[]` | 70+ raw-SQL row recasts | Drop the cast — generic `<T>` infers the row shape |
| `(error as any).code = 'X'` | 4 entitlement-error mutations | New `EntitlementError` class with typed `{code, status, requiredPlan, feature}` properties |
| `(globalThis as any).EdgeRuntime` | 1 Next.js runtime probe | Ambient `declare global { var EdgeRuntime: ... }` in `src/types/globals.d.ts` |
| `(body as any)['csp-report']` | 2 untyped browser CSP report parsing | `body['csp-report']` direct access (`body` was already `Record<string, unknown>`); `as Record<string, unknown>` per-element narrowing |
| `(prisma as any).auditEvent.create(...)` | 1 hidden bug | The cast was masking that `auditEvent` doesn't exist; rewired to `appendAuditEntry` (canonical hash-chained writer) |

## Files changed

| File | Role |
|---|---|
| `src/types/globals.d.ts` | NEW. Ambient `EdgeRuntime: string \| undefined` declaration so the runtime probe in `src/lib/prisma.ts` doesn't need a `globalThis` cast. |
| `src/lib/security/csp-violations.ts` | Replaced both casts with `Record<string, unknown>` access — helpers already accepted `unknown`. |
| `src/lib/entitlements-server.ts` | NEW `EntitlementError` class with typed fields; replaced 4 `(error as any).X = ...` mutations and the `(prisma as any).billingAccount` / `billingEvent` casts. |
| `src/lib/prisma.ts` | `(globalThis as any).EdgeRuntime` → `EdgeRuntime` (ambient global). |
| `src/lib/stripe.ts`, `src/lib/billing/entitlements.ts` | `(prisma\|db) as any` removed; models exist in the generated client. |
| `src/app/api/storage/av-webhook/route.ts` | The `prisma.auditEvent` cast hid a real bug — that model doesn't exist. Quarantine events now route through `appendAuditEntry` (canonical hash-chained AuditLog). |
| `src/app/api/t/.../sync/route.ts`, `src/app/api/t/.../reports/pdf/generate/route.ts` | Stale prisma casts dropped. |
| `src/app-layer/notifications/{settings,enqueue,processOutbox,digest-dispatcher}.ts` | Stale db/prisma casts dropped. |
| `src/app-layer/jobs/retention-notifications.ts` | Stale prisma casts dropped (notificationOutbox + taskLink models). |
| `src/app-layer/integrations/{prisma-sync-store,prisma-local-store}.ts` | Stale db casts dropped. |
| `src/app-layer/usecases/{evidence-maintenance,evidence,file,issue}.ts` | Stale db casts dropped. |
| `src/app-layer/repositories/FileRepository.ts` | All 13 `(db as any).fileRecord` casts dropped — `PrismaTx` types the model accessor correctly. |
| `src/app-layer/usecases/audit-readiness-scoring.ts` | 14 raw-SQL row casts dropped; `runInTenantContext<T>` infers correctly. Two interfaces inlined for cross-block type sharing. |
| `src/app-layer/usecases/audit-readiness/packs.ts` | 11 row casts dropped; 2 retained on snapshot helpers with a documented TODO — tightening exposed pre-existing schema drift (`dueDate` vs `dueAt`, `ownerId` vs `ownerUserId`) that needs separate audit-pack regression coverage. |
| `src/app-layer/usecases/{audit-hardening,test-hardening,test-readiness,soa}.ts` | 15 row casts dropped via the same `runInTenantContext` pattern. |
| `.eslintrc.json` | New override block: `@typescript-eslint/no-explicit-any: error` for `src/lib/security/**` and `src/middleware.ts`. (`src/app-layer/**` stays at `warn` until the long tail clears — the count ratchet drives that down.) |
| `tests/guardrails/no-explicit-any-ratchet.test.ts` | NEW. Counts code-level `as any` occurrences in `src/`, fails if the count exceeds the locked baseline (175), AND fails if the actual count drops more than 5 below the baseline (forces ratchet-down on the same PR that removes casts). Includes a mutation regression sanity check. |

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint src/lib/security/**/*.ts src/middleware.ts` — clean
  (no errors). Sentinel test confirmed: dropping a synthetic
  `: any`/`as any` into `src/lib/security/` is rejected by ESLint
  with two `Unexpected any. Specify a different type` errors.
- `npx jest tests/guardrails/no-explicit-any-ratchet.test.ts` —
  3/3 pass. Slack sentinel correctly fired during development
  (forced me to lower the baseline from 181 to 175 when the actual
  count dropped further).

## Counts

| Metric | Before | After |
|---|---|---|
| Total `as any` in `src/` (raw grep, includes docstrings) | 274 | 181 |
| Code-level `as any` (excluding docstring mentions) | — | 175 |
| `src/auth.ts`, `src/middleware.ts`, `src/lib/db-context.ts`, `src/app-layer/context.ts` | 0 | 0 (preserved) |
| `src/lib/security/` | 2 | 0 |
| `src/lib/` (excl. `lib/security/`) | ~22 | ~14 |
| Top-6 heavy data-path files | 90 | 23 |

## Ratchet policy

The new baseline (175) is locked into
`tests/guardrails/no-explicit-any-ratchet.test.ts::CURRENT_BASELINE`.
The test fails on TWO conditions:

  1. Count > baseline → reviewer-actionable error showing the first
     25 hits, each with file:line and the offending text.
  2. Count < baseline − 5 → forces the lowering of `CURRENT_BASELINE`
     in the same PR that did the cleanup. Prevents silent slack
     accumulation that a future regression could consume.

The baseline only moves DOWN. Each adjustment carries a one-line
History entry above the constant explaining what was retired.

## Long-tail follow-ups

The remaining 175 casts cluster into three categories:

  1. **Repository enum-string boundaries** (~30 casts in
     `WorkItemRepository`, `VendorRepository`,
     `vendor-assessment-lifecycle-adapter`). Fixing requires
     tightening function signatures from `string` to the Prisma
     enum types AND updating ~5 caller files per repo. Cleanest
     in a focused follow-up PR per repository.

  2. **Prisma `Json` column writes** (~20 casts in lifecycle
     adapters and history-payload writers). The cast at the
     persistence boundary is documented and arguably correct —
     Prisma's generated `JsonValue` type is intentionally permissive.
     A `JsonObject` helper or a per-payload Zod schema would let
     these go to zero with more typing precision.

  3. **Dynamic delegate indexing** (~6 casts in `data-lifecycle.ts`,
     `export-service.ts`, `soft-delete-operations.ts`). These iterate
     over Prisma model names at runtime; the value type genuinely
     depends on the runtime key. A `Record<string, ...>` helper that
     types the union would let these go to zero.

The ratchet test will progressively force these down as future PRs
land cleanup work.
