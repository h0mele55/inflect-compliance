# 2026-04-30 — Entity-page architecture (unified list + detail shells)

**Commit:** `<pending> feat(ui): unified entity-page architecture (EntityListPage + EntityDetailLayout)`

The closing prompt of a 3-prompt PR that lifts the controls list +
detail pages onto a reusable architectural foundation, borrowing the
**structural** strength of CISO-Assistant's `ModelTable.svelte` +
`DetailView.svelte` (one shell across every entity) without giving up
Inflect's stronger **domain-specific** content (`TraceabilityPanel`,
`LinkedTasksPanel`, `TestPlansPanel`, the rich status/applicability
column behaviour).

## The unified architecture

Two shells, one philosophy: **the shell carries layout, not business
content.**

```
src/components/layout/
  ├── ListPageShell.tsx          (Epic 52 — viewport-clamped list scaffold)
  ├── EntityListPage.tsx         (NEW — list-page composition shell)
  ├── EntityDetailLayout.tsx     (NEW — detail-page composition shell)
  ├── AppShell.tsx
  ├── OrgAppShell.tsx
  └── …
```

```
list-page page.tsx
   └─ <EntityListPage>           ← shell (layout)
         ├─ header (title + count + actions)
         ├─ <FilterToolbar>      ← internal — fed by `filters` prop
         ├─ <DataTable>          ← internal — fed by `table` prop
         └─ {children}           ← page-level modals/sheets passthrough

detail-page page.tsx
   └─ <EntityDetailLayout>       ← shell (layout)
         ├─ header (back + title + meta + actions)
         ├─ tab bar              ← optional, painted by shell
         └─ {children}           ← active-tab content owned by page
```

**Reusable** (lives in `src/components/layout/`):

  - 3-slot list scaffold (header / filters / body) and 4-slot detail
    scaffold (header / tabs / body / lifecycle states).
  - Header chrome — title, count line, right-aligned actions slot,
    back link, meta row.
  - Lifecycle states — loading skeletons, error alerts, empty-not-found
    panels (detail).
  - Tab-bar a11y — `role="tablist"`, `role="tab"`, `aria-selected`,
    `aria-controls`, `tabpanel` with `aria-labelledby`.
  - Filter wiring — `FilterToolbar` mounts behind one `filters` prop,
    so every list page gets the same search-id + actions slot
    convention.
  - Table threading — every `DataTable` prop the consumer cares about
    surfaces via `Pick<DataTableProps>` so a feature added to
    `DataTable` (sorting, batch actions, column visibility) is reachable
    from every adopter without a shell change.

**Domain-specific** (stays in the page):

  - Column definitions, with full TanStack power and typed via
    `createColumns<TRow>()` so the row shape isn't erased.
  - Filter definitions, including runtime-derived options
    (`buildControlFilters(controls)` patches owner / category options
    from loaded data).
  - Data fetching, mutations, optimistic updates, refetch plumbing.
  - Detail / create modals + sheets — passed as children, so they sit
    next to the page state that drives them.
  - Permission gates on header + cell actions
    (`appPermissions.controls.create`).
  - URL sync — handled by the page's `<FilterProvider>`; the shell is
    state-free.
  - Domain-specific tab-body content. Every controls tab (overview,
    tasks, evidence, mappings, traceability, activity, tests) and
    every domain panel (`TraceabilityPanel`, `LinkedTasksPanel`,
    `TestPlansPanel`) stays in the page verbatim.

### What this is NOT

  - **Not** a JSON-driven generic table or detail-renderer. CISO-
    Assistant's `DetailView.svelte` does take that route — generic
    field/section rendering — and the trade-off shows: their detail
    pages are uniform but the rich panels are weaker. We borrowed
    only the structural strength (one shell across entities), not the
    content flatness.
  - **Not** a wrapper that hides `DataTable`'s prop surface. The
    `EntityListPageTable<TRow>` type is `Pick<DataTableProps<TRow>, …>`
    so adding a new `DataTable` prop costs one line in the `Pick` and
    nothing else.
  - **Not** a data fetcher — pages run their own queries.

## Files

