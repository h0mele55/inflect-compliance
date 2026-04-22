# PostgreSQL Row-Level Security (Epic A.1)

Multi-tenant isolation in Inflect Compliance is enforced at **two**
layers, in this order of authority:

1. **PostgreSQL RLS policies** — every tenant-scoped table has a
   `tenant_isolation` policy + (for direct-scoped tables) a
   `tenant_isolation_insert` policy, plus a `superuser_bypass` policy
   that explicitly re-admits non-`app_user` sessions. This is the
   load-bearing contract: even a catastrophic app-layer bug (a missing
   `where: { tenantId }`) cannot leak across tenants because the DB
   returns zero rows.

2. **Application-layer `tenantId` filters** — every repository query
   also filters by `tenantId`. This provides defense in depth and
   ensures clean error messages when the app code is working correctly.

This doc covers the RLS side: how to use it, when to bypass, and the
rules that keep the architecture durable.

## The role model

| Postgres role | Used by | RLS behaviour |
|---|---|---|
| `postgres` (superuser) | Migrations, seeds, admin scripts, NextAuth auth lookups, webhook ingest, cross-tenant sweeps | Admitted by the `superuser_bypass` policy (`current_setting('role') != 'app_user'`). Sees everything. |
| `app_user` (NOLOGIN, granted to postgres) | **All normal request handlers + per-tenant jobs** via `runInTenantContext` | `superuser_bypass` does not match. `tenant_isolation` enforces `"tenantId" = current_setting('app.tenant_id')`. Sees only own-tenant rows. |

`FORCE ROW LEVEL SECURITY` is enabled on every tenant-scoped table so
policies apply to the table owner (postgres) too — which is precisely
why we need `superuser_bypass` to re-admit trusted non-app paths.

## The canonical API

All tenant-scoped database access should import from **`@/lib/db/rls-middleware`**.

### `runInTenantContext(ctx, callback)` — the only right answer for request code

```ts
import { runInTenantContext } from '@/lib/db/rls-middleware';
import type { RequestContext } from '@/app-layer/types';

export async function listRisks(ctx: RequestContext) {
    return runInTenantContext(ctx, async (db) => {
        return db.risk.findMany(); // RLS filters automatically
    });
}
```

Inside the callback:
- `SET LOCAL ROLE app_user` has dropped superuser privilege for this
  transaction.
- `set_config('app.tenant_id', ctx.tenantId, true)` has bound the
  session variable to the transaction.
- Every query hits RLS policies and sees only `ctx.tenantId` rows.
- The transaction commits — `LOCAL` settings reset automatically.
- PgBouncer transaction-pool safe.

### `runWithoutRls({ reason }, callback)` — explicit, audited bypass

```ts
import { runWithoutRls } from '@/lib/db/rls-middleware';

// Auth flow: tenant not yet known
const memberships = await runWithoutRls(
    { reason: 'auth-tenant-discovery' },
    async (db) => db.tenantMembership.findMany({ where: { userId } })
);
```

Rules:
- `reason` must be a literal from `RlsBypassReason`. The union is the
  allowlist; adding a reason requires editing `rls-middleware.ts`
  (intentional code-review checkpoint).
- Every invocation logs at `info` level with `reason` + caller
  fingerprint (`module/file.ts:line`). Check production logs to audit
  bypass usage.
- The callback receives the raw `prisma` client; queries run as
  postgres and `superuser_bypass` admits.

Current reasons:

| Reason | Used by |
|---|---|
| `auth-tenant-discovery` | NextAuth JWT callback, SSO callbacks |
| `auth-credentials` | Password reset, invite redemption, pre-auth lookups |
| `webhook-ingest` | Inbound webhook receipt before tenant is resolved |
| `cross-tenant-sweep` | Scheduled jobs that iterate every tenant by design |
| `seed` | `prisma/seed.ts`, `seed-catalog.ts`, etc. |
| `admin-script` | One-off maintenance / repair scripts |
| `library-import` | Framework / template / policy-template bootstrap |
| `test` | Test fixtures that need to seed across tenants |

### `runInGlobalContext(callback)` — legacy public-route helper

For authentication-free public endpoints (e.g. share-link readers)
where tenant context genuinely does not exist. Prefer
`runWithoutRls({ reason: ... })` for new code; `runInGlobalContext`
is kept for backward compatibility.

## Adding a new tenant-scoped table

