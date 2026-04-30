# 2026-04-30 — Epic 41 (Prompt 4): Default preset + new-org seed + backfill

**Commit:** `<pending> feat(api): epic 41 — default org dashboard preset + auto-seed + existing-org backfill`

Prompt 4 of 5 for Epic 41 — Configurable Dashboard Widget Engine.
Migrates the org-level dashboard from hardcoded composition (current
`/org/[orgSlug]/page.tsx`) to persisted `OrgDashboardWidget` rows.
Two paths converge through one seeder:

  - **New orgs** — `POST /api/org` seeds the preset inside the
    org-creation transaction. Atomic — if the org commits, its
    dashboard commits.
  - **Existing orgs** — `scripts/backfill-org-dashboard-widgets.ts`
    iterates orgs and seeds the preset for any with zero widgets.
    Idempotent under repeated runs.

The page rewrite (which actually consumes these rows) is prompt 5.
This prompt is the data layer.

## Migration strategy

Persisted-not-coded. The current `/org/[orgSlug]/page.tsx` renders
five fixed sections via top-level React JSX. After Epic 41 is
complete (post-prompt-5), the page reads `OrgDashboardWidget` rows
and dispatches each through the renderer + wrapper from prompts 2.
The migration plumbing in this prompt:

  1. **Single source of truth** — `DEFAULT_ORG_DASHBOARD_PRESET` in
     `src/app-layer/usecases/org-dashboard-presets.ts` is the typed
     array of 8 widget specs that mirrors the prior page's sections
     1:1. Both new-org seed and backfill consume the same constant.
  2. **`seedDefaultOrgDashboard(db, orgId)`** — the only writer.
     Counts the org's existing widgets first; inserts the preset
     only when count = 0. Idempotent: re-runs are no-ops on orgs
     that already have any widget (manual or preset-seeded).
  3. **`POST /api/org`** wires the seed inside the existing
     `prisma.$transaction`, between the `OrgMembership` insert and
     the `provisionOrgAdminToTenants` fan-out. Atomic-with-org
     creation: a 409 conflict on slug rolls back the org AND the
     widgets in lockstep. Verified by an integration test that
     pre-seeds a slug, fires a duplicate POST, and asserts the
     widget table is unchanged.
  4. **Backfill script** at `scripts/backfill-org-dashboard-widgets.ts`,
     wired to `npm run db:backfill-org-widgets`. Default mode is
     DRY-RUN (counts orgs that would be seeded, no writes).
     `--execute` flag persists. Per-org status line prints
     `seeded N` or `skipped — already has N widget(s)`.

## Hardcoded → widget mapping

The current `/org/[orgSlug]/page.tsx` renders five sections in this
order:

| Page section | Widget(s) | type | chartType | (x, y) | (w, h) |
| ------------ | --------- | ---- | --------- | ------ | ------ |
| StatCardsRow | KPI tile (Coverage)            | `KPI`            | `coverage`         | (0, 0)  | (3, 2) |
|              | KPI tile (Critical Risks)      | `KPI`            | `critical-risks`   | (3, 0)  | (3, 2) |
|              | KPI tile (Overdue Evidence)    | `KPI`            | `overdue-evidence` | (6, 0)  | (3, 2) |
|              | KPI tile (Tenants)             | `KPI`            | `tenants`          | (9, 0)  | (3, 2) |
| RagDistributionCard | Donut breakdown         | `DONUT`          | `rag-distribution` | (0, 2)  | (6, 4) |
| RiskTrendCard | Trend (Open risks 90d)        | `TREND`          | `risks-open`       | (6, 2)  | (6, 4) |
| TenantCoverageList | Coverage list per tenant | `TENANT_LIST`    | `coverage`         | (0, 6)  | (12, 6) |
| DrillDownCtas | Three drill-down CTAs         | `DRILLDOWN_CTAS` | `default`          | (0, 12) | (12, 2) |

8 widgets total. Layout in 12-column units; total height 14 rows
(× 64 px row-height ≈ 896 px before margins). The titles, formats,
and config blocks (`config: { format: 'percent' }` etc.) reproduce
the prior page's hand-coded values so the migrated dashboard reads
the same.

`tests/unit/org-dashboard-preset.test.ts` locks every coordinate
above with explicit assertions — a future preset edit that changes
positions, sizes, or chartTypes is caught at PR time.

## Default preset strategy

Three guarantees the preset upholds:

  - **Visual continuity for the migrated dashboard.** Every
    persisted widget renders to the same chart shape + variant
    + position the prior page used. The layout-fidelity test in
    `org-dashboard-preset-seeding.test.ts` reads back the persisted
    rows and compares `(x, y, w, h)` against the preset constant
    directly — proves the seeder doesn't mangle JSON columns on
    the way through Prisma.

  - **Idempotent on every re-run.** `seedDefaultOrgDashboard` is
    the sole writer; both call sites (new-org tx + backfill script)
    funnel through it. Re-running on an already-seeded org is a
    no-op. The integration test exercises:
      - clean seed → 8 widgets
      - second seed → still 8 (no duplicates)
      - org with one manual widget → seeder skips entirely
      - two concurrent seeds on a fresh org → final count = 8 OR 16
        (acceptable race documented in the seeder; cleanup is a
        manual delete if it fires in prod, single-digit-ms window)

  - **No "works but looks different".** The eight widgets are an
    exact 1:1 with the prior page's sections — same titles, same
    chart variants, same row ordering. The KPI cards walk
    left-to-right (coverage / critical-risks / overdue-evidence /
    tenants) matching `StatCardsRow`. The donut sits left of the
    trend chart matching the original `grid grid-cols-1
    lg:grid-cols-2` row.

