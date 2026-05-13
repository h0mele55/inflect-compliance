'use client';

/**
 * Roadmap-16 PR-4 — chart motion hooks.
 *
 * Two hooks shared by every R16 chart consumer (donut, line,
 * radar, gantt):
 *
 *   `useChartHoverPop`  — hover-pop transforms for segments,
 *                         bars, and focus points. Subtle by
 *                         design (R16-PR1 user choice): 4 px
 *                         radial-outward on donut segments,
 *                         2 px upward on bars, 1.05× scale on
 *                         line/focus points.
 *
 *   `useChartFlow`      — animates `gradientTransform` translate
 *                         on a `<ChartFlowGradient>` ref so the
 *                         gradient PANS across the segment in
 *                         a continuous loop. The "flowing river
 *                         of subtle gradient colour" effect from
 *                         the user's brief.
 *
 * Both hooks respect `prefers-reduced-motion: reduce` — animations
 * snap to identity instead of running.
 *
 * The hooks return pure values / refs — they do NOT register any
 * DOM event handlers. Consumers wire `onMouseEnter` / `onMouseLeave`
 * / focus listeners themselves and feed the resulting `hoveredKey`
 * state into the hook. Keeping event wiring at the call site lets
 * different chart types use different keyboard / pointer
 * vocabularies without the hook forcing one shape.
 */
import { useEffect, useRef, useState } from 'react';

// ─── prefers-reduced-motion ───────────────────────────────────────────

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    if (typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Re-emit a `tick` whenever the OS-level preference toggles, so the
// motion hooks can resnap to identity / engage animations without a
// full remount. Subscribers update on `change` events from the
// matchMedia query.
function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(prefersReducedMotion);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        // Modern: addEventListener. Some older browsers: addListener.
        if ('addEventListener' in mq) {
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
        return undefined;
    }, []);
    return reduced;
}

// ─── useChartHoverPop ────────────────────────────────────────────────

/**
 * Pop distance for donut segments (radial-outward). Resolves
 * through `--chart-hover-pop-distance` at the token layer but
 * the math here works in user-space px, so the constant is
 * duplicated as a fallback for SSR / tests.
 */
export const CHART_HOVER_POP_DISTANCE = 4;

/**
 * Lift distance for bars / line focus points (vertical upward).
 * Same fallback rationale.
 */
export const CHART_HOVER_LIFT = 2;

/**
 * Scale factor for line focus points on hover. 1.05× is the
 * subtle multiplier the user-chosen "subtle" pop intensity
 * commits to.
 */
export const CHART_HOVER_POINT_SCALE = 1.05;

interface UseChartHoverPopArgs {
    /**
     * The currently-hovered shape's key (or `null` when nothing is
     * hovered). Consumers update this via `onMouseEnter` /
     * `onMouseLeave` / focus handlers on each shape.
     */
    hoveredKey: string | null;
    /**
     * Optional override for the radial pop distance. Defaults to
     * `CHART_HOVER_POP_DISTANCE` (4 px).
     */
    popDistance?: number;
    /**
     * Optional override for the bar / line lift distance. Defaults
     * to `CHART_HOVER_LIFT` (2 px).
     */
    liftDistance?: number;
}

interface ChartHoverPopReturn {
    /**
     * SVG `transform` attribute for a donut segment. The segment
     * pops outward in the direction of its mid-angle by the
     * configured pop distance.
     *
     * @param key       Stable key identifying this segment.
     * @param midAngle  Mid-angle of the segment in radians (0 at
     *                  3 o'clock, positive clockwise — visx's
     *                  `Arc` convention).
     */
    getDonutTransform(key: string, midAngle: number): string;
    /**
     * SVG `transform` attribute for a bar / column. The bar lifts
     * upward (negative y) by the configured lift distance.
     */
    getBarTransform(key: string): string;
    /**
     * Scale factor for a line focus point or radar vertex. 1.0
     * when not hovered, `CHART_HOVER_POINT_SCALE` when hovered.
     */
    getPointScale(key: string): number;
    /** Whether the given key is currently popped. */
    isPopped(key: string): boolean;
}

/**
 * Hover-pop transforms for chart shapes.
 *
 * Consumer pattern:
 *
 *     const [hoveredKey, setHoveredKey] = useState<string | null>(null);
 *     const pop = useChartHoverPop({ hoveredKey });
 *
 *     return arcs.map((arc) => (
 *       <g
 *         key={arc.key}
 *         transform={pop.getDonutTransform(arc.key, arc.midAngle)}
 *         onMouseEnter={() => setHoveredKey(arc.key)}
 *         onMouseLeave={() => setHoveredKey(null)}
 *       >
 *         …
 *       </g>
 *     ));
 *
 * Motion-reduce: when `prefers-reduced-motion: reduce` is set,
 * every getter returns the IDENTITY value (zero translate,
 * scale 1). The hover state still updates so consumers can use
 * `pop.isPopped(key)` to drive non-motion affordances (focus
 * ring, tooltip, etc.).
 */
