/**
 * Epic 59 — dashboard chart-bypass guardrail.
 *
 * When a dashboard page renders a sparkline or progress visual, it
 * must use the shared chart platform (`@/components/ui/charts`,
 * `@/components/ui/TrendCard`, `@/components/ui/progress-bar`,
 * `@/components/ui/progress-circle`, `@/components/ui/mini-area-chart`).
 *
 * This guard scans every `(app)/**\/dashboard/page.tsx` for the
 * specific bypass patterns that Epic 59 migrated away from. New
 * contributors adding a raw SVG polyline, an inline
 * `style={{ width: `${pct}%` }}` progress bar, or an import of the
 * removed `TrendLine` will fail here with a pointer to
 * `docs/charts.md`.
 *
 * Add new banned patterns as the platform grows — don't loosen the
 * net.
 */

import * as fs from 'fs';
import * as path from 'path';

const DASHBOARDS_ROOT = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)',
);

function collectDashboardPages(): string[] {
    const pages: string[] = [];
    for (const entry of fs.readdirSync(DASHBOARDS_ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const direct = path.join(DASHBOARDS_ROOT, entry.name, 'dashboard', 'page.tsx');
        if (fs.existsSync(direct)) pages.push(direct);
    }
    const top = path.join(DASHBOARDS_ROOT, 'dashboard', 'page.tsx');
    if (fs.existsSync(top)) pages.push(top);
    return pages;
}

interface Violation {
    file: string;
    pattern: string;
    snippet: string;
}

/**
 * A match on a banned pattern is suppressed when a nearby line carries
 * the annotation `// chart-bypass-ok: <reason>` — letting contributors
 * grandfather intentional categorical widgets (e.g. horizontal status
 * distribution bars) while keeping the net tight for future additions.
 */
const SUPPRESSION_TAG = 'chart-bypass-ok:';
const SUPPRESSION_WINDOW = 4;

function isSuppressed(lines: string[], lineIndex: number): boolean {
    const lo = Math.max(0, lineIndex - SUPPRESSION_WINDOW);
    const hi = Math.min(lines.length - 1, lineIndex + SUPPRESSION_WINDOW);
    for (let i = lo; i <= hi; i++) {
        if (lines[i].includes(SUPPRESSION_TAG)) return true;
    }
    return false;
}

function scanFile(file: string): Violation[] {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const violations: Violation[] = [];

    // (1) Legacy TrendLine import — the file is deleted but a resurrected
    // copy or a reverted merge would bring it back.
    lines.forEach((line, i) => {
        if (
            line.includes("from '@/components/ui/TrendLine'") ||
            line.includes('from "@/components/ui/TrendLine"')
        ) {
            if (isSuppressed(lines, i)) return;
            violations.push({
                file,
                pattern: 'TrendLine import (legacy — use TrendCard or MiniAreaChart)',
                snippet: line.trim(),
            });
        }
    });

    // (2) Raw <polyline> SVG — sparklines should go through MiniAreaChart
    // or TrendCard. A legitimate <polyline> in a dashboard page is rare
    // enough that we treat any occurrence as a bypass.
    lines.forEach((line, i) => {
        if (/<polyline\b/.test(line)) {
            if (isSuppressed(lines, i)) return;
            violations.push({
                file,
                pattern: 'raw <polyline> (use MiniAreaChart or TrendCard)',
                snippet: line.trim(),
            });
        }
    });

    // (3) Hand-rolled inline percentage-width progress bars.
    //   style={{ width: `${pct}%` }}
    //   style={{ width: `${Math.min(100, value)}%` }}
    const inlineWidthPercent = /style=\{\{\s*width:\s*`\$\{[^`]+\}%`/;
    lines.forEach((line, i) => {
        if (inlineWidthPercent.test(line)) {
            if (isSuppressed(lines, i)) return;
            violations.push({
                file,
                pattern: 'inline style={{ width: `${…}%` }} (use ProgressBar)',
                snippet: line.trim().slice(0, 120),
            });
        }
    });

    return violations;
}

describe('Epic 59 — dashboard chart-bypass guard', () => {
    const pages = collectDashboardPages();

    it('discovers every (app)/*/dashboard/page.tsx', () => {
        // Sanity check on the discovery itself so the guard doesn't
        // silently pass by finding zero files after a path refactor.
        expect(pages.length).toBeGreaterThanOrEqual(4);
        for (const p of pages) {
            expect(fs.existsSync(p)).toBe(true);
        }
    });

    it('no dashboard page bypasses the shared chart platform', () => {
        const all: Violation[] = [];
        for (const p of pages) {
            all.push(...scanFile(p));
        }
        if (all.length > 0) {
            const lines = all.map(
                (v) =>
                    `  • ${path.relative(process.cwd(), v.file)}\n      pattern: ${v.pattern}\n      match:   ${v.snippet}`,
            );
            throw new Error(
                [
                    'Dashboard chart-bypass detected. See docs/charts.md for the decision tree:',
                    '',
                    ...lines,
                ].join('\n'),
            );
        }
        expect(all).toEqual([]);
    });
});
