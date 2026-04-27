# Epic F — Finishing Touches (operator + contributor index)

> Four low-severity remediations that close the long tail left after
> Epic E. Read the source links below for details; come back here for
> the architecture summary, verification commands, and rollback
> procedures.
>
> **F.2 status note (2026-04-27).** The reservation has been replaced
> by a real implementation. `rotateTenantDek` no longer throws — it
> performs the atomic DEK swap and enqueues a `tenant-dek-rotation`
> sweep. The schema artefacts (column, CHECK, partial index) and the
> "schema ships with the migration" rationale below are still
> accurate; only the function body and the integration test changed.
> See `docs/implementation-notes/2026-04-27-implement-rotate-tenant-dek.md`
> for the implementation design + the dual-DEK middleware fallback.

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  F.1 — key-rotation admin API test fixed                              │
│        tests/unit/key-rotation-admin-api.test.ts                      │
│          jest.mock('@/app-layer/context', ...)                        │
│          getTenantCtxMock.mockResolvedValueOnce(...)  per test case   │
│        Already shipped pre-F — 8/8 green.                             │
│                                                                       │
│  F.2 — rotateTenantDek surface reserved                               │
│        prisma/schema.prisma                                           │
│          Tenant.previousEncryptedDek String?                          │
│        prisma/migrations/*_add_tenant_previous_encrypted_dek/         │
│          ALTER TABLE ADD COLUMN                                       │
│          CHECK (previousEncryptedDek IS NULL OR != encryptedDek)      │
│          CREATE INDEX WHERE previousEncryptedDek IS NOT NULL          │
│        src/lib/security/tenant-key-manager.ts                         │
│          rotateTenantDek(tenantId) → throws with inline runbook       │
│                                                                       │
│  F.3 — code-clarity bundle                                            │
│        src/lib/security/route-permissions.ts                          │
│          type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'        │
│          RoutePermissionRule.methods: readonly HttpMethod[]           │
│          hot path drops per-call .map(toUpperCase)                    │
│        src/lib/security/encryption.ts                                 │
│          three-state sentinel comment on _lastPreviousKeySource       │
│        tests/guardrails/route-permissions-uppercase.test.ts           │
│          ratchet against `as` casts + union lowercase additions       │
│                                                                       │
│  F.4 — SECURITY.md + detect-secrets                                   │
│        SECURITY.md                                                    │
│          GHSA primary channel — no dead .example email/PGP URL        │
│          Epic E coverage added to "Defences in this codebase"         │
│        scripts/detect-secrets.sh                                      │
│          --diff-filter=ACMR catches renamed-file secrets              │
│          (already shipped at Epic C.2 landing)                        │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

| Layer | Source of truth | Companion tests / guardrails |
|---|---|---|
| F.1 | `tests/unit/key-rotation-admin-api.test.ts` — `jest.mock('@/app-layer/context', ...)` block at top | Self-contained (8/8 pass today) |
| F.2 | `prisma/schema.prisma` (field + docstring), `prisma/migrations/20260424010000_add_tenant_previous_encrypted_dek/migration.sql` (ADD COLUMN + CHECK + partial index), `src/lib/security/tenant-key-manager.ts::rotateTenantDek` | `tests/integration/tenant-dek-rotation.test.ts` (real-impl happy path + double-rotation rejection + CHECK constraint), `tests/unit/tenant-key-manager.rotate.test.ts` (24 unit assertions), `tests/guardrails/tenant-dek-rotation-fallback.test.ts` (7 ratchet assertions on the dual-DEK middleware path) |
| F.3 | `src/lib/security/route-permissions.ts` (`HttpMethod` union), `src/lib/security/encryption.ts:139` (sentinel comment) | `tests/guardrails/route-permissions-uppercase.test.ts` |
| F.4 | `SECURITY.md` (GHSA channel), `scripts/detect-secrets.sh` (`--diff-filter=ACMR`) | `tests/unit/security/detect-secrets.test.ts` + `tests/guardrails/no-secrets.test.ts` |

## Why each design choice

### F.2 — Schema ships with the migration, not schema-only

Prisma's `schema.prisma` is the source-of-truth for the generated
client, but the DB has the column only after a matching migration
applies. "Reserve the name in schema-only" would produce a typed
client referring to a column Postgres doesn't have — any read of
`previousEncryptedDek` would crash at runtime with a "column does
not exist" error, and the next unrelated `prisma migrate dev`
on any other field change would auto-generate the F.2 migration
into that unrelated PR. Shipping schema + migration together keeps
the tree consistent.

### F.2 — CHECK constraint + partial index live in the migration, not on Prisma

Prisma 5 doesn't model CHECK constraints or WHERE-clause partial
indexes declaratively. Both go into the migration SQL by hand.
The CHECK rejects `previousEncryptedDek = encryptedDek` — a rotation
bug that copies identical ciphertext into both columns would
otherwise leave the "old key" and "new key" paths indistinguishable
on decrypt. The partial index makes the future sweep-rotations query
O(in-flight) instead of O(tenants).

### F.2 — Stub signature mirrors sibling verbs

`rotateTenantDek(tenantId: string): Promise<never>` — no
underscore-prefixed param, same positional `tenantId` as
`ensureTenantDek`, same component-logger slug convention. The stub
IS the API contract the real implementation will inherit; the
`Promise<never>` return type lets call sites statically know the
function never returns normally today. When real rotation lands,
the return changes to `Promise<void>` (with the same args) and
downstream call sites type-error without their work being lost.

### F.2 — Error message carries the workaround runbook inline

Operators who hit the stub are debugging a suspected tenant-key
compromise. They need the three commands to run NOW, not a link
to chase. The thrown `Error` message spells out
`DATA_ENCRYPTION_KEY_PREVIOUS=<old>, DATA_ENCRYPTION_KEY=<new>,
POST /api/t/<slug>/admin/key-rotation` — same content as Epic B's
operator runbook, available without leaving the stack trace.

### F.2 — CLAUDE.md Epic B paragraph corrected at the same time

The paragraph previously called `POST /api/t/<slug>/admin/key-rotation`
"per-tenant rotation". It's actually a master-KEK re-encryption
sweep (Epic B) — re-encrypting every v1 ciphertext under the new
primary KEK and re-wrapping per-tenant DEKs. The stub landing is
the trigger that makes the mislabelling user-visible, so the fix
ships in the same PR.

### F.3 — `HttpMethod` template-literal union instead of runtime normalization

The hot path at `resolveRoutePermission` used to do
`rule.methods.map((m) => m.toUpperCase()).includes(upperMethod)`
— O(n) allocation per gated-route request. Moving uppercase
enforcement to the TYPE (`type HttpMethod = 'GET' | 'POST' | ...`)
means the compiler rejects `methods: ['get']` before it ships; the
runtime path becomes a direct `.includes`. The companion
`route-permissions-uppercase.test.ts` ratchet catches anyone who
uses `as` to bypass the type.

### F.3 — Three-state sentinel comment

`_lastPreviousKeySource: string | null | undefined` looked arbitrary.
The three states are load-bearing:
- `undefined` — first-time read path (do the env fetch).
- `null` — env unset or too short (short-circuit without re-reading).
- `string` — cached key source (invalidate when raw env value
  changes).

A future "simplify" PR that collapses `undefined` and `null` would
force an env-read on every decrypt — a measurable cost. The comment
makes the intent discoverable without tracing the write sites.

### F.4 — GHSA primary, no dead email

The `.example` placeholder was an invitation to send reports into
the void. GitHub Security Advisories is private-by-default,
maintainer-visible, and already monitored. Making it the documented
primary channel (with a minimal-public-issue fallback) is better
than leaving a dead email that looks official but bounces.

## Verification commands

```bash
# F.1 — already shipped
SKIP_ENV_VALIDATION=1 npx jest tests/unit/key-rotation-admin-api.test.ts --no-coverage
# → 8/8 pass

# F.2 — schema + stub + integrity
npm run db:generate                                 # refresh Prisma client
SKIP_ENV_VALIDATION=1 npx jest tests/integration/tenant-dek-rotation-stub.test.ts --no-coverage
# → 3/3 pass (stub throws; column queryable; CHECK enforces)

# F.3 — code clarity
SKIP_ENV_VALIDATION=1 npx jest tests/guardrails/route-permissions-uppercase.test.ts --no-coverage
# → 3/3 pass

# F.4 — docs + tooling
grep -c '\.example' SECURITY.md     # → 0
# Renamed-file secret check (simulated in prior validation)
```

## Rollback

### F.2 schema
`npx prisma migrate reset` then re-apply every migration except
`20260424010000_add_tenant_previous_encrypted_dek`. The
`rotateTenantDek` stub function keeps compiling (it never reads
the column), but the integration test's column-queryable assertion
will fail — expected.

For a production rollback without a full reset, ship a migration
that drops the column, partial index, and CHECK. The stub carries
no persistent state so its behaviour is unaffected.

### F.3 code clarity
Pure refactor. Revert the single commit. The companion guardrail
test disappears with the revert and nothing structural breaks.

### F.4a SECURITY.md
Doc-only. Revert the commit or reapply the old placeholders — no
behavioural impact.

## Adding a new DEK-lifecycle verb to `tenant-key-manager`

1. Function signature: `verb(tenantId: string, ...): Promise<void>`
   or `Promise<never>` for stubs. No underscore prefix on params.
2. Logs: `logger.info('tenant-key-manager.<event>', { component:
   'tenant-key-manager', tenantId, ... })`. Match the existing
   event-name convention.
3. Race safety: when transitioning Tenant row state, use
   `prisma.tenant.updateMany({ where: { id: tenantId, <precondition> },
   data: ... })`. Never plain `.update()` for state transitions.
4. Register in the module-level docstring at the top of the file.
5. If your verb adds a new column to `Tenant`, ship:
   - schema + matching migration (both in the same PR);
   - a CHECK constraint or partial index if there's a cross-column
     invariant or a minority-state query;
   - a guardrail test asserting the schema invariants.