export function useChartHoverPop({
    hoveredKey,
    popDistance = CHART_HOVER_POP_DISTANCE,
    liftDistance = CHART_HOVER_LIFT,
}: UseChartHoverPopArgs): ChartHoverPopReturn {
    const reduced = useReducedMotion();

    return {
        getDonutTransform(key, midAngle) {
            if (key !== hoveredKey || reduced) return 'translate(0,0)';
            const dx = Math.cos(midAngle) * popDistance;
            const dy = Math.sin(midAngle) * popDistance;
            return `translate(${dx.toFixed(3)},${dy.toFixed(3)})`;
        },
        getBarTransform(key) {
            if (key !== hoveredKey || reduced) return 'translate(0,0)';
            return `translate(0,${-liftDistance})`;
        },
        getPointScale(key) {
            if (key !== hoveredKey || reduced) return 1;
            return CHART_HOVER_POINT_SCALE;
        },
        isPopped(key) {
            return key === hoveredKey;
        },
    };
}

// ─── useChartFlow ────────────────────────────────────────────────────

/**
 * Period of the gradient-flow cycle, in milliseconds. Matches
 * `--chart-flow-duration: 1.4s` from the R16-PR1 token layer.
 * Duplicated here as a fallback for SSR / tests where CSS vars
 * don't resolve.
 */
export const CHART_FLOW_PERIOD_MS = 1400;

interface UseChartFlowArgs {
    /**
     * Whether the flow animation should be running. Typically
     * driven by the same `hoveredKey === key` predicate the
     * hover-pop hook reads.
     */
    active: boolean;
    /**
     * Distance to pan the gradient before resetting. Should
     * match the gradient's repeat unit — for the
     * `<ChartFlowGradient>` 3-stop cyclic pattern at
     * `userSpaceOnUse`, this is the SVG-coordinate distance
     * over which one full `start → end → start` cycle spans.
     * Typical value: the chart's width (horizontal flow) or
     * height (vertical flow).
     */
    distance: number;
    /**
     * Direction of the pan. Must match the
     * `<ChartFlowGradient direction={...}>` passed to the
     * gradient def — otherwise the pan happens along the wrong
     * axis and the colour cycle reads as a no-op.
     */
    direction?: 'horizontal' | 'vertical';
}

/**
 * Animate `gradientTransform` translate on a
 * `<ChartFlowGradient>` ref. The gradient's 3-stop cyclic
 * pattern (R16-PR2) means panning by `distance` returns to the
 * same colour — the loop has no visible seam.
 *
 * Consumer pattern:
 *
 *     const flowRef = useChartFlow({ active: hovered, distance: width });
 *     return (
 *       <svg>
 *         <defs>
 *           <ChartFlowGradient id="…" series={1} ref={flowRef} />
 *         </defs>
 *         <path fill={`url(#…)`} ... />
 *       </svg>
 *     );
 *
 * Motion-reduce: when `prefers-reduced-motion: reduce` is set,
 * the hook snaps the gradient back to `translate(0,0)` (the
 * R16-PR2 identity transform) and skips the RAF loop entirely.
 *
 * The hook uses `requestAnimationFrame` (not CSS animation on
 * the SVG presentation attribute) because `gradientTransform`
 * animation via CSS has spotty browser support — RAF is the
 * portable contract.
 */
export function useChartFlow({
    active,
    distance,
    direction = 'horizontal',
}: UseChartFlowArgs) {
    const ref = useRef<SVGLinearGradientElement | null>(null);
    const reduced = useReducedMotion();

    useEffect(() => {
        const node = ref.current;
        if (!node) return undefined;

        if (!active || reduced) {
            // Snap back to identity. Lossless — the next active
            // engagement starts from a clean 0.
            node.setAttribute('gradientTransform', 'translate(0,0)');
            return undefined;
        }

        let startTime: number | null = null;
        let raf = 0;
        const tick = (t: number) => {
            if (startTime === null) startTime = t;
            const elapsed = t - startTime;
            // phase wraps 0..1 every PERIOD_MS. multiplied by
            // distance gives the user-space px to translate.
            const phase = (elapsed % CHART_FLOW_PERIOD_MS) / CHART_FLOW_PERIOD_MS;
            const offset = phase * distance;
            const transform =
                direction === 'horizontal'
                    ? `translate(${offset.toFixed(2)},0)`
                    : `translate(0,${offset.toFixed(2)})`;
            // Imperative attribute write — the gradient redraws
            // on the next browser paint.
            node.setAttribute('gradientTransform', transform);
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            // Snap back on unmount / deps change so the next
            // engagement isn't mid-cycle.
            node.setAttribute('gradientTransform', 'translate(0,0)');
        };
    }, [active, distance, direction, reduced]);

    return ref;
}
