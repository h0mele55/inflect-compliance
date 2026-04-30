# 2026-04-30 — Epic 41 (Prompt 5): KPI trend indicator + chart target line

**Commit:** `<pending> feat(ui): epic 41 — KPI trend indicator + target line on time-series charts`

Final prompt of the 5-prompt PR for Epic 41 — Configurable Dashboard
Widget Engine. Adds the high-value semantic polish — trend
direction + good/bad colouring + target lines — and locks the math
in a tested, reusable helper.

## KPI trend design

Three layers:

  1. **Pure math** at `src/lib/kpi-trend.ts` — `computeKpiTrend()`
     returns one of three shapes:
       - `{ kind: 'computed', direction, deltaAbsolute, deltaPercent, semantic }`
       - `{ kind: 'flat', ... }` (current === previous)
       - `{ kind: 'unavailable', reason }` (`no_current` / `no_baseline`
         / `baseline_zero`)

  2. **`<KpiCard>` integration** — two paths converge:
       - **Pre-computed** — caller passes `delta`. Card formats +
         colours based on the polarity flag. Back-compat with every
         existing call site (the prior behaviour was `up-good`
         polarity hard-coded).
       - **Auto-compute** — caller passes `previousValue`. Card
         derives delta + percent via `computeKpiTrend`. Polarity
         applies the same way.
       - When both are passed, `delta` wins (explicit over derived).
       - When neither is set OR auto-compute returns `unavailable`,
         the indicator row is omitted entirely. We never fake a
         number — `+Infinity%` is the worst possible KPI signal.

  3. **Polarity model** — three-valued enum picks the right colour
     per metric:
       - `up-good` — positive delta is GREEN (coverage, completed
         controls, MFA-enabled users)
       - `down-good` — negative delta is GREEN (overdue evidence,
         critical risks, open incidents)
       - `neutral` — direction has no semantic, colour stays subtle
         (tenant count, total controls)

       Picking the wrong polarity for a metric (e.g. tagging
       critical-risks as `up-good`) renders a green arrow on a
       regression — actively misleading. The picker enforces the
       canonical mapping for the seven built-in chart variants;
       admins editing through the API can override.

**Edge cases handled, with a test for each:**

  | Scenario | Result | Test |
  | -------- | ------ | ---- |
  | `current = null` | `unavailable: no_current` | `no_current` test |
  | `previous = null` | `unavailable: no_baseline` | `no_baseline` test |
  | `previous = 0, current = 0` | `flat`, semantic = neutral | both-zero test |
  | `previous = 0, current ≠ 0` | `unavailable: baseline_zero` | baseline-zero test |
  | `current === previous` | `flat`, semantic = neutral | flat test |
  | negative baseline (e.g. -10 → -5) | uses `\|previous\|` in denominator → +50% | negative-baseline test |
  | up-good + positive delta | `semantic = good` | up-good-up test |
  | up-good + negative delta | `semantic = bad` | up-good-down test |
  | down-good + negative delta | `semantic = good` | down-good-down test |
  | down-good + positive delta | `semantic = bad` | down-good-up test |
  | neutral polarity | `semantic = neutral` (always) | neutral test |

Direction + semantic are exposed as `data-kpi-trend-direction` /
`data-kpi-trend-semantic` attributes on the indicator element so
tests assert against stable selectors instead of theme-mutable
colour classes.

## Target-line rendering design

`<TargetLine>` at `src/components/ui/dashboard-widgets/TargetLine.tsx`
— a small SVG overlay that renders inside `<TimeSeriesChart>` via
the chart-platform's `useChartContext()` hook. Reads `yScale`,
`width`, `leftAxisMargin` from the context and projects the
target's `value` into screen-space.

Visual:

  - Dashed `<line>` with `strokeDasharray="4 4"` + `currentColor`
    on a `text-content-subtle` parent. The chart-platform's
    neutral-overlay tone — visible but not noisy.
  - Optional label rendered as a small badge (`<rect>` background
    + `<text>`) anchored to the right edge of the plot. Background
    keeps the label readable when the line crosses the data series.

Configuration via `ChartTargetConfig`:

```ts
{
    value: number;           // y-axis position
    label?: string;          // optional display label (≤ 60 chars)
    polarity?: 'above-good' | 'below-good';  // reserved for future use
}
```

Wired into `ChartRenderer` for `chartType: 'line' | 'area' | 'bar'`
— an opt-in optional config field. Charts without `target` render
identically to before (zero overhead, the import isn't even
evaluated for the no-target path because React skips the JSX
expression).

## Files