| File | Status |
| ---- | ------ |
| `src/components/layout/EntityListPage.tsx` | NEW — list-page shell |
| `src/components/layout/EntityDetailLayout.tsx` | NEW — detail-page shell (Prompt 1) |
| `src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx` | refactored to use `EntityListPage` |
| `src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx` | refactored to use `EntityDetailLayout` (Prompt 1) |
| `tests/rendered/entity-list-page.test.tsx` | NEW — 8 rendered tests on the list shell |
| `tests/rendered/entity-detail-layout.test.tsx` | NEW — 14 rendered tests on the detail shell (Prompt 1) |
| `tests/unit/controls-client-shell-adoption.test.ts` | NEW — 9 structural assertions on the controls list page |
| `tests/unit/control-detail-shell-adoption.test.ts` | NEW — 8 structural assertions on the controls detail page (Prompt 1) |
| `docs/implementation-notes/2026-04-30-entity-detail-layout-extraction.md` | NEW — Prompt 1 note |
| `docs/implementation-notes/2026-04-30-entity-page-architecture.md` | NEW — this note (unified architecture) |
| `CLAUDE.md` | UPDATED — new "Entity-page architecture" convention section |

## Controls-page refactor summary

**`ControlsClient` (list).** Replaced the 3-block `<ListPageShell> →
<FilterToolbar> → <DataTable>` composition (~80 lines of plumbing)
with one declarative `<EntityListPage<ControlListItem>>` config-prop
call. Every existing behaviour preserved verbatim:

  - Header — title with `<AppIcon>`, count line, four action buttons
    (Dashboard / Frameworks / Templates / `+ New Control`) gated by
    `appPermissions.controls.create`.
  - Filters — `liveFilterDefs` (runtime-derived owner + category
    options), `searchId: 'control-search'`, `<ColumnsDropdown>` in
    the toolbar's actions slot.
  - Table — every column unchanged, including the rich
    status-pill / applicability-pill / quick-edit cells. Row click
    routes through to detail. Empty state branches on `hasActive`.
  - Children — `<NewControlModal>`, `<ControlDetailSheet>`, and the
    justification `<Modal>` sit as page-level children, owning their
    page state next to the JSX that drives them.

**Controls detail page** (Prompt 1, recapped here for completeness).
Replaced ~75 lines of inline header JSX + ~12 lines of inline tab bar
+ ~25 lines of loading skeleton with one `<EntityDetailLayout>`
wrapper carrying `back / title / meta / actions / loading / error /
empty / tabs / activeTab / onTabChange`. Every tab branch
(overview, tasks, evidence, mappings, traceability, activity, tests)
and every domain panel (`TraceabilityPanel`, `LinkedTasksPanel`,
`TestPlansPanel`) preserved verbatim.

## Tests

**Rendered (8)** at `tests/rendered/entity-list-page.test.tsx`:
  - Header: title + count + actions render when supplied
  - Header: count + actions slots omit cleanly when undefined
  - Filters: `<FilterToolbar>` renders when `filters` prop supplied
    (search-id surface check)
  - Filters: `<FilterToolbar>` omitted entirely when `filters` is not
    supplied
  - Table: rows render from `data` prop
  - Table: `onRowClick` forwards through to underlying `<DataTable>`
  - Table: `emptyState` renders when `data: []`
  - Children: render verbatim below the table (modals/sheets layer)

**Rendered (14)** at `tests/rendered/entity-detail-layout.test.tsx`:
  Header / tabs (a11y + count badge + click + disabled) / lifecycle
  (loading skeleton, error alert, empty-not-found) / optional-tabs.

**Structural (9)** at `tests/unit/controls-client-shell-adoption.test.ts`:
  - Imports `EntityListPage` from the canonical path
  - Mounts `<EntityListPage<ControlListItem>>` at the top level
  - Does NOT hand-roll `<ListPageShell>` directly (shell owns it)
  - Does NOT hand-roll `<FilterToolbar>` directly (shell owns it)
  - Threads filters through the shell (defs + searchId + placeholder)
  - Threads the table config through the shell (data + columns +
    getRowId + data-testid)
  - Preserves all four header actions gated by
    `appPermissions.controls.create` (regression guard)
  - Preserves the rich domain cell behaviour (status / applicability /
    quick-edit ids load-bearing for E2E)
  - Renders modals + sheet as children (page-state-adjacent)

