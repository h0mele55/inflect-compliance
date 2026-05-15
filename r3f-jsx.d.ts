/**
 * Roadmap-21 PR-E — JSX intrinsic-element augmentation for the
 * @react-three/fiber elements our 3D charts use.
 *
 * r3f v8 ships a `declare global { namespace JSX ... }`
 * augmentation, but two things prevent it from applying in this
 * repo:
 *   1. `moduleResolution: bundler` + `isolatedModules: true` don't
 *      reliably pull the augmentation through `import { Canvas }
 *      from '@react-three/fiber'`.
 *   2. React 19's new JSX transform (`"jsx": "react-jsx"` in
 *      tsconfig) uses `React.JSX` as the intrinsic-elements
 *      namespace, not the legacy global `JSX`. The r3f
 *      augmentation targets the legacy global, which is
 *      effectively dead under react-jsx.
 *
 * This file explicitly augments BOTH namespaces — global JSX
 * (for any consumer still resolving the legacy path) and
 * React.JSX (for the new transform). Scope is narrow: only the
 * intrinsics `<Chart3D>` + `<BarField3D>` reference today.
 * Future 3D charts add to this list.
 */
import type { ThreeElements } from '@react-three/fiber';

type R3FElements = {
    ambientLight: ThreeElements['ambientLight'];
    directionalLight: ThreeElements['directionalLight'];
    mesh: ThreeElements['mesh'];
    planeGeometry: ThreeElements['planeGeometry'];
    boxGeometry: ThreeElements['boxGeometry'];
    meshStandardMaterial: ThreeElements['meshStandardMaterial'];
};

declare global {
    namespace JSX {
        interface IntrinsicElements extends R3FElements {}
    }
}

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements extends R3FElements {}
    }
}
