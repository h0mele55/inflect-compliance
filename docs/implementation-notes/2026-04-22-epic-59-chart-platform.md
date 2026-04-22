# 2026-04-22 — Epic 59 chart platform rollout + hardening

**Commit:** `b99be1c feat(epic-59): dashboard chart platform rollout + hardening`

(Session span: also includes earlier Epic 59 commits for axis/layout primitives, TimeSeriesChart, and MiniAreaChart / ProgressBar / ProgressCircle — those were already on `main` before this session started. This note covers the **rollout + hardening** prompt that migrated real dashboard consumers onto the platform and added durability.)

## What landed

- Executive dashboard's four TrendCards (`/t/<slug>/dashboard`) migrated from a hand-rolled `<polyline>` SVG (`TrendLine`) to `TimeSeriesChart` + `<Areas>` composed inside a new reusable `TrendCard` widget. Date-aware x-axis, hover tooltips, token-backed colours.
- Executive dashboard's six KPI cards stream in 30-day MiniAreaChart sparklines for coverage / risks / evidence / findings via a Suspense-wrapped `KpiGridWithTrends`. Numbers render instantly; sparklines join once the snapshot fetch resolves.
- Controls dashboard: hand-rolled Implementation Progress bar swapped for shared `ProgressBar` (variant-driven by %).
- Tests dashboard: local `ProgressBar` component deleted; six call sites migrated to shared primitive; added `ProgressCircle` headline gauge above the Result Distribution bars.
- `src/components/ui/TrendLine.tsx` deleted (zero remaining consumers).
- Per-status distribution bars on controls / risks / tasks / vendors dashboards tagged with `// chart-bypass-ok:` pending a future `DistributionBar` primitive.

## Files

**New**
- `src/components/ui/TrendCard.tsx` — reusable dashboard trend tile
- `docs/charts.md` — chart platform decision tree (contributor guide)
- `tests/guardrails/dashboard-chart-bypass.test.ts` — static-scan guard
- `tests/rendered/dashboard-trend-integration.test.tsx`, `trend-card.test.tsx`, `kpi-card-trend.test.tsx`

**Updated**
- `src/app/t/[tenantSlug]/(app)/dashboard/page.tsx` — wire TrendCard + KpiGridWithTrends
- `src/app/t/[tenantSlug]/(app)/controls/dashboard/page.tsx`, `risks/dashboard/page.tsx`, `tasks/dashboard/page.tsx`, `vendors/dashboard/page.tsx` — `chart-bypass-ok:` annotations on distribution bars
- `src/app/t/[tenantSlug]/(app)/tests/dashboard/page.tsx` — shared `ProgressBar` + `ProgressCircle`
- `src/components/ui/KpiCard.tsx` — inline MiniAreaChart sparkline slot
- `CLAUDE.md` — new "UI Platform — Epics 51–59" section pointing at `docs/charts.md`

**Deleted**
- `src/components/ui/TrendLine.tsx`

## Guardrail

`tests/guardrails/dashboard-chart-bypass.test.ts` statically scans every `(app)/*/dashboard/page.tsx` for:
1. Legacy `TrendLine` imports (resurrect-protection)
2. Raw `<polyline>` SVG sparklines
3. Inline `style={{ width: `${…}%` }}` progress bars

Suppressible with a `// chart-bypass-ok:` comment within ±4 lines, so known-intentional categorical bars can stay without weakening the net for new additions.

## Decisions

- **TrendCard lives in `src/components/ui/`, not `src/components/ui/charts/`** — per the charts barrel's explicit non-goal docstring. `charts/` is for interactive chart primitives; compact KPI widgets are peer components.
- **Suspense fallback for KpiGrid** is a sync render of the grid *without* sparklines. Numbers never wait on the daily-snapshot read. The sparklines pop in once the async trend fetch resolves.
- **Colour mapping**: hardcoded hexes (`#22c55e`, `#f59e0b`, `#ef4444`, `#a855f7`) swapped for token-backed Tailwind classes (`text-emerald-500`, `text-amber-500`, `text-red-500`, `text-purple-500`) everywhere trend cards live. `docs/charts.md` pins the rule.
- **Per-status distribution bars left alone** — they're categorical (one row per status, proportional widths), not single-metric progress bars. Wouldn't map cleanly onto the existing `ProgressBar` variant enum. Tagged `chart-bypass-ok:` so the guard passes and the intent is recorded.
- **CLAUDE.md got a new "UI Platform — Epics 51–59" section** pointing contributors at the decision-tree doc for each epic's primitives.