**Structural (8)** at `tests/unit/control-detail-shell-adoption.test.ts`:
  Page imports `EntityDetailLayout` / mounts it / preserves three
  domain panels / preserves seven tab branches / preserves sync
  badges / preserves edit modal / does NOT hand-roll the tab bar /
  threads `tabs / activeTab / onTabChange` through the shell.

## Verification

- `npx jest tests/rendered/entity-list-page.test.tsx tests/rendered/entity-detail-layout.test.tsx tests/unit/controls-client-shell-adoption.test.ts tests/unit/control-detail-shell-adoption.test.ts` → **39/39**
- `npm run typecheck` → clean
- `npm run lint` → no warnings on touched files

## Decisions

  - **Why two shells, not one.** A unified `<EntityPage>` would have to
    branch internally on `kind: 'list' | 'detail'`, exposing two
    largely-disjoint prop sets behind one type. Splitting at the
    component boundary makes the consumer's intent obvious from the
    JSX tag and lets each shell evolve independently. The two shells
    sit beside each other in `src/components/layout/` so the seam is
    easy to find.

  - **Why a `Pick<DataTableProps>` rather than re-exporting every prop
    by hand.** Adding a new `DataTable` prop (Epic 52 keeps growing)
    must reach every adopter without a shell change. `Pick` is the
    lightest seam that achieves that — the public surface stays
    explicit (it's not `…DataTableProps<TRow>`), but a new column-
    visibility / batch-action / sort prop costs one line in the union
    and zero in any consumer.

  - **Why config-prop API rather than compound-component API.** A
    compound `<EntityListPage> → <EntityListPage.Header> →
    <EntityListPage.Filters> → <EntityListPage.Table>` shape was
    considered. Rejected because the props are mostly leaf data
    (title strings, filter defs, column arrays) and the compound form
    forces nesting where one config object reads cleaner. The detail
    shell uses the same config-prop shape for consistency. The shell
    INTERNALLY uses the compound `<ListPageShell>` from Epic 52 — the
    primitive layer is compound; the entity-shell layer is config.

  - **Why `children` as a passthrough below the table.** Modals and
    sheets need to sit at the page-state level (the page owns the
    `isOpen` flag, the selected row, the mutation handlers). Nesting
    them inside the shell's tree would force the shell to manage state
    that isn't its concern. Passing them through verbatim keeps the
    shell stateless and lets the page co-locate JSX with the
    `useState` calls that drive it.

  - **Why a structural ratchet rather than a pure rendered test.** The
    rendered test proves the shell *can* be adopted; the ratchet
    locks in that the controls page *has* adopted it. Without the
    ratchet, a future "tidy-up" PR could quietly inline the shell back
    out and undo this work — the same regression class Inflect already
    locks for Epic 52 (`list-page-shell-coverage.test.ts`), Epic 41
    (`dashboard-widgets.test.ts`'s widget guard), and Epic C.1
    (`api-permission-coverage.test.ts`). One ratchet per adoption is
    the canonical pattern.

  - **Why no migration of risks / policies / vendors / audits in this
    PR.** Each adoption is its own small, ratchet-locked PR. Doing all
    four in one diff would (a) blow the diff size and (b) tightly
    couple the shells' API surface to each page's quirks before the
    design settles. The shells ship with one user (controls) for both
    list and detail; subsequent PRs bring the others over once any
    real-world friction with the API has been observed. The
    `EXEMPTIONS` array in `tests/guards/list-page-shell-coverage.test.ts`
    already carries the carve-outs for entity pages that don't fit
    the standard shape (multi-section dashboards, wizards) — that
    exemption list extends naturally as more entity pages adopt
    `EntityListPage`.

  - **Why both shells live in `src/components/layout/` rather than
    `src/components/page/`.** Inflect's existing layout primitives
    (`ListPageShell`, `AppShell`, `OrgAppShell`) live there, and the
    entity shells are layout primitives — they own the structural
    arrangement of the page. Splitting them into a separate `page/`
    namespace would fragment the discovery surface. The naming
    asymmetry (`EntityListPage` vs `EntityDetailLayout`) is
    intentional: the list shell IS the page composition (header +
    filters + body all defined), while the detail shell is a layout
    around variable tab content the consumer provides.
