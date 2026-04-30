# 2026-04-30 — Epic 41 (Epic G.1): Dashboard widget backend foundation

**Commit:** `<pending> feat(api): epic 41 — OrgDashboardWidget CRUD + canConfigureDashboard`

Prompt 1 of 5 for Epic 41 — Configurable Dashboard Widget Engine.
Backend-only landing: schema + migration + Zod + usecase + API routes
+ tests. The frontend dispatcher / drag-grid wiring lands in
prompts 2–5.

## Design

Persisted, per-organization widget composition for the org-level
dashboard at `/org/[orgSlug]`. Each row in `OrgDashboardWidget` is
one widget rendered on the portfolio overview: KPI tile, RAG donut,
risk-trend chart, tenant-coverage list, drill-down CTA group. The
frontend reads widget rows; the backend enforces shape via Zod at the
API boundary.

**Org-scoped (NOT tenant-scoped).** Same shape as `OrgInvite` /
`OrgMembership` / `OrgAuditLog`: `organizationId` is the foreign key,
the global postgres role serves the queries, isolation is enforced by
`getOrgCtx` resolving the user's OrgMembership before the usecase
runs. Not in `TENANT_SCOPED_MODELS`.

**Reject-by-default shape.** `config`, `position`, and `size` are
JSON columns at the DB layer (so a new widget kind doesn't require a
migration), but every payload is shape-locked at the API layer by
Zod:

  - `WidgetPositionSchema` — `{x: 0..47, y: 0..47}` ints.
  - `WidgetSizeSchema` — `{w: 1..12, h: 1..24}` ints (12-column grid).
  - `WidgetTypedShapeSchema` — discriminated union on `type` that
    locks `chartType` AND `config` together for each variant. Every
    nested `config` block is `.strict()` so a stray field (e.g. KPI's
    `format` smuggled into a DONUT) fails the parse.

## Permission model

New `OrgPermissionSet.canConfigureDashboard` flag:

  - `ORG_ADMIN` → `true` (can manage widgets)
  - `ORG_READER` → `false` (can read the dashboard via
    `canViewPortfolio` but cannot mutate widgets)

Read access uses `canViewPortfolio` (existing). Write paths assert
`canConfigureDashboard` at the usecase layer; the route layer is a
thin pass-through. Cross-org id leak returns 404 (no information
disclosure across orgs).

## Files

| File | Role |
| ---- | ---- |
| `prisma/schema/enums.prisma` | NEW enum `OrgDashboardWidgetType` (KPI / DONUT / TREND / TENANT_LIST / DRILLDOWN_CTAS). |
| `prisma/schema/auth.prisma` | NEW model `OrgDashboardWidget` (FK to Organization with cascade delete). |
| `prisma/migrations/20260430101500_epic_g1_org_dashboard_widget/migration.sql` | NEW idempotent migration — CREATE TYPE / CREATE TABLE / index / FK guarded by IF NOT EXISTS + DO blocks. |
| `src/app-layer/schemas/org-dashboard-widget.schemas.ts` | NEW — discriminated-union widget shape, position/size validators, create/update inputs, `assertWidgetTypedShape` helper. |
| `src/app-layer/usecases/org-dashboard-widgets.ts` | NEW — `list / create / update / delete` CRUD with org-scope + permission asserts. |
| `src/lib/permissions.ts` | Added `canConfigureDashboard` to `OrgPermissionSet` and the role mapping. |
| `src/app/api/org/[orgSlug]/dashboard/widgets/route.ts` | NEW — GET (list) + POST (create). |
| `src/app/api/org/[orgSlug]/dashboard/widgets/[widgetId]/route.ts` | NEW — PATCH (update) + DELETE (remove). |
| `tests/unit/no-direct-prisma.test.ts` | Allowlisted `org-dashboard-widgets.ts` (and pre-existing `portfolio-data.ts`) under USECASE_ALLOWLIST. |
| `tests/unit/org-dashboard-widget-schemas.test.ts` | NEW — 39 tests on the Zod shape contract. |
| `tests/unit/org-dashboard-widget-route.test.ts` | NEW — 7 tests on the route layer (mocked usecase). |
| `tests/integration/org-dashboard-widget.test.ts` | NEW — 7 DB-backed tests covering cross-org isolation, RBAC, layout-only updates, type-aware revalidation. |
| `tests/unit/*.test.ts`, `tests/integration/*.test.ts` | Patched the OrgPermissionSet fixtures across the existing suite to include `canConfigureDashboard`. |
| `docs/implementation-notes/2026-04-30-epic-41-dashboard-widget-backend.md` | NEW — this note. |

## Validation + tenancy strategy

