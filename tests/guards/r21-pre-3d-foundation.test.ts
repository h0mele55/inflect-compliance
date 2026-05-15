/**
 * R21-PR-E — 3D foundation ratchet.
 *
 * Roadmap-21 PR-F lands the first real 3D chart. PR-E ships the
 * foundation every 3D chart in IC will consume:
 *
 *   1. `@react-three/fiber` + `@react-three/drei` + `three` (and
 *      `@types/three`) are declared as deps. Bundle cost
 *      (~180KB gz) only lands on routes that mount a 3D chart
 *      via the dynamic-import wrapper.
 *
 *   2. `<Chart3D>` SSR-safe primitive carrying the conventions
 *      every 3D chart shares: lights + camera defaults,
 *      constrained OrbitControls (no pan, polar-angle clamp,
 *      slow idle auto-rotate that stops on user interaction),
 *      prefers-reduced-motion fallback to a 2D static view.
 *
 *   3. `dynamicChart3D()` factory returns a `next/dynamic`-wrapped
 *      `<Chart3D>` with `ssr: false`. Routes that don't mount a
 *      3D chart never load the Three.js chunk.
 *
 *   4. `tokenColor()` bridges CSS-var chart-series tokens to the
 *      hex colour strings Three.js materials need at runtime.
 *
 *   5. Barrel re-exports everything so consumers import from the
 *      single `@/components/ui/charts` entry.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const PKG = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
);
const CHART_3D = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-3d.tsx'),
    'utf8',
);
const CHART_3D_DYNAMIC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-3d-dynamic.ts'),
    'utf8',
);
const BARREL = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/index.ts'),
    'utf8',
);

describe('R21-PR-E — 3D foundation', () => {
    describe('npm dependencies declared', () => {
        for (const dep of [
            '@react-three/fiber',
            '@react-three/drei',
            'three',
        ]) {
            it(`${dep} is in dependencies`, () => {
                expect(PKG.dependencies?.[dep]).toBeTruthy();
            });
        }

        it('@types/three is in devDependencies', () => {
            expect(PKG.devDependencies?.['@types/three']).toBeTruthy();
        });
    });

    describe('<Chart3D> primitive', () => {
        it('is a client component', () => {
            expect(CHART_3D.split('\n')[0]).toMatch(/^'use client'/);
        });

        it('imports Canvas from @react-three/fiber + OrbitControls from drei', () => {
            expect(CHART_3D).toMatch(
                /from\s+['"]@react-three\/fiber['"]/,
            );
            expect(CHART_3D).toMatch(/Canvas/);
            expect(CHART_3D).toMatch(
                /from\s+['"]@react-three\/drei['"]/,
            );
            expect(CHART_3D).toMatch(/OrbitControls/);
        });

        it('requires an ariaLabel — WebGL canvas is opaque to screen readers', () => {
            // Required (not optional) — the chart MUST have an
            // accessible description. Locked as a non-optional
            // field on the props interface.
            expect(CHART_3D).toMatch(/ariaLabel:\s*string;/);
        });

        it('renders the lights + camera defaults so a first chart "just works"', () => {
            expect(CHART_3D).toMatch(/<ambientLight/);
            expect(CHART_3D).toMatch(/<directionalLight/);
            expect(CHART_3D).toMatch(/camera=\{\{\s*position:\s*cameraPosition/);
        });

        it('OrbitControls enforces the constrained-orbit discipline', () => {
            // enablePan=false: user can't drag the scene off-frame.
            // Polar-angle clamp: user can't rotate below the floor
            // or look straight down (which defeats the 3D purpose).
            expect(CHART_3D).toMatch(/enablePan=\{false\}/);
            expect(CHART_3D).toMatch(/minPolarAngle=\{minPolarAngle\}/);
            expect(CHART_3D).toMatch(/maxPolarAngle=\{maxPolarAngle\}/);
        });

        it('auto-rotates at idle, stops on user pointer entry', () => {
            // autoRotate = !reducedMotion && !userInteracting &&
            // idleRotateSpeed > 0. The chart is "alive" while idle,
            // freezes when the user starts touching it.
            expect(CHART_3D).toMatch(/autoRotate=\{autoRotate\}/);
            expect(CHART_3D).toMatch(/autoRotateSpeed=\{idleRotateSpeed\}/);
            expect(CHART_3D).toMatch(/setUserInteracting\(true\)/);
            expect(CHART_3D).toMatch(/setUserInteracting\(false\)/);
        });

        it('prefers-reduced-motion + FallbackComponent short-circuits the 3D scene', () => {
            // If the user opted out AND a 2D fallback is supplied,
            // we render the fallback instead — better accessibility
            // than a static 3D view that's still opaque to screen
            // readers.
            expect(CHART_3D).toMatch(
                /prefersReducedMotion\s*&&\s*FallbackComponent/,
            );
            expect(CHART_3D).toMatch(/data-chart-3d-fallback/);
        });

        it('emits data-chart-3d + data-chart-3d-rotating for E2E hooks', () => {
            expect(CHART_3D).toMatch(/data-chart-3d="true"/);
            expect(CHART_3D).toMatch(/data-chart-3d-rotating/);
        });

        it('exposes tokenColor() helper for chart-series → hex bridging', () => {
            expect(CHART_3D).toMatch(/export\s+function\s+tokenColor/);
            // Reads the `--chart-series-${N}-${stop}` token via
            // getComputedStyle so dark/light theme flips propagate.
            expect(CHART_3D).toMatch(/--chart-series-/);
            expect(CHART_3D).toMatch(/getComputedStyle/);
            // SSR guard — getComputedStyle isn't available on the
            // server.
            expect(CHART_3D).toMatch(/typeof window === 'undefined'/);
        });
    });

    describe('dynamicChart3D() SSR-safe wrapper', () => {
        it('imports next/dynamic', () => {
            expect(CHART_3D_DYNAMIC).toMatch(
                /from\s+['"]next\/dynamic['"]/,
            );
        });

        it('disables SSR — Three.js touches DOM at module load', () => {
            expect(CHART_3D_DYNAMIC).toMatch(/ssr:\s*false/);
        });

        it('lazy-imports the Chart3D component', () => {
            // Dynamic import inside the dynamic() call ensures the
            // chunk is split — Three.js code only loads when the
            // returned component actually mounts.
            expect(CHART_3D_DYNAMIC).toMatch(
                /import\(['"]\.\/chart-3d['"]\)\.then\(\(m\)\s*=>\s*m\.Chart3D\)/,
            );
        });
    });

    describe('barrel re-exports', () => {
        it('re-exports Chart3D + Chart3DProps + tokenColor + dynamicChart3D', () => {
            expect(BARREL).toMatch(
                /export\s+\{\s*Chart3D,\s*tokenColor\s*\}/,
            );
            expect(BARREL).toMatch(/export\s+type\s+\{\s*Chart3DProps\s*\}/);
            expect(BARREL).toMatch(
                /export\s+\{\s*dynamicChart3D\s*\}/,
            );
        });
    });
});
