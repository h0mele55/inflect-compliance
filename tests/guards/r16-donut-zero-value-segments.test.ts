/**
 * R16 hotfix (2026-05-13) — DonutChart zero-value segment handling.
 *
 * Real-world bug observed on the dashboard's Risk Distribution
 * donut: 4 segments {Critical: 0, High: 1, Medium: 1, Low: 1}
 * rendered as a SINGLE thin orange crescent instead of three
 * equal arcs.
 *
 * Root cause: R16-PR5 rewrote the DonutChart to feed the full
 * `segments` array (including zero-value entries) into visx's
 * `<Pie>`. d3-shape's pie generator combined with `padAngle >
 * 0` produces malformed geometry when any arc has value 0 — the
 * padAngle gets subtracted from each arc's range, and a zero-
 * range arc goes negative. Its neighbours then stretch into the
 * gap and overpaint the visible segments.
 *
 * The pre-R16 stroke-dasharray implementation handled this by
 * `return null` for zero-value segments inside the .map()
 * callback. The R16 rebuild lost the filter.
 *
 * Fix: compute `pieSegments = segments.filter(s => s.value > 0)`
 * and pass that to `<Pie data={pieSegments}>`. The legend below
 * the chart still renders every entry (including zero) because
 * the legend is a separate concern from the chart geometry.
 *
 * Three load-bearing invariants:
 *
 *   1. `pieSegments` constant declared with the `value > 0`
 *      filter.
 *   2. `<Pie>` consumes `pieSegments` (not raw `segments`).
 *   3. The legend continues to map over the full `segments`
 *      array — zero-value entries still appear in the legend
 *      so the user sees "Critical: 0" rather than silently
 *      missing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const DONUT_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/DonutChart.tsx'),
    'utf8',
);

describe('R16 hotfix — DonutChart zero-value segment handling', () => {
    it('declares pieSegments filtered to value > 0', () => {
        // The filter is what avoids the malformed Pie geometry
        // when any segment has value 0 alongside a positive
        // padAngle.
        expect(DONUT_SRC).toMatch(
            /const\s+pieSegments\s*=\s*segments\.filter\s*\(\s*\(\s*s\s*\)\s*=>\s*s\.value\s*>\s*0\s*\)/,
        );
    });

    it('<Pie> consumes pieSegments (not the raw segments array)', () => {
        expect(DONUT_SRC).toMatch(/<Pie[\s\S]*?data=\{pieSegments\}/);
        // And it does NOT consume `data={segments}` directly.
        expect(DONUT_SRC).not.toMatch(/<Pie[\s\S]*?data=\{segments\}/);
    });

    it('legend still maps over the full segments array (zero entries visible)', () => {
        // The legend section is below the SVG — it iterates the
        // full `segments` so the user still sees "Critical: 0"
        // even though the chart's <Pie> only renders the
        // non-zero segments.
        expect(DONUT_SRC).toMatch(/showLegend\s*&&[\s\S]*?segments\.map\(\(seg\)/);
    });
});
