# Inflect Compliance — Architecture

## Tenant-Only Architecture

Inflect Compliance uses a **tenant-only** certification boundary. Every organization (tenant) manages ISO 27001 compliance as a single, unified scope.

> **No sub-scopes.** The "Scope" concept was removed. All domain entities (risks, controls, evidence, assets, policies, audits, findings) are scoped to the tenant only.

### URL Structure

| Type | Pattern | Example |
|------|---------|---------|
| **UI pages** | `/t/[tenantSlug]/…` | `/t/acme-corp/risks` |
| **API routes** | `/api/t/[tenantSlug]/…` | `/api/t/acme-corp/controls` |

There are **no** `/s/[scopeSlug]` routes. These were permanently removed.

### Membership Model

```
User ──┐
       ├── TenantMembership (role: ADMIN | EDITOR | READER | AUDITOR)
       │     └── Permissions: canRead, canWrite, canAdmin, canAudit, canExport
Tenant ┘
```

Roles are assigned per tenant via `TenantMembership`. There is no scope-level membership.

### Row-Level Security (RLS)

PostgreSQL RLS enforces tenant isolation at the database level:

```sql
-- Standard tables (required tenantId)
CREATE POLICY tenant_isolation_select ON "<table>" FOR SELECT
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Control table (nullable tenantId for global ISO controls)
CREATE POLICY tenant_isolation_select_control ON "Control" FOR SELECT
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true));
```

Only `app.tenant_id` is used. There is no `app.scope_id`.

## Control Applicability

Controls are **applicable by default**. Instead of filtering controls into scopes, controls can be marked as **Not Applicable** with a mandatory justification — the ISO 27001 Statement of Applicability (SoA) approach.

| Field | Type | Description |
|-------|------|-------------|
| `applicability` | `APPLICABLE` \| `NOT_APPLICABLE` | Default: `APPLICABLE` |
| `applicabilityJustification` | `String?` | Required when N/A |
| `applicabilityDecidedByUserId` | `String?` | Who decided |
| `applicabilityDecidedAt` | `DateTime?` | When decided |

### API

```
PUT /api/t/:tenantSlug/controls/:id/applicability
Body: { applicability: "NOT_APPLICABLE", justification: "Cloud-only org" }
```

### Audit Trail

Every applicability change emits a `CONTROL_APPLICABILITY_CHANGED` audit event with old → new values and justification.

### Reports

The Statement of Applicability (SoA) uses `control.applicability` to determine whether a control is applicable, not `control.status`.

## Guardrails

A CI guardrail test (`tests/unit/scope-guardrails.test.ts`) prevents accidental reintroduction of scope-related code:

- ❌ No file paths containing `/s/[scopeSlug]`
- ❌ No `scopeId`, `resolveScopeContext`, `ScopeMembership`, or `Scope` model references
- ❌ No scope API routes or middleware redirect shims
- ❌ No `scopeRisks` i18n keys

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **DB:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js (Auth.js)
- **i18n:** next-intl (en, bg)
- **Validation:** Zod
- **Testing:** Jest (unit + integration)
