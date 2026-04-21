/**
 * Epic 59 — chart platform smoke test.
 *
 * Imports the public barrel and asserts each canonical symbol is
 * a real runtime value (component function, hook, or context). This
 * catches the class of regression where a TypeScript refactor leaves
 * the barrel importable under `tsc --noEmit` but fails at runtime
 * — e.g. a circular re-export or a stale `export *` that tree-shakes
 * to `undefined`.
 *
 * The full rendering of `<TimeSeriesChart>` and friends is deferred
 * to the dedicated chart-behaviour suites later in Epic 59; this
 * file is deliberately just an import-boundary smoke.
 */

import * as Charts from '@/components/ui/charts';

describe('Chart platform — barrel smoke', () => {
    it('exports the canonical chart components', () => {
        expect(typeof Charts.Areas).toBe('function');
        expect(typeof Charts.Bars).toBe('function');
        expect(typeof Charts.XAxis).toBe('function');
        expect(typeof Charts.YAxis).toBe('function');
        expect(typeof Charts.TimeSeriesChart).toBe('function');
        expect(typeof Charts.FunnelChart).toBe('function');
        expect(typeof Charts.ChartTooltipSync).toBe('function');
    });

    it('exports the coordination hooks + contexts', () => {
        expect(typeof Charts.useChartContext).toBe('function');
        expect(typeof Charts.useChartTooltipContext).toBe('function');
        expect(Charts.ChartContext).toBeDefined();
        expect(Charts.ChartTooltipContext).toBeDefined();
    });

    it('exports the ChartState constructors + narrowing helper', () => {
        expect(typeof Charts.chartLoading).toBe('function');
        expect(typeof Charts.chartEmpty).toBe('function');
        expect(typeof Charts.chartError).toBe('function');
        expect(typeof Charts.chartReady).toBe('function');
        expect(typeof Charts.isChartReady).toBe('function');

        // Round-trip: constructed states narrow correctly.
        const ready = Charts.chartReady({ n: 1 });
        const loading = Charts.chartLoading();
        expect(Charts.isChartReady(ready)).toBe(true);
        expect(Charts.isChartReady(loading)).toBe(false);
    });

    it('type-only exports compile (reached via `typeof` at value level is undefined, which is expected)', () => {
        // Type-only exports (`AccessorFn`, `Datum`, `ChartProps`, …)
        // erase to nothing at runtime. This is the compile-time
        // contract the `.d.ts` of the barrel owns; a regression
        // would surface as a TypeScript error in a downstream
        // consumer before ever reaching this test. We assert the
        // runtime namespace doesn't define a value under these
        // names — the *absence* of a runtime export is correct for
        // `export type { … }` statements.
        const rt = Charts as unknown as Record<string, unknown>;
        // `Datum` is type-only — it must not appear as a runtime
        // value. (The `Series` helper, by contrast, IS type-only
        // too; asserting on `Datum` alone keeps the test cheap.)
        expect(rt.Datum).toBeUndefined();
    });
});