1. **Route layer** — every POST/PATCH body runs through
   `withValidatedBody(<schema>, ...)` so Zod errors surface as 400
   ApiErrorResponse (Epic E.1 contract). Position/size bounds, the
   discriminated union, the strict `.strict()` per-type config
   blocks, and the `chartType + config move together` superRefine
   on the PATCH body all live here.

2. **Usecase layer** — `assertCanRead` / `assertCanWrite` re-derive
   the permission from `ctx.permissions` (defence in depth). Every
   `where` clause carries both `id` AND `organizationId`, so a
   widget id from another org returns 404 from `findFirst` and a
   `count: 0` from `deleteMany` (mapped to 404 by the usecase). PATCH
   re-runs `assertWidgetTypedShape` with the row's stored `type` so
   the (chartType, config) pair stays valid for the row's lifetime
   even if the route-layer validator drifts.

3. **DB layer** — `OrgDashboardWidget.organizationId` is a NOT NULL
   FK with `ON DELETE CASCADE`, so removing an Organization
   automatically cleans up its widgets. No RLS today — same posture
   as `OrgInvite` / `OrgMembership` / `OrgAuditLog` (org-scope is
   enforced at the application layer via `getOrgCtx`).

## Tests added

  - **Schema** (39): position/size bounds, every per-type valid /
    invalid case, cross-type isolation (KPI fields rejected on DONUT
    etc.), Create input, Update superRefine.
  - **Routes** (7): GET 200, POST 201, POST 400 on bad chartType,
    POST 400 on out-of-bounds position, PATCH 200 layout-only, PATCH
    400 on chartType-without-config, DELETE 200.
  - **Integration** (7): create persists, list cross-org isolation,
    update layout-only, update revalidates type ↔ chartType pair,
    cross-org id leak → 404 on PATCH/DELETE, double-delete → 404,
    ORG_READER write 403 / read OK.

## Verification

- `npx jest tests/unit/org-dashboard-widget-*.test.ts tests/integration/org-dashboard-widget.test.ts` → **53/53**
- Full impacted-surface sweep (12 suites, includes existing portfolio + permissions + no-direct-prisma) → **988/988**
- `npm run typecheck` → clean
- `npm run lint` → no errors (pre-existing warnings only)
- Full `npm test` → 8 failing / 43 failing tests, **same as baseline** — no new regressions

## Decisions

  - **Why `OrgDashboardWidget` (not `DashboardWidget`).** The user
    constraint scoped this prompt to org-level only. The `Org*` prefix
    matches the existing `OrgInvite` / `OrgMembership` / `OrgAuditLog`
    convention and signals at the type / file / route layers that
    this is the org plane, not per-tenant. A future Epic that brings
    configurable widgets to the per-tenant dashboard would land as a
    sibling `TenantDashboardWidget` model rather than retrofitting
    this one with a nullable tenantId — keeps the FK + cascade
    semantics simple and the permission shape distinct.

  - **Why JSON columns for `config` / `position` / `size`.** A
    flat-column schema (`gridX`, `gridY`, `gridW`, `gridH`,
    `kpiFormat`, `donutShowLegend`, …) would explode as new widget
    types are added. The Zod boundary at the API layer is the
    contract; the DB just persists what the boundary accepted. New
    widget type = enum extension + Zod variant, no migration.

  - **Why `enabled` instead of soft-delete.** A hidden widget is a
    common "I'll bring this back later" UX — preserving position +
    config means re-enabling is non-destructive. Soft-delete adds no
    value at this point: actual deletion is via DELETE.

  - **No audit emission for widget mutations.** `org-audit-coverage`
    enforces audit on `OrgMembership` and `OrgInvite` mutations
    (privilege-affecting changes under SOC 2 CC6.1). Widget
    configuration is UI state, not a privilege change — out of
    scope for the audit ledger today. If a future compliance ask
    requires "who changed the dashboard," add a dedicated
    `ORG_DASHBOARD_*` enum trio to `OrgAuditAction` in the same PR
    that wires the emission.

  - **Why `chartType` + `config` move together on PATCH.** The
    discriminated union locks them jointly per `type`. Changing
    `chartType` without a matching `config` rewrite would put the
    row in a state the schema rejects on the next read. The
    superRefine on `UpdateOrgDashboardWidgetInput` returns 400 when
    only one half is sent, and the usecase re-runs
    `assertWidgetTypedShape` against the row's stored `type` so the
    DB never holds an invalid pair.

  - **Why route layer doesn't gate permissions.** The usecase asserts
    `assertCanRead` / `assertCanWrite` itself (mirrors the way
    `getPortfolioSummary` calls `assertCanViewPortfolio` directly).
    The route stays a thin transport boundary, the usecase stays
    callable from any caller (background jobs, scripts) without
    losing the permission gate. The two-level pattern in
    `org-members.ts` (route AND usecase both check) is fine but
    duplicates the rule — picking one place keeps the security
    invariant clear.
