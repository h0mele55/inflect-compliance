# 2026-04-30 — Epic 41 (Prompt 3): DashboardGrid + WidgetPicker

**Commit:** `<pending> feat(ui): epic 41 — DashboardGrid + WidgetPicker interactive composition layer`

Prompt 3 of 5 for Epic 41 — Configurable Dashboard Widget Engine.
Adds the interactive composition layer: drag-and-drop grid + add-
widget modal. Persistence is API-driven (no local-only state) — the
grid emits diffs on every drag/resize end and the parent forwards
them to the widget API from prompt 1.

## Grid architecture

```
src/components/ui/dashboard-widgets/DashboardGrid.tsx
```

Wraps `react-grid-layout`'s `WidthProvider(GridLayout)` HOC pattern
(via the `react-grid-layout/legacy` subpath, which preserves the
v1-style flat-props API). Caller contract:

```tsx
<DashboardGrid
    widgets={widgets}              // typed, OrgDashboardWidgetDto-shape
    editable={canConfigureDashboard}
    renderWidget={(w) => (
        <DashboardWidget title={…} actions={…}>
            <ChartRenderer chartType={…} config={…} />
        </DashboardWidget>
    )}
    onLayoutChange={(changes) => {
        // changes: only widgets whose (x,y,w,h) actually moved.
        // Empty array = no-op fire (origin layout); short-circuit.
        for (const c of changes) {
            patchWidget(c.id, { position: c.position, size: c.size });
        }
    }}
/>
```

