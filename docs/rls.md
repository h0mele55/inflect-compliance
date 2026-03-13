# Row-Level Security (RLS) Implementation Guide

## Overview

This application uses **Postgres Row-Level Security (RLS)** to enforce tenant isolation at the database level. Even if application code accidentally omits a `WHERE tenantId = ...` filter, the database will never return rows belonging to another tenant.

### How It Works

```
Request → Middleware (auth) → Route Handler → Usecase (runInTenantContext) → Repository (db: PrismaTx)
                                                    │
                                                    ├─ SET LOCAL ROLE app_user
                                                    ├─ SET LOCAL app.tenant_id = '<id>'
                                                    └─ SET LOCAL app.request_id = '<id>'
```

1. **`app_user` role**: A restricted Postgres role that does NOT bypass RLS (unlike the superuser connection Prisma uses by default)
2. **`app.tenant_id` session variable**: Used by RLS policies to filter rows
3. **`SET LOCAL`**: Scopes the settings to the current transaction only — automatically resets on commit/rollback
4. **`FORCE ROW LEVEL SECURITY`**: Applied to all tenant tables, ensuring RLS is enforced even for table owners

### Tables With RLS

All 14 tenant-scoped tables have RLS enabled:

| Table | tenantId | Policy Type |
|---|---|---|
| Scope, TenantMembership, ClauseProgress | `NOT NULL` | Standard match |
| Task, Asset, Risk, Evidence, AuditLog | `NOT NULL` | Standard match |
| Notification, ReminderHistory, Policy, Audit, Finding | `NOT NULL` | Standard match |
| Control | `NULL` (nullable) | Match OR `tenantId IS NULL` (global controls visible to all) |

---

## Writing New Code

### New Repository Method

Every repository method that touches a tenant-scoped table must accept `db: PrismaTx` as its first parameter:

```typescript
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '@/app-layer/types';

export const MyRepository = {
    list: (db: PrismaTx, ctx: RequestContext) =>
        db.myModel.findMany({
            where: { tenantId: ctx.tenantId }, // Keep for index usage
        }),

    create: (db: PrismaTx, ctx: RequestContext, data: any) =>
        db.myModel.create({
            data: { ...data, tenantId: ctx.tenantId },
        }),
};
```

> **Why keep `where: { tenantId }`?** RLS enforces isolation, but explicit filters help Postgres use the `tenantId` index for faster queries. Think of RLS as the seatbelt and `WHERE` as the steering wheel.

### New Usecase

Wrap all tenant-scoped operations in `runInTenantContext`:

```typescript
import { RequestContext } from '../types';
import { MyRepository } from '../repositories/MyRepository';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';

export async function listMyModels(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        MyRepository.list(db, ctx)
    );
}
```

**Rules:**
- ✅ use `runInTenantContext(ctx, (db) => ...)` in usecases
- ✅ pass `db` to all repository methods
- ❌ never import `prisma` from `@/lib/prisma` in repositories (except for global tables)
- ❌ never call `prisma.myModel.*` directly in usecases or route handlers

### Global Table Access

Some tables don't have RLS (e.g., `Tenant`, `User`, `RiskTemplate`, `Clause`). These can safely use the global `prisma` instance:

```typescript
import prisma from '@/lib/prisma';

// OK — Tenant table has no RLS
const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
```

---

## Migrations

### Creating a New Migration

```bash
npx prisma migrate dev --name your_migration_name
```

Migrations run as the **superuser** connection, so they are NOT affected by RLS. If your migration adds a new tenant-scoped table, you must:

1. Add `ENABLE/FORCE ROW LEVEL SECURITY` in the migration SQL
2. Add SELECT/INSERT/UPDATE/DELETE policies
3. See `prisma/migrations/20260303131309_create_app_user/migration.sql` for the pattern

### Running Tests

```bash
# TypeScript check
npx tsc --noEmit

# All tests (jest + playwright)
npm run test:all

# Just jest
npx jest --no-coverage --forceExit

# Just RLS integration tests
npx jest tests/integration/rls-isolation.test.ts --no-coverage --forceExit
```

---

## Debugging Common RLS Issues

### 1. "new row violates row-level security policy"

**Cause**: Trying to INSERT a row where `tenantId` doesn't match `current_setting('app.tenant_id')`.

**Fix**: Ensure the INSERT uses `ctx.tenantId` (not a hardcoded or wrong tenant ID).

### 2. Query Returns Empty Results (Unexpected)

**Cause**: `app.tenant_id` is not set, or is set to a different tenant.

**Debug**:
```sql
-- Check what tenant_id is set in your session:
SELECT current_setting('app.tenant_id', true);

-- Check current role:
SELECT current_user, session_user;
```

**Fix**: Ensure the usecase wraps the operation in `runInTenantContext(ctx, ...)`.

### 3. Migration / Seed Fails with RLS Error

**Cause**: Seed scripts or migrations running as `app_user` role.

**Fix**: Seeds and migrations must run as the superuser connection (default Prisma behavior). Never call `SET LOCAL ROLE app_user` in seed scripts.

### 4. Global Table Not Returning Data

**Cause**: You're querying a global table (like `Clause`) inside `runInTenantContext`, but the rows have `tenantId = NULL`.

**Fix**: For the `Control` table, the RLS policy allows `tenantId IS NULL` rows. For truly global tables (no `tenantId` column), query them outside `runInTenantContext` using global `prisma`.

### 5. CI Guard Test Failing

**Cause**: A new repository or usecase imports `prisma` from `@/lib/prisma`.

**Fix**: If the import is intentional (global table access), add the file to the allowlist in `tests/unit/no-direct-prisma.test.ts`. Otherwise, refactor to accept `db: PrismaTx`.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Next.js Route Handler                                  │
│  (thin: validate → resolve ctx → call usecase)          │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  Usecase                                                │
│  runInTenantContext(ctx, async (db) => {                 │
│      // All DB calls get tenant-scoped `db`             │
│      const items = await MyRepo.list(db, ctx);          │
│  })                                                     │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  Prisma $transaction                                    │
│  SET LOCAL ROLE app_user                                │
│  SET LOCAL app.tenant_id = 'tenant-123'                 │
│  SET LOCAL app.request_id = 'req-456'                   │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  PostgreSQL                                             │
│  RLS Policy: WHERE "tenantId" = current_setting(...)    │
│  Applied to ALL operations: SELECT, INSERT, UPDATE, DEL │
└─────────────────────────────────────────────────────────┘
```