When a new Prisma model with `tenantId` lands:

1. Add the column + migration as usual.
2. Add an RLS policy set in a follow-up migration matching the
   canonical shape from `prisma/migrations/20260422180000_enable_rls_coverage/migration.sql`:
   ```sql
   ALTER TABLE "NewModel" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "NewModel" FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "NewModel"
       USING ("tenantId" = current_setting('app.tenant_id', true)::text);
   CREATE POLICY tenant_isolation_insert ON "NewModel"
       FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
   CREATE POLICY superuser_bypass ON "NewModel"
       USING (current_setting('role') != 'app_user');
   GRANT SELECT, INSERT, UPDATE, DELETE ON "NewModel" TO app_user;
   ```
3. **CI will catch forgotten coverage.**
   `tests/guardrails/rls-coverage.test.ts` queries `pg_policies` +
   `pg_tables.forcerowsecurity` and fails if any model in
   `TENANT_SCOPED_MODELS` (derived from the Prisma DMMF at runtime)
   is missing a policy. The failure message includes the exact model
   name and points at the canonical migration.

### Special-case policies

Three shapes beyond the Class-A default. Pick based on the column shape:

| Class | When | Policy form |
|---|---|---|
| **A — standard** | `tenantId String` (required) | Split: `tenant_isolation` USING + `tenant_isolation_insert` FOR INSERT WITH CHECK |
| **C — nullable tenant** | `tenantId String?` (e.g. webhook ingest) | **Single** permissive policy with both `USING (tenantId IS NULL OR ...)` and strict `WITH CHECK (tenantId = ...)`. Splitting leaks via permissive-OR. Add the model name to `SINGLE_POLICY_EXCEPTIONS` in `tests/guardrails/rls-coverage.test.ts`. |
| **E — ownership-chained** | No `tenantId` column; scoped via parent FK | **Single** permissive policy with `USING (EXISTS parent matches)` and `WITH CHECK (EXISTS both parents match for junctions)`. Do NOT use a split policy — the `FOR ALL USING` will double as WITH CHECK for INSERT and admit cross-tenant parent pairs. |

## Adding a new bypass reason

Rare. Ask first: is this really a bypass, or a missing `ctx` plumbing?

If genuinely required:

1. Edit `RlsBypassReason` in `src/lib/db/rls-middleware.ts` — extend
   the union and the `KNOWN_REASONS` set.
2. Document the reason in the table above.
3. The runtime validator will immediately accept the new reason; no
   other wiring needed.

## Testing

| Test | What it guarantees |
|---|---|
| `tests/guardrails/rls-coverage.test.ts` | Every `TENANT_SCOPED_MODELS` entry has `tenant_isolation` + `superuser_bypass` policies + FORCE RLS. No `allow_all` stopgaps survive. |
| `tests/integration/rls-middleware.test.ts` | Live Postgres proves `runInTenantContext` isolates, `SET LOCAL` is transaction-scoped under concurrency, `runWithoutRls` bypasses, Class-C nullable enforces WITH CHECK strictly, Class-E ownership-chained enforces on both parents. |
| `tests/unit/rls-middleware.test.ts` | `runWithoutRls` rejects unknown reasons, logs with caller fingerprint, never leaks query payloads. Tripwire logs writes-without-context at `warn`, reads at `debug`, never throws. |

Run the guardrail alone to sanity-check a new migration:

```bash
npx jest tests/guardrails/rls-coverage.test.ts
```

## Don'ts

- **Don't** import `prisma` directly in app-layer code. Go through
  `runInTenantContext` or `runWithoutRls`.
- **Don't** add a new tenant-scoped model without adding the RLS
  migration in the same PR — the guardrail will fail CI.
- **Don't** introduce a new bypass path by calling `prisma` from a
  module that isn't obviously an auth/webhook/seed path. Use
  `runWithoutRls({ reason })` so the log record exists.
- **Don't** remove a `superuser_bypass` policy — migrations will
  start failing (FORCE RLS blocks the table owner too).
- **Don't** rename `app.tenant_id` to `app.current_tenant_id`. The
  existing 79 policies all reference `app.tenant_id`; a rename
  requires coordinated policy + `runInTenantContext` changes with
  zero security benefit.
- **Don't** widen a Class-C (nullable-tenant) policy to use the split
  form. Verify with the integration test's "cannot INSERT NULL-tenant
  row" case — if it passes with a split policy, you have a leak.
