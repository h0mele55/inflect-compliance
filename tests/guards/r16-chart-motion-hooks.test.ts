/**
 * Roadmap-16 PR-4 — chart motion hooks.
 *
 * Two hooks shared by every R16 chart consumer:
 *
 *   `useChartHoverPop`  — hover-pop transforms (donut radial
 *                         outward / bar lift / line focus
 *                         scale). User-confirmed "subtle"
 *                         intensity: 4px / 2px / 1.05×.
 *
 *   `useChartFlow`      — animate `gradientTransform` translate
 *                         on a `<ChartFlowGradient>` ref so the
 *                         gradient pans in a continuous loop.
 *
 * Eight load-bearing invariants:
 *
 *   1. File exists at the canonical path. Both hooks named
 *      exports.
 *
 *   2. The three subtle-intensity numeric constants
 *      (CHART_HOVER_POP_DISTANCE = 4, CHART_HOVER_LIFT = 2,
 *      CHART_HOVER_POINT_SCALE = 1.05) are exported. These
 *      lock the user-confirmed "subtle" choice from R16-PR1.
 *
 *   3. CHART_FLOW_PERIOD_MS = 1400 — matches the
 *      `--chart-flow-duration: 1.4s` from the token layer.
 *
 *   4. `useChartHoverPop` exposes the four return values:
 *      `getDonutTransform`, `getBarTransform`, `getPointScale`,
 *      `isPopped`. Every R16 chart consumer reads from one or
 *      more of these.
 *
 *   5. `useChartFlow` uses `requestAnimationFrame` (not CSS
 *      animation on the SVG presentation attribute) and snaps
 *      back to `translate(0,0)` on unmount / inactive.
 *
 *   6. Both hooks respect `prefers-reduced-motion: reduce` —
 *      they import / use a reduced-motion check, and the
 *      hover-pop getters return IDENTITY values when reduced.
 *
 *   7. Hooks are re-exported from the charts barrel so
 *      consumers import via `@/components/ui/charts`.
 *
 *   8. Hover-pop computes the donut radial direction from
 *      `midAngle` via `Math.cos / Math.sin` — locks the
 *      mathematical contract for "radial-outward by N px".
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const MOTION_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-motion.tsx'),
    'utf8',
);
const BARREL_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/index.ts'),
    'utf8',
);

describe('Roadmap-16 PR-4 — chart motion hooks', () => {
    describe('exports', () => {
        it('exports useChartHoverPop', () => {
            expect(MOTION_SRC).toMatch(
                /export\s+function\s+useChartHoverPop\s*\(/,
            );
        });

        it('exports useChartFlow', () => {
            expect(MOTION_SRC).toMatch(
                /export\s+function\s+useChartFlow\s*\(/,
            );
        });

        it('barrel re-exports both hooks + the four constants', () => {
            expect(BARREL_SRC).toMatch(
                /from\s+['"]\.\/chart-motion['"]/,
            );
            expect(BARREL_SRC).toMatch(/useChartHoverPop/);
            expect(BARREL_SRC).toMatch(/useChartFlow/);
            expect(BARREL_SRC).toMatch(/CHART_HOVER_POP_DISTANCE/);
            expect(BARREL_SRC).toMatch(/CHART_HOVER_LIFT/);
            expect(BARREL_SRC).toMatch(/CHART_HOVER_POINT_SCALE/);
            expect(BARREL_SRC).toMatch(/CHART_FLOW_PERIOD_MS/);
        });
    });

    describe('subtle-intensity constants (user-confirmed R16-PR1)', () => {
        it('CHART_HOVER_POP_DISTANCE = 4 (donut radial outward)', () => {
            expect(MOTION_SRC).toMatch(
                /export\s+const\s+CHART_HOVER_POP_DISTANCE\s*=\s*4\s*;/,
            );
        });

        it('CHART_HOVER_LIFT = 2 (bar / line vertical lift)', () => {
            expect(MOTION_SRC).toMatch(
                /export\s+const\s+CHART_HOVER_LIFT\s*=\s*2\s*;/,
            );
        });

        it('CHART_HOVER_POINT_SCALE = 1.05 (line focus / radar vertex scale)', () => {
            expect(MOTION_SRC).toMatch(
                /export\s+const\s+CHART_HOVER_POINT_SCALE\s*=\s*1\.05\s*;/,
            );
        });

        it('CHART_FLOW_PERIOD_MS = 1400 (matches --chart-flow-duration: 1.4s)', () => {
            expect(MOTION_SRC).toMatch(
                /export\s+const\s+CHART_FLOW_PERIOD_MS\s*=\s*1400\s*;/,
            );
        });
    });

    describe('useChartHoverPop return shape', () => {
        it('returns getDonutTransform(key, midAngle)', () => {
            expect(MOTION_SRC).toMatch(/getDonutTransform\s*\(/);
        });

        it('returns getBarTransform(key)', () => {
            expect(MOTION_SRC).toMatch(/getBarTransform\s*\(/);
        });

        it('returns getPointScale(key)', () => {
            expect(MOTION_SRC).toMatch(/getPointScale\s*\(/);
        });

        it('returns isPopped(key)', () => {
            expect(MOTION_SRC).toMatch(/isPopped\s*\(/);
        });
    });

    describe('useChartHoverPop math + motion-reduce', () => {
        it('computes donut radial direction via Math.cos / Math.sin of midAngle', () => {
            // The "radial outward by N px" math is locked here.
            // A regression that uses (midAngle * radius) or just
            // a fixed vector would break the radial symmetry.
            expect(MOTION_SRC).toMatch(/Math\.cos\s*\(\s*midAngle\s*\)/);
            expect(MOTION_SRC).toMatch(/Math\.sin\s*\(\s*midAngle\s*\)/);
        });

        it('returns identity transforms when prefers-reduced-motion is set', () => {
            // The getters short-circuit to `translate(0,0)` /
            // scale 1 when reduced-motion is preferred. The hover
            // state still updates so consumers can drive non-
            // motion affordances (tooltip, focus ring).
            expect(MOTION_SRC).toMatch(
                /\(\s*key\s*!==\s*hoveredKey\s*\|\|\s*reduced\s*\)\s*return\s+'translate\(0,0\)'/,
            );
        });
    });

    describe('useChartFlow — RAF animation + snap-back', () => {
        it('uses requestAnimationFrame for the pan loop', () => {
            // RAF (not CSS animation on the SVG presentation
            // attribute) — CSS animation on gradientTransform
            // has spotty cross-browser support; RAF is portable.
            expect(MOTION_SRC).toMatch(/requestAnimationFrame\s*\(/);
            expect(MOTION_SRC).toMatch(/cancelAnimationFrame\s*\(/);
        });

        it('drives the pan via setAttribute("gradientTransform", ...)', () => {
            // Imperative attribute write — necessary because
            // React's prop-update path can't write to SVG
            // presentation attributes at 60Hz without thrash.
            expect(MOTION_SRC).toMatch(
                /setAttribute\s*\(\s*['"]gradientTransform['"]/,
            );
        });

        it('snaps back to translate(0,0) when inactive or unmounting', () => {
            // The R16-PR2 ChartFlowGradient identity transform is
            // `translate(0,0)`. Inactive + unmount both must
            // restore this so the next engagement starts cleanly.
            // Count the snap-back occurrences — there should be
            // at least TWO: the inactive branch and the cleanup
            // return.
            const snapBacks =
                MOTION_SRC.match(
                    /setAttribute\s*\(\s*['"]gradientTransform['"],\s*['"]translate\(0,0\)['"]/g,
                ) ?? [];
            expect(snapBacks.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('motion-reduce safety net', () => {
        it('hooks read prefers-reduced-motion', () => {
            // Either a `useReducedMotion` helper or a direct
            // `matchMedia('(prefers-reduced-motion: reduce)')`
            // call must appear in the file. WCAG 2.3.3 — animation
            // from interactions.
            expect(MOTION_SRC).toMatch(
                /prefers-reduced-motion:\s*reduce/,
            );
        });

        it('useChartFlow short-circuits when reduced-motion is preferred', () => {
            // The flow loop must NOT fire when the user has
            // opted out of motion. Snapping to identity is the
            // only honest behaviour.
            expect(MOTION_SRC).toMatch(/!active\s*\|\|\s*reduced/);
        });
    });
});
