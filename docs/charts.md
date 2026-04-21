# Chart Platform (Epic 59)

Inflect's chart platform lives under `src/components/ui/charts/`
(interactive primitives) and alongside it in `src/components/ui/`
(compact widgets). This doc is the decision tree for contributors —
pick the right primitive before writing new chart JSX.

## TL;DR — decision table

| I want to show… | Use | Lives in |
|---|---|---|
| A **time-series** someone will hover/scrub/compare | `TimeSeriesChart` + `Areas`/`Bars` + `XAxis`/`YAxis` | `@/components/ui/charts` |
| A **sparkline** inside a KPI tile / table cell (no tooltip, no axes) | `MiniAreaChart` | `@/components/ui/mini-area-chart` |
| A **dashboard trend tile** (label + current value + hoverable sparkline) | `TrendCard` | `@/components/ui/TrendCard` |
| A **horizontal progress metric** (one or many, stacked rows) | `ProgressBar` | `@/components/ui/progress-bar` |
| A **headline gauge** (single percentage that deserves its own real estate) | `ProgressCircle` | `@/components/ui/progress-circle` |
| A **segmented % bar with a legend** (e.g. control coverage breakdown) | `ProgressCard` | `@/components/ui/ProgressCard` |
| A **percent-share donut** | `DonutChart` | `@/components/ui/DonutChart` |
| A **risk heat-map** | `RiskHeatmap` | `@/components/ui/RiskHeatmap` |

If none of the above fits, **don't open a new file with raw `<svg>` in a
dashboard page**. Ask about extending the platform instead — a one-off
hand-rolled chart is exactly the pattern this epic replaced.

## `TimeSeriesChart`

The canonical interactive chart. Renders one or more series with a
time-based x-axis, a numeric y-axis, responsive sizing, and a shared
tooltip-hover surface.

```tsx
import {
    Areas,
    TimeSeriesChart,
    XAxis,
    YAxis,
    type TimeSeriesDatum,
} from "@/components/ui/charts";

<TimeSeriesChart
    data={data} // TimeSeriesDatum<YourDatum>[]
    series={[
        {
            id: "coverage",
            isActive: true,
            valueAccessor: (d) => d.values.coverage,
            colorClassName: "text-emerald-500",
        },
    ]}
    type="area" // or "bar"
>
    <YAxis showGridLines />
    <Areas />
    <XAxis />
</TimeSeriesChart>
```

Rules:

- **Always** set `isActive: true` on at least one series — `<Areas>` /
  `<Bars>` filter by it.
- **Use token-backed classes** (`text-emerald-500`, `text-content-error`)
  on `colorClassName`. Never hardcode hex in call sites.
- **Leave axes off** if the chart is a compact sparkline — reach for
  `MiniAreaChart` instead unless you actually need hover/tooltip.
- **Empty-state handling is built in.** Pass a custom `emptyState` when
  the default "No data available" is too loud for the surface (e.g.
  sparklines inside cards should use a soft baseline instead).

## `MiniAreaChart`

Compact sparkline. No tooltip, no axes, token-backed colour variants.
Renders a dashed baseline when `data` is empty.

```tsx
<MiniAreaChart
    data={[{ date, value }, ...]}
    variant="success"          // brand | success | warning | error | info | neutral
    aria-label="Coverage trend — last 30 days"
/>
```

Use it when the trend *direction* is the signal and hover detail isn't
required. Inside KPI cards, table cells, summary tiles.

## `TrendCard`

A `MiniAreaChart`-style tile with a header row (label + current value)
and a **`TimeSeriesChart`**-backed hoverable sparkline below. The
dashboard consumer — use it whenever you have a labelled trend in a
grid of trend cards.

```tsx
<TrendCard
    label="Coverage"
    value={75.3}
    format="%"
    points={[{ date, value }, ...]}
    colorClassName="text-emerald-500"
/>
```

## `ProgressBar` vs `ProgressCircle`

Both are token-backed, ARIA-complete, carry the same variant tokens
(`brand | success | warning | error | info | neutral`).

**Pick `ProgressBar`** when:

- You have **several related metrics** to show together (pass/fail/
  inconclusive; or a row per framework)
- The metric reads naturally as a **horizontal segment** of 0–100%
- **Space is tight vertically** — `size="sm"` fits into a KPI tile
  or a table row
- You want a **label + value** alongside the fill (use `showValue`)

**Pick `ProgressCircle`** when:

- One metric **deserves its own headline** — a gauge the eye lands on
  first
- You want the metric to be **scannable at a distance** (donut shape
  reads faster than a thin bar at small widths)
- You're showing **overall health** summarising more granular bars
  below (the pattern used in `/tests/dashboard` Result Distribution)

Don't use both for the same metric in the same card — pick one.

## Shared chart context, tooltips, axes

Three patterns every interactive chart should follow:

### 1. Compose, don't reimplement

`TimeSeriesChart` provides `<ChartContext.Provider>` and
`<ChartTooltipContext.Provider>` wrapping its children. Every axis,
shape layer, and overlay reaches into those contexts via:

```tsx
const { data, series, xScale, yScale } = useChartContext();
const { tooltipData } = useChartTooltipContext();
```

Never re-scale, re-measure, or rebuild tooltip state inside a custom
overlay — `TimeSeriesChart` already did it.

### 2. Token-backed surfaces only

Tick colours, grid lines, axis text, and the focus ring all resolve
against design tokens already. If you pass a `colorClassName` to a
series, use `text-*` / `bg-*` / `border-*` utilities — they inherit
the light/dark theme flip.

### 3. Empty/loading/error states

`ChartState<T>` from `@/components/ui/charts` models `loading / empty /
error / ready` uniformly. Use the constructors (`chartLoading`,
`chartEmpty`, `chartError`, `chartReady`) + the type guard
(`isChartReady`) when wiring server data into a chart. Don't branch on
`data.length === 0` — the chart handles that itself and renders the
caller-provided `emptyState`.

## Do-not-bypass list

A dashboard page failing the guard in
`tests/guardrails/dashboard-chart-bypass.test.ts` almost certainly
bypassed the platform with one of these:

- Raw `<polyline>` / `<path d="M…">` SVG sparklines (use `MiniAreaChart`
  or `TrendCard`).
- Inline `<div style={{ width: \`${percent}%\` }}>` progress bars (use
  `ProgressBar`).
- `<div className="h-full bg-<color>-400 rounded-full">` — same.
- Imports of legacy files (`@/components/ui/TrendLine` — removed in
  Epic 59).

If you have a real need the platform doesn't cover, extend the
platform: add a new primitive under `src/components/ui/charts/` and
re-export it from `src/components/ui/charts/index.ts`.

## Where to look first

- Barrel: `src/components/ui/charts/index.ts`
- Canonical chart: `src/components/ui/charts/time-series-chart.tsx`
- Shared layout helpers: `src/components/ui/charts/layout.ts`
- Public types: `src/components/ui/charts/types.ts`
- Guidance tests: `tests/unit/chart-layout-helpers.test.ts`,
  `tests/rendered/time-series-chart.test.tsx`,
  `tests/rendered/micro-visuals.test.tsx`,
  `tests/rendered/trend-card.test.tsx`,
  `tests/rendered/kpi-card-trend.test.tsx`,
  `tests/guardrails/dashboard-chart-bypass.test.ts`.
