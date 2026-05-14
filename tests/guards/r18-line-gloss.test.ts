/**
 * R18-PR7 — LineChart glossy stroke + bubbly focus point.
 *
 * Two changes to the R16 LineChart:
 *
 *   1. The area-under-line gets a gloss overlay — the same two-
 *      layer paint the donut (PR-4) and mini-area (PR-6) use, so
 *      the filled region reads as a glossy surface.
 *
 *   2. The hover focus point scales in through a SPRING instead
 *      of a plain ease-out — it overshoots its target size and
 *      settles, "bubbling out" toward the pointer.
 *
 * Five load-bearing invariants:
 *
 *   1. A `default`-intensity `<ChartGloss>` def is rendered.
 *      `default` (not `subtle`) — the LineChart is a full-size
 *      chart, unlike the tiny mini-area sparkline.
 *
 *   2. The area gloss is a SECOND `<Area>` with the SAME
 *      geometry props (data / x / y0 / y1 / curve) as the colour
 *      `<Area>`, filled with `url(#<glossId>)`. Two areas, same
 *      shape, stacked.
 *
 *   3. The gloss `<Area>` is inert — `aria-hidden` +
 *      `pointerEvents="none"`. It must not intercept the plot-
 *      area hover overlay underneath the focus-point logic.
 *
 *   4. The focus point's scale transition is a `spring` — the
 *      overshoot is what makes it "bubble." A `duration` +
 *      `ease` transition would just grow.
 *
 *   5. The focus point's spring starts from `scale: 0`, not
 *      `scale: 1`. A 1 → 1.05 spring would barely register; 0 →
 *      1.05 → 1 grows the bubble from nothing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/line-chart.tsx'),
    'utf8',
);

describe('R18-PR7 — LineChart glossy stroke + bubbly focus point', () => {
    it('imports ChartGloss + chartGlossId', () => {
        expect(SRC).toMatch(
            /import\s*\{\s*ChartGloss,\s*chartGlossId,?\s*\}\s*from\s*['"]\.\/chart-gloss['"]/,
        );
    });

    it('renders a default-intensity <ChartGloss> def', () => {
        // default, not subtle — full-size chart.
        expect(SRC).toMatch(
            /<ChartGloss[\s\S]*?direction="vertical"[\s\S]*?intensity="default"/,
        );
    });

    it('the area gloss is a second <Area> filled with the gloss def', () => {
        // Two <Area> elements inside the showArea block: the
        // colour layer + the gloss layer.
        const areaCount = (SRC.match(/<Area\b/g) ?? []).length;
        expect(areaCount).toBeGreaterThanOrEqual(2);
        expect(SRC).toMatch(
            /<Area[\s\S]*?fill=\{`url\(#\$\{chartGlossId\(chartId\)\}\)`\}/,
        );
    });

    it('the gloss <Area> is inert (aria-hidden + pointerEvents none)', () => {
        expect(SRC).toMatch(
            /fill=\{`url\(#\$\{chartGlossId\(chartId\)\}\)`\}[\s\S]*?aria-hidden="true"[\s\S]*?pointerEvents="none"/,
        );
    });

    it('the focus point scales in through a spring (not a plain ease-out)', () => {
        // The transition for `scale` must be a spring — the
        // overshoot is the "bubble."
        expect(SRC).toMatch(
            /scale:\s*\{\s*type:\s*['"]spring['"],\s*stiffness:\s*\d+,\s*damping:\s*\d+/,
        );
    });

    it('the focus point spring starts from scale 0 (grows the bubble from nothing)', () => {
        // initial scale: 0 — a 1→1.05 spring barely registers.
        expect(SRC).toMatch(
            /<motion\.circle[\s\S]*?initial=\{\{\s*scale:\s*0,/,
        );
    });
});
