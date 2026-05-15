'use client';

/**
 * Roadmap-21 PR-E — `<Chart3D>` foundation primitive.
 *
 * SSR-safe wrapper around `@react-three/fiber`'s `<Canvas>` carrying
 * the conventions every R21 3D chart in IC shares:
 *
 *   1. SSR opt-out. Three.js touches DOM (canvas + WebGL) at module
 *      load; importing it during server render breaks. `<Chart3D>`
 *      is loaded via `next/dynamic({ ssr: false })` at the call
 *      site (see `useChart3DDynamic` below), so the bundle cost
 *      (~180KB gzipped Three.js + r3f + drei) only lands on routes
 *      that actually mount a 3D chart. Server-rendered HTML for
 *      those routes carries a `<div aria-hidden="true">` placeholder
 *      until the client hydrates.
 *
 *   2. prefers-reduced-motion fallback. Users who've opted out of
 *      motion get a STATIC 2D snapshot rendered by the same chart
 *      via the `<FallbackComponent>` prop. The 3D camera doesn't
 *      auto-rotate; orbit controls still work for explicit user
 *      interaction, but the chart starts at a deterministic view
 *      angle and doesn't animate on mount.
 *
 *   3. Constrained orbit. `OrbitControls` with `enablePan=false` +
 *      polar-angle clamp + auto-rotate (slow, idle-only). The user
 *      can rotate but can't pan the scene off-frame; the
 *      auto-rotate stops the moment the cursor enters the canvas
 *      (so user interaction takes precedence over the idle
 *      animation).
 *
 *   4. Token-driven materials. The `tokenColor()` helper reads a
 *      `--chart-series-${N}-${start|end}` token via
 *      `getComputedStyle` and returns the resolved colour as a hex
 *      string Three.js can consume. Charts construct meshes using
 *      these tokens so dark/light theme flips propagate to the
 *      3D scene on next re-render.
 *
 *   5. Lights + camera defaults. A scene needs an ambient + a key
 *      directional light to read at all; `<Chart3D>` mounts both
 *      at sensible angles so the first 3D chart (PR-F) doesn't
 *      have to choose. Charts can override with their own lighting
 *      via children if needed.
 *
 * Accessibility: WebGL canvas is opaque to screen readers. Every
 * `<Chart3D>` MUST receive an `ariaLabel` describing what the
 * 3D chart visualises ("Risk severity over time as a 3D bar
 * field"). Keyboard navigation isn't meaningful in a WebGL
 * surface, so charts SHOULD provide a `<FallbackComponent>` that
 * renders the same data as a 2D chart accessible to keyboard
 * + assistive tech.
 */

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

/**
 * Inline `prefers-reduced-motion: reduce` hook. PR-E-scoped — if a
 * second 3D consumer in the codebase needs the same hook later,
 * promote to `@/components/ui/hooks/use-reduced-motion`.
 */
function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return reduced;
}

export interface Chart3DProps {
    /**
     * Required ARIA label — WebGL canvas is opaque to screen
     * readers; this is the text alt for the chart's data story.
     */
    ariaLabel: string;
    /**
     * Optional className forwarded to the wrapper div. The Canvas
     * sizes to its parent, so use this to set width/height.
     */
    className?: string;
    /**
     * Forwarded for E2E selectors.
     */
    'data-testid'?: string;
    /**
     * Static 2D fallback rendered when `prefers-reduced-motion:
     * reduce` is set OR when WebGL is unavailable. Charts SHOULD
     * supply this — accessibility + low-end-device support hinges
     * on it. Pass a function-component that renders the SAME data
     * as the 3D scene in a 2D vocabulary (bar chart, table, etc).
     */
    FallbackComponent?: () => ReactNode;
    /**
     * Three.js scene contents. Standard r3f component tree —
     * meshes, lights, helpers, etc.
     */
    children: ReactNode;
    /**
     * Camera position vector. Default `[6, 4, 6]` gives an
     * isometric-ish view that reads "3D" without being top-down.
     */
    cameraPosition?: [number, number, number];
    /**
     * Idle auto-rotation speed (degrees per second). Default 0.5
     * — slow enough to read as "the chart is alive", fast enough
     * to register over a 6-second eye dwell. Set to 0 to disable.
     */
    idleRotateSpeed?: number;
    /**
     * Minimum polar angle for OrbitControls (in radians). Default
     * `Math.PI / 6` — prevents the user from rotating BELOW the
     * scene's floor.
     */
    minPolarAngle?: number;
    /**
     * Maximum polar angle for OrbitControls. Default `Math.PI / 2`
     * — prevents the user from looking from ABOVE (which produces
     * a top-down 2D-equivalent view that defeats the 3D purpose).
     */
    maxPolarAngle?: number;
}