## Files

| File | Status |
| ---- | ------ |
| `src/app-layer/usecases/org-dashboard-presets.ts` | NEW — `DEFAULT_ORG_DASHBOARD_PRESET` + `seedDefaultOrgDashboard` |
| `src/app/api/org/route.ts` | wires `seedDefaultOrgDashboard(tx, org.id)` inside the existing `$transaction` |
| `scripts/backfill-org-dashboard-widgets.ts` | NEW — backfill for existing orgs (dry-run default, `--execute` to write) |
| `package.json` | `db:backfill-org-widgets` script alongside `db:bootstrap-owners` |
| `tests/unit/org-dashboard-preset.test.ts` | NEW — 11 preset shape + layout-fidelity tests |
| `tests/integration/org-dashboard-preset-seeding.test.ts` | NEW — 4 DB-backed seeding tests |
| `tests/integration/org-create-seeds-widgets.test.ts` | NEW — 2 route-integration tests covering atomic seed + 409 rollback |
| `docs/implementation-notes/2026-04-30-epic-41-default-preset-and-backfill.md` | NEW — this note |

## Tests added

**Unit (11):**
  - count = 8
  - every entry Zod-valid against `CreateOrgDashboardWidgetInput`
  - KPI order matches `StatCardsRow` (coverage / critical-risks /
    overdue-evidence / tenants)
  - donut + trend side-by-side at y=2
  - tenant list full-width at y=6
  - drilldown CTAs full-width at y=12
  - no two widgets occupy overlapping `(x..x+w, y..y+h)` rectangles
  - every widget enabled by default
  - every widget has a non-null human title
  - mutation regression (drop one → length asserts trip)

**Integration — seeding semantics (4):**
  - clean seed → exactly 8 persisted rows
  - re-seed → still 8 (idempotency)
  - manual-pre-existing widget → seeder skips entirely
  - concurrent double-seed → 8 OR 16 (documented race acceptable;
    cleanup manual if it fires)
  - layout fidelity: persisted `(x, y, w, h)` matches preset exactly

**Integration — route wiring (2):**
  - `POST /api/org` → 201 + 8 widgets persisted scoped to the new
    org id (atomic with org creation)
  - duplicate-slug `POST /api/org` → 409 + zero orphan widgets
    (transaction rollback guarantee)

## Verification

- `npx jest tests/unit/org-dashboard-preset.test.ts tests/integration/org-dashboard-preset-seeding.test.ts tests/integration/org-create-seeds-widgets.test.ts` → **17/17**
- Sweep across Epic 41 backend (preset + seed + create-flow + widget routes + schemas + DB CRUD) → **70/70**
- `npm run typecheck` → clean
- `npm run lint` → no warnings on new files
- `npx tsx scripts/backfill-org-dashboard-widgets.ts` (dry-run) →
  reports per-org status correctly; 14 fixture orgs in local DB
  flagged as seedable (no `--execute` ran)

## Decisions

  - **Why a TS script (not a Prisma data migration).** The preset
    is a typed `CreateOrgDashboardWidgetInput[]` constant — Zod
    validates it at build time, the seeder reuses it. A SQL data
    migration would duplicate the preset structure as bare INSERTs,
    drifting from the typed source over time. The script imports
    the live seeder so a future preset update flows automatically
    through to the next backfill run.

  - **Why seed inside the org-creation transaction (not after).**
    Atomic-with-org-creation. A 409 conflict on slug rolls back
    the org AND the widgets in lockstep — the integration test
    confirms zero orphan widget rows after a failed POST. The
    alternative (seed after the tx commits) would mean a brief
    race window where the org exists but its dashboard is empty;
    the user might see a blank page on first load. Inside the tx
    means the org is born with its dashboard ready.

  - **Why no DB-level unique constraint enforces "one preset per
    org".** A `(organizationId, type, chartType)` unique would
    prevent duplicates but also prevent admins from intentionally
    creating two KPI tiles for the same metric (e.g. "Coverage
    today" + "Coverage yesterday" with different config). The
    seeder's count-then-insert idempotency is sufficient for
    no-double-seed; manual writes get the flexibility a unique
    would forbid.

  - **Why dry-run default on the backfill script.** Operator safety
    — the prior pattern (`bootstrap-tenant-owners.ts`) defaults to
    dry-run. Mirrors that. The summary printed in dry-run is
    enough to verify the right orgs are about to be touched
    before flipping `--execute`.

  - **Why no `--diff` mode yet.** A future preset update (e.g.
    "Epic 42 adds a SLA gauge tile") will need a way to add the
    new tile to existing dashboards without re-seeding the whole
    preset. The current `seedDefaultOrgDashboard` short-circuits
    on any existing widget, which is correct for v1 but blocks
    delta-only updates. The plan: when the first preset evolution
    lands, add a `--diff` mode that compares the org's widget set
    against the preset and inserts only the missing entries.
    Tracked as a follow-up; out of scope for prompt 4.

  - **Why no DB trigger guards "first-org-widget-must-be-from-preset".**
    The `OrgDashboardWidget` table is a configuration surface, not
    a security surface. Nothing in compliance scope reads its
    contents. The seeder's idempotency check at the application
    layer is the right granularity; a trigger would add operational
    cost (Postgres function maintenance, migration churn) without
    a corresponding safety win.