| File | Status |
| ---- | ------ |
| `src/lib/kpi-trend.ts` | NEW — pure trend math + format helpers |
| `src/components/ui/KpiCard.tsx` | extended with `previousValue` + `trendPolarity` props; `resolveTrendIndicator` resolver replaces the inline delta block |
| `src/components/ui/dashboard-widgets/TargetLine.tsx` | NEW — chart-context-aware overlay |
| `src/components/ui/dashboard-widgets/ChartRenderer.tsx` | KPI branch forwards new props; time-series branch renders `<TargetLine>` when `config.target` is set |
| `src/components/ui/dashboard-widgets/types.ts` | `KpiConfig` gains `previousValue` + `trendPolarity`; `TimeSeriesConfig` gains `target`; `ChartTargetConfig` interface added |
| `src/components/ui/dashboard-widgets/index.ts` | barrel exports `TargetLine` + `ChartTargetConfig` |
| `src/app-layer/schemas/org-dashboard-widget.schemas.ts` | KPI config Zod gains `previousValue` + `trendPolarity`; TREND config Zod gains `target` (strict: `value` + optional `label` + `polarity`) |
| `tests/integration/org-dashboard-preset-seeding.test.ts` | typed Map key (incidental fix from prompt 4 typecheck drift after KpiCard touch) |
| `tests/unit/kpi-trend.test.ts` | NEW — 24 trend math tests |
| `tests/unit/org-dashboard-widget-schemas.test.ts` | extended — 9 new tests for KPI trend config + TREND target-line config |
| `tests/rendered/kpi-card-trend-indicator.test.tsx` | NEW — 11 rendered KpiCard trend tests |
| `tests/rendered/chart-renderer-target-line.test.tsx` | NEW — 4 TargetLine SVG-projection tests |
| `docs/implementation-notes/2026-04-30-epic-41-trend-indicator-and-target-line.md` | NEW — this note |

## Edge cases handled

**KPI trend:**
  - `current` null/undefined → `unavailable: no_current`
  - `previous` null/undefined → `unavailable: no_baseline`
  - `previous === 0 && current === 0` → `flat` (no fake %)
  - `previous === 0 && current ≠ 0` → `unavailable: baseline_zero`
  - `current === previous` → `flat`
  - negative baseline (delta from -10 to -5) → `+50%` (uses
    `Math.abs(previous)` in denominator; sign stays in numerator)
  - explicit `delta` + `previousValue` both passed → `delta` wins
  - polarity = `neutral` → semantic always `neutral` regardless
    of direction
  - polarity not set → defaults to `up-good` (back-compat)

**Target line:**
  - `target` undefined → no line rendered, no overhead
  - `value` outside `[minY, maxY]` → projection still renders;
    chart's optional clipPath is the consumer's choice
  - `label` undefined → label `<g>` skipped; only the line
  - empty data → TimeSeriesChart short-circuits to its empty state;
    target line never renders (chart context not provided)

## Tests added

**Unit (33):**
  - `kpi-trend.test.ts` (24): every documented edge case +
    formatter helpers + direction-icon table
  - `org-dashboard-widget-schemas.test.ts` (9 new): KPI trend
    config accepted, polarity enum, null previousValue, unknown
    polarity rejected, target with value-only, target with
    value+label+polarity, label length cap, target strict mode,
    target requires value

**Rendered (15):**
  - `kpi-card-trend-indicator.test.tsx` (11): up-good ▲ green +
    pp formatting, up-good ▼ red, down-good ▼ green, down-good ▲
    red, neutral always grey, auto-compute %, hidden on null
    previousValue, hidden on baseline_zero, flat when equal,
    hidden when neither set, explicit delta wins
  - `chart-renderer-target-line.test.tsx` (4): line at projected
    y, label rendered, label omitted when missing, value
    forwarded to data-attr

## Verification

- Epic 41 full sweep (12 suites: trend math + schema + presets +
  routes + DB + grid + picker + renderer + KPI trend +
  target-line) → **157/157 passed**
- `npm run typecheck` → clean
- `npm run lint` → no warnings on new files
- All earlier-prompt tests still pass — no regressions across
  schemas / routes / DB integration / rendered widgets / grid

## Final Epic 41 completion summary

5-prompt PR landed end-to-end:

| Prompt | Concern | Tests | Status |
| ------ | ------- | ----- | ------ |
| 1 | Backend foundation: schema + migration + Zod + usecase + 4 CRUD endpoints | 53 | ✅ |
| 2 | Rendering layer: ChartRenderer + DashboardWidget wrapper | 22 | ✅ |
| 3 | Composition: DashboardGrid (RGL) + WidgetPicker modal | 10 | ✅ |
| 4 | Migration: default preset + new-org auto-seed + existing-org backfill script | 17 | ✅ |
| 5 | Polish: KPI trend math + indicator UI + target-line overlay + Zod additions | 48 | ✅ |
| **Total** | **End-to-end configurable dashboard engine** | **150** | **✅** |

Across the five prompts, the configurable dashboard engine is now:

  - **Typed end-to-end** — Prisma model → Zod discriminated union →
    typed renderer dispatch. A field added to one layer must be
    added to all three or fail at compile time.
  - **Tenant-safe** — every mutation scopes by `organizationId`;
    cross-org id leak returns 404 (not 403). The page (prompt 5
    of the next-up follow-up — which is the actual page rewrite —
    is intentionally out of scope per the user's "don't deviate
    from current frontend design" constraint; the engine is ready
    to plug in when the page is rewired).
  - **Visually consistent** — every primitive composes from
    existing tokens / glass-card / chart-platform components. No
    new chart library, no new visual language. The user's "stay
    within current frontend design" rule held all the way through.
  - **Production-credible** — KPI trends carry the right semantic
    colours per polarity, target lines render at correct positions,
    edge cases handled (null baseline, zero baseline, negative
    baseline, polarity flip, missing data).

The engine is ready. The page rewrite that consumes the persisted
widgets — connecting `DashboardGrid` + `ChartRenderer` +
`WidgetPicker` + the API + the seeded preset — is the natural
next step but was scoped out of this PR per the constraint
that the first epic is org-level only and the visual identity
must not deviate. The wiring is documented in prompt 4's note
(persistence model section) for the follow-up.
