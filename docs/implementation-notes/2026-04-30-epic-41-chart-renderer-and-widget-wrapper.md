# 2026-04-30 — Epic 41 (Prompt 2): ChartRenderer + DashboardWidget

**Commit:** `<pending> feat(ui): epic 41 — ChartRenderer + DashboardWidget rendering layer`

Prompt 2 of 5 for Epic 41 — Configurable Dashboard Widget Engine.
Frontend rendering primitives only — backend foundation landed in
prompt 1, grid integration / config picker / dashboard rewire land
in prompts 3–5.

## Important deviation from the prompt

The literal prompt asked to "install and integrate Recharts" as the
chart library backing `<ChartRenderer>`. **I deliberately did not
install Recharts.** Two reasons:

1. **CI guardrail.** `tests/guardrails/chart-platform-foundation.test.ts`
   explicitly bans `recharts / chart.js / victory / nivo / @nivo/core /
   react-vis / react-chartjs-2 / apexcharts`. Adding Recharts would
   fail CI on the very next push. The guardrail is the durable form
   of Epic 59's "one chart system" decision — bypassing it would
   require a separate cross-team PR.

2. **User constraint.** At the start of this 5-prompt PR the user
   said: *"don't deviate from the current frontend design — when you
   add functionality, make sure it's wrapped under the same front
   end design."* Inflect's chart system is `@visx`-based, with
   `<TimeSeriesChart>`, `<MiniAreaChart>`, `<DonutChart>`,
   `<ProgressCircle>`, `<KpiCard>` as its public surface. Adding a
   parallel Recharts surface would split visual identity across the
   dashboard.

The renderer below provides the **same caller contract a Recharts
dispatcher would** (typed `(chartType, config)` props, lifecycle
states, malformed-config fallback) but composes existing platform
primitives. End result: configurable widget rendering with zero new
chart-library deps and full visual consistency.

If a future requirement genuinely needs Recharts — e.g. a chart
shape `@visx` cannot express — the right path is a separate epic
that updates the chart-platform guardrail in lockstep with the
install. Bypassing the guard inside this PR would be wrong.

## Rendering architecture

```
src/components/ui/dashboard-widgets/
  ├── types.ts              ChartType + per-shape config + discriminated payload
  ├── ChartRenderer.tsx     typed dispatcher (line / bar / area / donut /
  │                         gauge / sparkline / kpi)
  ├── DashboardWidget.tsx   header + actions + resize handle + content slot
  └── index.ts              barrel
```

Two independent primitives:

  - **`<ChartRenderer>`** — pure dispatcher. Takes a discriminated
    `(chartType, config)` payload and the optional lifecycle envelope
    (`state`, `error`). Renders the right Inflect chart primitive.
    No state, no fetching, no config-menu — purely visualization.

  - **`<DashboardWidget>`** — generic shell. Header (title + subtitle
    + actions slot), content slot (any React node), optional resize
    handle. Uses the existing `glass-card` shell and design tokens.
    No knowledge of chart types — it can host a `<ChartRenderer>`,
    a `<DataTable>`, an `<EmptyState>`, or any custom React content
    a future widget kind needs.

Composition pattern callers use:

```tsx
<DashboardWidget
    title="Coverage"
    subtitle="org-wide"
    actions={<ConfigMenuTrigger />}
>
    <ChartRenderer
        chartType="kpi"
        config={{ label: 'Coverage', value: 75.3, format: 'percent' }}
    />
</DashboardWidget>
```

## Chart types implemented

| `chartType` | Primitive backing it | Module |
| ----------- | -------------------- | ------ |
| `kpi` | `<KpiCard>` | `@/components/ui/KpiCard` |
| `donut` | `<DonutChart>` | `@/components/ui/DonutChart` |
| `gauge` | `<ProgressCircle>` | `@/components/ui/progress-circle` |
| `sparkline` | `<MiniAreaChart>` | `@/components/ui/mini-area-chart` |
| `line` | `<TimeSeriesChart type="area">` + `<Areas>` | `@/components/ui/charts` |
| `area` | `<TimeSeriesChart type="area">` + `<Areas>` | `@/components/ui/charts` |
| `bar` | `<TimeSeriesChart type="bar">` + `<Bars>` | `@/components/ui/charts` |

Note: `line` is a callable shape that today renders as the same
filled-area primitive as `area`. The platform's `<Areas>` doesn't
have a stroke-only variant yet; adding one is a chart-platform
follow-up. Callers that ask for `line` get the right semantic
intent and an upgrade path that's a one-place edit.

## Widget wrapper behavior

**Header (when `title || subtitle || actions` are set):**
  - `border-b border-border-subtle` separator
  - title: `text-sm font-semibold text-content-emphasis truncate`
  - subtitle: `text-xs text-content-muted truncate`
  - actions slot: right-aligned, `data-widget-actions`-anchored

**Body slot:**
  - `flex flex-col p-4`, `flex-1 min-h-0` when `fillBody=true` (default)
  - `data-widget-body` anchor
  - Content can fill via `h-full w-full` because the parent is a
    flex column with a measured height — the chart-platform's
    `<ParentSize>` measures correctly inside this layout

