/**
 * Tooltip stub for the jsdom test project.
 *
 * The real `src/components/ui/tooltip.tsx` transitively imports
 * `react-markdown` (ESM) which Jest can't transform without custom
 * transformIgnorePatterns. The render tests don't exercise tooltip
 * content, so a minimal stub that just passes children through is
 * sufficient — it preserves the component graph without pulling in the
 * ESM subtree.
 */

import * as React from 'react';

export function Tooltip({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
