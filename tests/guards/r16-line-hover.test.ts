/**
 * Roadmap-16 PR-8 — LineChart hover (crosshair + focus point).
 *
 * Phase 3 closes. R16-PR7 shipped the resting LineChart; PR-8
 * wires the hover affordances:
 *
 *   • Vertical crosshair line at the cursor's x-position
 *     (dashed, muted) — orients the user along the time axis.
 *
 *   • Focus point — a brand-gradient circle at the nearest
 *     data point, scaled by R16-PR4's `CHART_HOVER_POINT_SCALE`
 *     (1.05×) to read as "this is the point you're inspecting".
 *
 *   • Pointer + touch event handlers on a transparent overlay
 *     so the chart picks up movement across the full plot
 *     area (not just along the line stroke).
 *
 *   • Bisector-driven nearest-point lookup so the focus snaps
 *     to whichever data point's x is closest to the cursor.
 *
 * Seven load-bearing invariants:
 *
 *   1. The render-prop body is lifted into a `<LineChartInner>`
 *      component — hooks can't run inside the ChartFrame
 *      render-prop callback (it's not a real React component).
 *
 *   2. State + bisector wired:
 *        useState<number | null>(null) for hoveredIndex
 *        bisector(d => d.date).center for nearest-point lookup
 *
 *   3. Imports localPoint from `@visx/event` for cursor-to-
 *      SVG-coordinate translation.
 *
 *   4. Imports CHART_HOVER_POINT_SCALE from R16-PR4 (the 1.05×
 *      scale).
 *
 *   5. Renders a dashed vertical crosshair line at the hovered
 *      x-position when a point is hovered.
 *
 *   6. Renders a `<motion.circle>` focus point at the hovered
 *      (x, y) that scales to CHART_HOVER_POINT_SCALE on engage.
 *
 *   7. Transparent `<rect>` overlay with `onMouseMove` /
 *      `onMouseLeave` / `onTouchMove` / `onTouchEnd` handlers.
 *      No clicks intercepted — the chart stays semantically
 *      pure (read-only data view).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const LINE_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/line-chart.tsx'),
    'utf8',
);

describe('Roadmap-16 PR-8 — LineChart hover', () => {
    describe('inner component lift', () => {
        it('extracts <LineChartInner> from the render-prop body', () => {
            // Hooks can't run inside the ChartFrame render-prop
            // callback — it's a function, not a real component.
            // PR-8 lifts the render-prop body into a real
            // component so useState / useMemo / useCallback can
            // do their work.
            expect(LINE_SRC).toMatch(/function\s+LineChartInner\s*\(/);
        });
    });

    describe('imports', () => {
        it('imports localPoint from @visx/event', () => {
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?localPoint[\s\S]*?\}\s*from\s*['"]@visx\/event['"]/,
            );
        });

        it('imports bisector from d3-array', () => {
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?bisector[\s\S]*?\}\s*from\s*['"]d3-array['"]/,
            );
        });

        it('imports Line from @visx/shape (for the crosshair)', () => {
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?Line[\s\S]*?\}\s*from\s*['"]@visx\/shape['"]/,
            );
        });

        it('imports CHART_HOVER_POINT_SCALE from chart-motion', () => {
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?CHART_HOVER_POINT_SCALE[\s\S]*?\}\s*from\s*['"]\.\/chart-motion['"]/,
            );
        });

        it('imports useState, useMemo, useCallback from react', () => {
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?useState[\s\S]*?\}\s*from\s*['"]react['"]/,
            );
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?useMemo[\s\S]*?\}\s*from\s*['"]react['"]/,
            );
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?useCallback[\s\S]*?\}\s*from\s*['"]react['"]/,
            );
        });
    });

    describe('state + bisector', () => {
        it('tracks hoveredIndex via useState', () => {
            expect(LINE_SRC).toMatch(
                /useState<number\s*\|\s*null>\(null\)/,
            );
        });

        it('initialises bisector(d => d.date).center for nearest-point lookup', () => {
            // The .center variant returns the index of the CLOSEST
            // point. .left / .right would bias to one side, which
            // feels off when the cursor sits between two points.
            expect(LINE_SRC).toMatch(
                /bisector[\s\S]*?\(\s*d\s*\)\s*=>\s*d\.date[\s\S]*?\.center/,
            );
        });
    });

    describe('crosshair + focus point rendering', () => {
        it('renders a dashed vertical crosshair Line on hover', () => {
            // Dashed line is the canonical "guide" affordance.
            // strokeDasharray="3 3" gives a small dot pattern
            // that reads as auxiliary, not as data.
            expect(LINE_SRC).toMatch(/<Line[\s\S]*?strokeDasharray="3 3"/);
        });

        it('crosshair runs from y=0 to y=innerHeight (full plot height)', () => {
            expect(LINE_SRC).toMatch(
                /from=\{\s*\{\s*x:\s*hoveredX\s*,\s*y:\s*0\s*\}\s*\}/,
            );
            expect(LINE_SRC).toMatch(
                /to=\{\s*\{\s*x:\s*hoveredX\s*,\s*y:\s*innerHeight\s*\}\s*\}/,
            );
        });

        it('renders <motion.circle> as the focus point', () => {
            expect(LINE_SRC).toMatch(/<motion\.circle\b/);
        });

        it('focus point scales to CHART_HOVER_POINT_SCALE on engage', () => {
            // The 1.05× scale from R16-PR4. Subtle on a 5-px-r
            // circle; the eye picks it up as "this point is alive".
            expect(LINE_SRC).toMatch(
                /scale:\s*CHART_HOVER_POINT_SCALE/,
            );
        });

        it('crosshair + focus point are conditionally rendered when hoveredPoint exists', () => {
            // Without the guard, the crosshair would render at
            // x=0 on first mount before any hover happens.
            expect(LINE_SRC).toMatch(/\{hoveredPoint\s*&&/);
        });
    });

    describe('pointer overlay + event handlers', () => {
        it('renders a transparent <rect> as the pointer-event overlay', () => {
            // Without an overlay, mouse events only fire when
            // the cursor sits exactly on the line stroke (~2px
            // wide). The overlay captures movement across the
            // full plot area.
            expect(LINE_SRC).toMatch(/fill="transparent"/);
        });

        it('wires onMouseMove + onMouseLeave', () => {
            expect(LINE_SRC).toMatch(
                /onMouseMove=\{handlePointerMove\}/,
            );
            expect(LINE_SRC).toMatch(
                /onMouseLeave=\{handlePointerLeave\}/,
            );
        });

        it('wires onTouchMove + onTouchEnd (touch parity)', () => {
            // Touch events fire on mobile / tablet. Without them
            // the focus point only works for mouse-driven hover.
            expect(LINE_SRC).toMatch(/onTouchMove=/);
            expect(LINE_SRC).toMatch(/onTouchEnd=/);
        });

        it('handlePointerMove uses localPoint to resolve cursor → SVG coords', () => {
            expect(LINE_SRC).toMatch(/localPoint\s*\(\s*event\s*\)/);
        });

        it('handlePointerMove subtracts padding.left to map to plot space', () => {
            // localPoint returns SVG-coordinate space; the plot
            // area is offset by `padding.left`. Without the
            // subtraction the bisector would always be off by
            // that margin.
            expect(LINE_SRC).toMatch(/point\.x\s*-\s*padding\.left/);
        });
    });
});