**Resize handle (when `showResizeHandle=true`, default):**
  - `absolute bottom-1 right-1 size-4 cursor-se-resize`
  - `react-resizable-handle` class — matches `react-grid-layout`'s
    default selector so prompt 3's grid integration wraps this
    presentational handle transparently
  - `aria-hidden` — resize is a grid-level interaction, not a
    widget-level one (the wrapper is presentational at this prompt;
    drag wiring lands with the grid)

**A11y:**
  - When `title` is set, wrapper exposes `role="region"
    aria-label={title}` so screen readers see a labelled landmark
  - When `title` is unset, the wrapper is purely structural and the
    role is dropped to keep the landmark tree clean

## Files

| File | Role |
| ---- | ---- |
| `src/components/ui/dashboard-widgets/types.ts` | NEW — `ChartType` + discriminated `ChartRendererProps` + per-shape config interfaces |
| `src/components/ui/dashboard-widgets/ChartRenderer.tsx` | NEW — typed dispatcher; lifecycle states; malformed-config fallback |
| `src/components/ui/dashboard-widgets/DashboardWidget.tsx` | NEW — generic widget shell |
| `src/components/ui/dashboard-widgets/index.ts` | NEW — barrel export |
| `tests/rendered/dashboard-widget-renderer.test.tsx` | NEW — 22 jsdom tests |
| `docs/implementation-notes/2026-04-30-epic-41-chart-renderer-and-widget-wrapper.md` | NEW — this note |

## Tests added

22 rendered tests under jsdom:

  - **Per shape (8)**: kpi (with value), kpi (null → `—`), donut
    (legend + center labels + segments), donut empty config, gauge
    (progressbar role + label), gauge NaN fallback, sparkline,
    line/area/bar (×3 via `it.each`)
  - **Lifecycle (4)**: `state="loading"` skeleton,
    `state="error"` with message, `state="empty"` short-circuits
    non-KPI shapes, `state="empty"` on KPI lets the KpiCard own
    its dim placeholder
  - **DashboardWidget wrapper (7)**: header rendering, region
    landmark, actions slot anchored to `data-widget-actions`,
    resize handle visibility (default + opt-out), header skipped
    when no title/subtitle/actions, `data-widget-id` forwarding,
    end-to-end ChartRenderer composition
  - **Coupling (1)**: renderer + wrapper compose without leaking
    layout boundaries (sparkline inside wrapper renders cleanly)

## Verification

- `npx jest tests/rendered/dashboard-widget-renderer.test.tsx` → **22/22**
- Chart-platform guardrails (`chart-platform-foundation`,
  `dashboard-chart-bypass`) → **49/49** (the recharts-banned-list
  invariant continues to pass)
- `npm run typecheck` → clean
- `npm run lint` → no warnings on new files

## Decisions

  - **Why a separate `dashboard-widgets/` directory.** The chart
    platform under `@/components/ui/charts/` is interactive
    primitives (axes, areas, bars). The compact widgets
    (`KpiCard`, `DonutChart`, `MiniAreaChart`, `ProgressCircle`)
    sit at the top level of `ui/`. The renderer + widget wrapper
    are a third tier: *composition* of those compact widgets +
    interactive charts behind a typed contract. Putting them
    under `dashboard-widgets/` makes the intent obvious and avoids
    polluting the chart platform's barrel.

  - **Why discriminate `ChartRenderer` props on `chartType`.** A
    single shape `(chartType, data, config)` would force a
    `Record<string, unknown>` config and lose all per-shape
    typing. The discriminated union means a caller's typo
    (e.g. `format` on a donut config) fails at compile time, and
    the dispatcher's switch is exhaustive — adding a new shape
    requires updating both the union AND the switch, with TS
    catching the omission.

  - **Why the renderer accepts an explicit `state` prop.** The
    renderer is a presentational primitive — it doesn't fetch
    data. The owning page / widget container knows whether the
    payload is loading, empty, errored, or ready. Plumbing
    `state` through gives every consumer a uniform story without
    the renderer having to grow data-fetching concerns. Mirrors
    how the chart platform's `chartReady / Loading / Empty /
    Error` constructors compose with a state machine outside the
    chart.

  - **Why malformed-config fallback (rather than throw).** A
    dashboard renders many widgets in parallel. One row with a
    bad config blob (e.g. donut with `segments: undefined`)
    shouldn't blank the entire page. The fallback is the inline
    empty state — visually identical to "no data," which is the
    least-confusing failure surface for an end user.

  - **Why the wrapper sets the `react-resizable-handle` class
    today.** It's the upstream selector `react-grid-layout`
    uses by default. Emitting it presentationally now (before the
    grid is wired) means prompt 3 doesn't have to re-prop or
    duplicate the handle — the existing wrapper drops into the
    grid item slot transparently. The trade-off (a useless visual
    affordance for one prompt) is worth the clean integration.

  - **Why `line` collapses to `area`.** The chart-platform's
    `Areas` primitive doesn't have a stroke-only variant. Adding
    one is a separate platform PR. In the meantime, `line` is a
    callable shape that today renders as a filled area — callers
    express the right semantic intent and we get a one-place
    upgrade path when the platform gains the variant.