Key invariants:

  - **The grid never mutates its own layout off-prop.** Drag state
    is local to RGL during a gesture; on stop, the grid emits a
    diff via `onLayoutChange` and re-renders against whatever the
    parent decides to do. Single source of truth = the backend.

  - **Diff suppression.** RGL fires `onLayoutChange` on every render,
    including the initial mount with the same positions we passed
    in. The `diffLayoutChanges` helper compares against the prop
    widgets and emits ONLY the entries whose `(x, y, w, h)` actually
    moved. An origin-noop emit-with-zero-changes is suppressed at the
    grid level (callback is called with `[]`); callers can early-out
    on `changes.length === 0` if they want to skip the no-op cycle
    entirely (the grid's own callback wraps that check).

  - **`enabled: false` widgets are skipped.** Hidden tiles don't
    appear in the layout but their position is preserved on the
    widget row — re-enabling restores the prior layout.

  - **Editable mode is a single prop.** Hoists RGL's per-item
    `static` flag rather than re-cloning every tile; `<DashboardGrid
    editable={false}>` is a one-line read-only mode for ORG_READER.

## Widget picker flow

```
src/components/ui/dashboard-widgets/WidgetPicker.tsx
```

Production-grade modal flow built from existing primitives — `Modal`,
`RadioGroup`, `FormField`, `Label` — so the visual language matches
every other create flow in the app. No bespoke overlay, no one-off
form chrome.

Steps:

  1. **Type pick** — radio group: KPI / DONUT / TREND / TENANT_LIST /
     DRILLDOWN_CTAS. Each option shows a one-line description.
  2. **Data variant** — `<select>` populated from the per-type
     `CHART_TYPE_OPTIONS` map (e.g. KPI: coverage / critical-risks /
     overdue-evidence / tenants).
  3. **Per-type config** — KPI has a format radio (number / percent),
     TREND has a days field (7..365), DONUT has a show-legend
     checkbox, TENANT_LIST has a sort-by select. DRILLDOWN_CTAS has
     no extra config.
  4. **Title (optional)** — defaults to the type's human label when
     blank.
  5. **Submit** → caller's `onSubmit(input)` → modal closes on
     success; `onCreated(widget)` fires so the parent appends to
     local grid state.

Each widget kind ships with a sensible default `(w, h)` so a freshly-
created widget lands the right size:

  - KPI: 3×2 — fits four-across the grid
  - DONUT: 4×4 — square breakdown
  - TREND: 6×3 — wide chart with axes
  - TENANT_LIST: 12×6 — full-width list
  - DRILLDOWN_CTAS: 12×2 — full-width row of cards

The picker emits a default `(0, 0)` position; RGL's vertical
compactor places new tiles at the top of the grid automatically.

The picker's variant catalogue + per-type config defaults mirror the
Zod schema from prompt 1 EXACTLY — every emitted payload satisfies
the discriminated union without needing client-side schema validation.

## Persistence model

Persistence is the parent's responsibility — the grid + picker only
emit typed payloads. The standard wiring (which prompt 5's page
implementation lands):

```
parent state: widgets[]
  ├── add: WidgetPicker.onSubmit → POST /api/org/<slug>/dashboard/widgets
  │                              → resolves with the persisted DTO
  │                              → onCreated() appends to widgets[]
  ├── move/resize: DashboardGrid.onLayoutChange(changes)
  │                              → for each change: PATCH /api/org/<slug>/dashboard/widgets/<id>
  │                              → on success, reflect in widgets[]
  └── remove: external (e.g. config-menu trigger on each widget)
                                → DELETE /api/org/<slug>/dashboard/widgets/<id>
                                → remove from widgets[]
```

Drag state is **local to RGL** during a gesture; the persisted state
is the parent's `widgets[]`. The grid never mutates its own layout
off-prop, so a failed PATCH (e.g. 403) snaps the tile back on
re-render — the user sees the rejection immediately and there's no
out-of-sync state to clean up.

## Files

| File | Role |
| ---- | ---- |
| `package.json`, `package-lock.json` | NEW deps — `react-grid-layout` + `@types/react-grid-layout` |
| `src/components/ui/dashboard-widgets/DashboardGrid.tsx` | NEW — RGL HOC wrapper + layout diffing |
| `src/components/ui/dashboard-widgets/WidgetPicker.tsx` | NEW — modal-based add-widget flow |
| `src/components/ui/dashboard-widgets/index.ts` | barrel updated to export grid + picker |
| `tests/rendered/tsconfig.json` | `moduleResolution` → `bundler` so `react-grid-layout/legacy` subpath resolves |
| `jest.config.js` | jsdom project: moduleNameMapper for `react-grid-layout/legacy` + the two CSS imports + transform allowlist for `react-grid-layout|react-resizable|react-draggable` |
| `tests/rendered/dashboard-grid-and-picker.test.tsx` | NEW — 10 jsdom tests |
| `docs/implementation-notes/2026-04-30-epic-41-grid-and-picker.md` | NEW — this note |

## Tests added

10 rendered tests covering:

  - **DashboardGrid (4)**: visible-widget mounting, disabled-widget
    skip, `editable` flag class propagation, diff suppression on
    origin layout (initial mount fires `onLayoutChange` with `[]`).
  - **WidgetPicker (6)**: opens with KPI selected, type switch
    swaps the chartType options + reveals per-type config field,
    KPI submit emits the right payload shape, TREND submit emits
    days-aware payload, error path keeps the modal open with an
    inline alert, cancel closes without submit.

**Drag/resize gestures themselves are NOT exercised here** — RGL's
mouse-event hooks rely on a real layout engine (jsdom reports 0×0
for ParentSize). True drag E2E lives in Playwright; bringing up an
end-to-end spec with a seeded org + admin session is out of scope
for this prompt and lands separately. The unit tests verify the
*data flow* (diff helper + onLayoutChange contract); the E2E will
verify the *gesture* (mouse drag → PATCH).

## Verification

- `npx jest tests/rendered/dashboard-grid-and-picker.test.tsx` → **10/10**
- All jsdom tests after the tsconfig bump → **562/562** (no regressions
  from the moduleResolution change)
- `npm run typecheck` → clean
- `npm run lint` → no warnings on new files (one pre-existing warning
  in `audit-hardening.ts:129` remains)

## Decisions

  - **Why `react-grid-layout/legacy` (not the v2 hooks API).** v2's
    new hooks (`useGridLayout`, `useContainerWidth`) are more
    idiomatic but require more boilerplate — manual width tracking,
    layout state, drag handlers wired via a hook surface. The
    legacy WidthProvider + GridLayout HOC pattern is shorter, well-
    documented in RGL's README, and ships in v2 specifically for
    back-compat. We can migrate to hooks in a future epic if the
    grid grows custom drag/drop behaviour the HOC can't host; the
    `<DashboardGrid>` API stays stable across that migration.

  - **Why parent owns persistence (not the grid).** The grid is a
    presentational primitive. Coupling it to a fetch client (SWR /
    fetch / etc.) would force a single fetching idiom on every
    consumer. Instead, the grid emits typed `WidgetLayoutChange`
    diffs; consumers decide how to PATCH. Same pattern as the
    `useCursorPagination` accumulator in Epic E.2.

  - **Why pre-emit `[]` for no-op renders (rather than skip the
    callback entirely).** Callers might want a "nothing changed"
    signal for telemetry or to clear an in-flight indicator. Firing
    with an empty array is a uniform contract; consumers that want
    to skip can early-out on `changes.length === 0`.

  - **Why `react-grid-layout/legacy` import path needs a tsconfig
    bump.** The package uses an `exports` field with subpath
    conditionals to expose `/legacy`. The default `moduleResolution:
    "node"` doesn't honour that field; `"bundler"` does. We bumped
    `tests/rendered/tsconfig.json` to `bundler` (matching the root
    tsconfig) so ts-jest's TypeScript compilation step finds the
    subpath. No production code change — just aligning the test-side
    resolver with the build-side resolver.

  - **Why a moduleNameMapper for `/legacy` AND the CSS imports.**
    Two separate concerns:
    - The `/legacy` mapper redirects to `dist/legacy.js` so jest's
      runtime resolver finds it (independent of the TS resolver bump
      above).
    - The CSS mappers redirect to the existing `style-mock.ts`
      because jest can't import CSS modules under the jsdom project.

  - **Why fireEvent (not userEvent) for the picker form flow.** The
    Modal's mobile drawer fallback (`vaul`) wires pointer-event
    handlers that crash under jsdom (`getComputedStyle` returns
    transform-less values that vaul's `getTranslate` calls
    `.match()` on). `userEvent` simulates pointer events,
    `fireEvent` dispatches synthetic React events that skip the
    pointer wiring. The form's React handlers see the same change
    either way; the modal stays mounted; the test passes.

  - **Why the picker emits default `(0, 0)`. ** RGL's vertical
    compactor will place a new tile in the first available row
    automatically — emitting a sensible default keeps the picker
    simple and the placement deterministic. A future epic can grow
    the picker to ask the user where to place the tile (or auto-
    compute "biggest empty space") if the auto-placement turns out
    to be unintuitive.