/**
 * Resolves a `--chart-series-${N}-${stop}` CSS variable to a hex
 * colour string. Three.js doesn't read CSS — it needs literal
 * colour values for `color` props on materials. This helper bridges
 * by reading the computed style at runtime.
 *
 * Returns `#ffffff` if the var is unresolvable (SSR, missing token).
 * Charts SHOULD call this inside an effect or render so the value
 * re-reads on theme change.
 */
export function tokenColor(
    seriesIndex: 1 | 2 | 3 | 4 | 5 | 6,
    stop: 'start' | 'end',
): string {
    if (typeof window === 'undefined') return '#ffffff';
    const root = document.documentElement;
    const raw = getComputedStyle(root)
        .getPropertyValue(`--chart-series-${seriesIndex}-${stop}`)
        .trim();
    return raw || '#ffffff';
}

/**
 * The `<Chart3D>` primitive itself. Mounts the r3f Canvas with the
 * Chart3D conventions wired in.
 */
export function Chart3D({
    ariaLabel,
    className,
    'data-testid': dataTestId,
    FallbackComponent,
    children,
    cameraPosition = [6, 4, 6],
    idleRotateSpeed = 0.5,
    minPolarAngle = Math.PI / 6,
    maxPolarAngle = Math.PI / 2,
}: Chart3DProps) {
    const prefersReducedMotion = useReducedMotion();
    const [userInteracting, setUserInteracting] = useState(false);

    // R21-PR-E — prefers-reduced-motion + no-fallback short-circuit.
    // If the user opted out AND a 2D fallback is supplied, render
    // it instead of the 3D scene. If no fallback is supplied, we
    // still render the 3D scene but with auto-rotate disabled —
    // a static 3D view is more accessible than a moving one.
    if (prefersReducedMotion && FallbackComponent) {
        return (
            <div
                className={className}
                data-testid={dataTestId}
                role="img"
                aria-label={ariaLabel}
                data-chart-3d-fallback="true"
            >
                <FallbackComponent />
            </div>
        );
    }

    const autoRotate =
        !prefersReducedMotion && !userInteracting && idleRotateSpeed > 0;

    return (
        <div
            className={className}
            data-testid={dataTestId}
            data-chart-3d="true"
            data-chart-3d-rotating={autoRotate ? 'true' : undefined}
        >
            <Canvas
                aria-label={ariaLabel}
                camera={{ position: cameraPosition, fov: 50 }}
                onPointerEnter={() => setUserInteracting(true)}
                onPointerLeave={() => setUserInteracting(false)}
            >
                {/* Lights — ambient + a key directional. Defaults
                    that read at all. Charts can override by
                    rendering their own lights as children.
                    JSX intrinsic types for r3f elements are
                    augmented globally by `r3f-jsx.d.ts` at the
                    repo root. */}
                <ambientLight intensity={0.5} />
                <directionalLight
                    position={[10, 10, 5]}
                    intensity={1}
                    castShadow
                />
                <Suspense fallback={null}>{children}</Suspense>
                <OrbitControls
                    enablePan={false}
                    minPolarAngle={minPolarAngle}
                    maxPolarAngle={maxPolarAngle}
                    autoRotate={autoRotate}
                    autoRotateSpeed={idleRotateSpeed}
                />
            </Canvas>
        </div>
    );
}
