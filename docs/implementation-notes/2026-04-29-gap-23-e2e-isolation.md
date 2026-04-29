# 2026-04-29 — GAP-23: E2E test-data isolation

**Commit:** _(pending)_

GAP-23 closes the long-standing E2E coupling on the seeded
`acme-corp` tenant. Prior state: every Playwright spec logged in as
`admin@acme.com` against the seed and asserted on shared rows.
Symptoms — flaky tests when seed shape drifted, no path to
parallelisation (`fullyParallel: false`, `workers: 1`), and no
cleanup signal at end-of-suite.

## Design

```
   spec describe block
        │
        ▼  beforeAll
   ┌──────────────────────┐    POST   ┌─────────────────────┐
   │ createIsolatedTenant │ ───────▶  │ /api/auth/register  │
   └──────────┬───────────┘           └──────┬──────────────┘
              │                              │
              │ append { tenantId, slug,     │ creates Tenant + DEK +
              │   ownerUserId, createdAt }   │ Owner User (passwordHash) +
              │                              │ OWNER membership +
              ▼                              │ verification token
     .tenant-tracker.jsonl                   ▼
     (one line per call;                ┌──────────┐
      gitignored)                       │ response │
                                        └────┬─────┘
                                             │
                                             ▼
                              { tenantSlug, tenantId, tenantName,
                                ownerEmail, ownerPassword,
                                ownerUserId, ownerName }

   end of suite (Playwright globalTeardown)
                                             │
                                             ▼
                              ┌──────────────────────────┐
                              │ tests/e2e/global-        │  reads tracker file,
                              │ teardown.ts              │  per-tenant DELETE
                              │                          │  (with AuditLog
                              │                          │  immutability bypass)
                              └──────────────────────────┘
```

## Files

| File | Role |
|---|---|
| `tests/e2e/e2e-utils.ts` | Adds `createIsolatedTenant()`, `signInAs()`, `IsolatedTenantCredentials`, `TenantTrackerEntry`. Tracker append is best-effort (warns + continues on filesystem error so a write blip never fails a test). |
| `src/app/api/auth/register/route.ts` | Adds `slug` to the response body so the factory can navigate without a follow-up DB query. Backward-compatible additive change. |
| `tests/e2e/global-teardown.ts` | NEW. Reads `.tenant-tracker.jsonl`, hard-deletes each tenant + its tenant-scoped child rows + the OWNER user. Uses `SET LOCAL session_replication_role = 'replica'` to bypass the AuditLog immutability trigger and the FK-cascade chain. Idempotent: missing tracker file is a no-op; per-tenant errors are logged but don't abort the loop; the tracker file is preserved if any tenant deletion failed so the next run retries. |
| `playwright.config.ts` | Wires `globalTeardown: './tests/e2e/global-teardown.ts'`. |
| `.gitignore` | Adds `tests/e2e/.tenant-tracker.jsonl` (per-run artefact). |
| `tests/e2e/e2e-utils-isolation.spec.ts` | NEW. Self-test for the factory: shape, distinctness, end-to-end credentials sign-in, ephemeral-context path. Doubles as the canonical adoption example. |
| `tests/e2e/theme-toggle.spec.ts` | Migrated to per-describe tenant. |
| `tests/e2e/responsive.spec.ts` | Migrated — both viewport scopes get their own tenant. |
| `tests/e2e/onboarding.spec.ts` | Partially migrated — admin tests use the factory; one negative test still uses the seeded `viewer@acme.com` until the factory gets a multi-role provisioner. |
| `docs/e2e-spec-migration-tracker.md` | NEW. Per-spec state table + the specific blocker that gates each `🔒 deferred` entry. |

## Decisions

- **API-driven provisioning, not direct Prisma writes.** Two reasons.
  First, the register route exercises the same code path real users
  hit (PII middleware, audit log, tenant DEK creation) — a regression
  in any of those would catch us at test setup, not in production.
  Second, it keeps the test code free of schema knowledge: a future
  schema change updates the route, not 35 fixtures.

- **Tracker file (filesystem JSONL), not in-memory list.** Playwright
  workers run as separate processes; an in-memory list would only
  see the current worker's state, and the teardown is yet another
  process. A file is the cheapest cross-process queue. Append-only
  writes are atomic for the small payload we emit, no locking
  required.

- **`tracker.jsonl` lives in `tests/e2e/` (not `/tmp`)**, so a CI
  run can archive it as a post-mortem artefact alongside Playwright
  reports if cleanup misbehaves. Gitignored; per-run.

- **Cleanup with `session_replication_role = 'replica'`.** Mirrors
  the pattern in `tests/integration/audit-immutability.test.ts` and
  the GAP-22 lifecycle test added 2026-04-29. The trigger that
  forbids `DELETE FROM AuditLog` would otherwise block tenant
  removal even with PolicyExpand cascades.

- **Hand-maintained tenant-child table list in `global-teardown.ts`.**
  Considered: dynamic enumeration via `information_schema`. Rejected
  because the schema graph is finite and known; the static list is
  easier to read + audit. Tables not in the list become orphan rows
  on the test DB, which is acceptable — orphan rows never collide
  with a future test (each iso tenant gets a fresh id). Add a
  table when a new spec writes to it and you want truly clean
  teardown.

- **Migration scope is intentionally bounded.** 35 specs total; this
  PR migrates 3 (theme-toggle, responsive, onboarding) plus the
  factory self-test. The remaining 32 are catalogued in the
  migration tracker with the specific blocker per spec. The two
  load-bearing helpers needed to unblock most of them
  (`installFrameworks` option + `addTenantUser` companion) are
  follow-up PRs. Doing all 35 in one PR is high blast-radius and
  the prompt explicitly blesses an incremental migration with
  documented hybrid state.

- **Auth-flow specs (`auth.spec.ts`, `credentials-hardening.spec.ts`)
  stay on the seeded user by design.** They test the credentials
  provider's behaviour, not generic feature use; running them
  against a fresh-each-time tenant would defeat the purpose
  (account-locking under brute force, etc. require a stable target).
