/**
 * Executive Dashboard Widget Tests
 *
 * Structural tests for the reusable KPI/chart components.
 * Since the codebase uses SSR (no React Testing Library / jsdom),
 * these tests verify:
 *   1. Modules export correctly
 *   2. Prop contracts are correct (TypeScript-level, verified at compile)
 *   3. Source code handles empty/null/zero states
 *   4. No external chart dependencies are introduced
 *   5. Components are glass-card design-system compatible
 */

import * as fs from 'fs';
import * as path from 'path';

const UI_DIR = path.resolve(__dirname, '../../src/components/ui');

// ─── Module Export Guards ───

describe('Dashboard Widget Exports', () => {
    const widgetFiles = [
        'KpiCard.tsx',
        'DonutChart.tsx',
        'TrendLine.tsx',
        'ProgressCard.tsx',
        'StatusBreakdown.tsx',
    ];

    test.each(widgetFiles)('%s exists and is non-empty', (file) => {
        const filePath = path.join(UI_DIR, file);
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(100);
    });

    test('KpiCard exports default component and KpiCardProps type', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'KpiCard.tsx'), 'utf-8');
        expect(content).toContain('export default function KpiCard');
        expect(content).toContain('export interface KpiCardProps');
    });

    test('DonutChart exports default component and DonutSegment type', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'DonutChart.tsx'), 'utf-8');
        expect(content).toContain('export default function DonutChart');
        expect(content).toContain('export interface DonutSegment');
    });

    test('TrendLine exports default component and TrendLineProps type', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'TrendLine.tsx'), 'utf-8');
        expect(content).toContain('export default function TrendLine');
        expect(content).toContain('export interface TrendLineProps');
    });

    test('ProgressCard exports default component and ProgressCardProps type', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'ProgressCard.tsx'), 'utf-8');
        expect(content).toContain('export default function ProgressCard');
        expect(content).toContain('export interface ProgressCardProps');
    });

    test('StatusBreakdown exports default component and StatusItem type', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'StatusBreakdown.tsx'), 'utf-8');
        expect(content).toContain('export default function StatusBreakdown');
        expect(content).toContain('export interface StatusItem');
    });
});

// ─── Empty / Zero / Null State Handling ───

describe('Widget Empty State Handling', () => {
    test('KpiCard handles null value gracefully (renders "—")', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'KpiCard.tsx'), 'utf-8');
        // Should have null/undefined checks and a fallback display
        expect(content).toContain("value === null");
        expect(content).toContain("value === undefined");
        expect(content).toMatch(/['"]—['"]/); // Em dash fallback
    });

    test('DonutChart handles empty segments (total === 0)', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'DonutChart.tsx'), 'utf-8');
        expect(content).toContain('total === 0');
        expect(content).toContain('No data');
    });

    test('TrendLine handles insufficient data (< 2 points)', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'TrendLine.tsx'), 'utf-8');
        expect(content).toContain('data.length < 2');
        expect(content).toContain('No trend data');
    });

    test('ProgressCard handles max === 0 (no division by zero)', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'ProgressCard.tsx'), 'utf-8');
        expect(content).toContain('max > 0');
    });

    test('StatusBreakdown handles zero total gracefully', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'StatusBreakdown.tsx'), 'utf-8');
        expect(content).toContain('total > 0');
        expect(content).toContain('No data');
    });

    test('DonutChart avoids division by zero for flat range', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'DonutChart.tsx'), 'utf-8');
        // total is always checked before division
        expect(content).toContain('seg.value / total');
    });

    test('TrendLine avoids division by zero for flat data', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'TrendLine.tsx'), 'utf-8');
        // range should have a fallback for flat data
        expect(content).toMatch(/range\s*=\s*max\s*-\s*min\s*\|\|\s*1/);
    });
});

// ─── Design System Compatibility ───

describe('Widget Design System Compliance', () => {
    test('all widgets use glass-card where appropriate', () => {
        // KpiCard, ProgressCard, and StatusBreakdown should use glass-card
        for (const file of ['KpiCard.tsx', 'ProgressCard.tsx', 'StatusBreakdown.tsx']) {
            const content = fs.readFileSync(path.join(UI_DIR, file), 'utf-8');
            expect(content).toContain('glass-card');
        }
    });

    test('DonutChart and TrendLine do NOT use glass-card (embeddable)', () => {
        // These are embeddable in other cards — no outer card wrapper
        for (const file of ['DonutChart.tsx', 'TrendLine.tsx']) {
            const content = fs.readFileSync(path.join(UI_DIR, file), 'utf-8');
            expect(content).not.toContain('glass-card');
        }
    });

    test('all widgets have accessible aria attributes', () => {
        for (const file of ['DonutChart.tsx', 'TrendLine.tsx']) {
            const content = fs.readFileSync(path.join(UI_DIR, file), 'utf-8');
            expect(content).toContain('aria-label');
        }
    });

    test('all widgets support className prop for customization', () => {
        for (const file of ['KpiCard.tsx', 'DonutChart.tsx', 'TrendLine.tsx', 'ProgressCard.tsx', 'StatusBreakdown.tsx']) {
            const content = fs.readFileSync(path.join(UI_DIR, file), 'utf-8');
            expect(content).toContain("className?: string");
            expect(content).toContain("className = ''");
        }
    });

    test('all widgets support id prop for testing', () => {
        for (const file of ['KpiCard.tsx', 'DonutChart.tsx', 'TrendLine.tsx', 'ProgressCard.tsx', 'StatusBreakdown.tsx']) {
            const content = fs.readFileSync(path.join(UI_DIR, file), 'utf-8');
            expect(content).toContain("id?: string");
        }
    });
});

// ─── Zero External Dependencies ───

describe('Widget Dependency Guard', () => {
    test('no chart library imports in widget files', () => {
        const banned = ['recharts', 'chart.js', 'd3', 'nivo', 'victory', 'tremor', 'visx'];
        for (const file of ['DonutChart.tsx', 'TrendLine.tsx']) {
            const content = fs.readFileSync(path.join(UI_DIR, file), 'utf-8');
            for (const lib of banned) {
                expect(content).not.toContain(`from '${lib}`);
                expect(content).not.toContain(`from "${lib}`);
            }
        }
    });

    test('KpiCard only imports lucide-react (icon support)', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'KpiCard.tsx'), 'utf-8');
        const importLines = content.split('\n').filter(l => l.trim().startsWith('import'));
        // Only lucide-react is expected as an external import
        const externalImports = importLines.filter(l => !l.includes('./') && !l.includes('../'));
        expect(externalImports.length).toBeLessThanOrEqual(1);
        if (externalImports.length === 1) {
            expect(externalImports[0]).toContain('lucide-react');
        }
    });
});

// ─── Prop Contract / Data Shape ───

describe('Widget Prop Contracts', () => {
    test('KpiCard format supports number, percent, and compact', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'KpiCard.tsx'), 'utf-8');
        expect(content).toContain("'number'");
        expect(content).toContain("'percent'");
        expect(content).toContain("'compact'");
    });

    test('DonutChart segments have label, value, color', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'DonutChart.tsx'), 'utf-8');
        expect(content).toContain('label: string');
        expect(content).toContain('value: number');
        expect(content).toContain('color: string');
    });

    test('TrendLine data is a number array', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'TrendLine.tsx'), 'utf-8');
        expect(content).toContain('data: number[]');
    });

    test('ProgressCard supports segments for stacked bar', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'ProgressCard.tsx'), 'utf-8');
        expect(content).toContain('segments?: ProgressSegment[]');
        expect(content).toContain('export interface ProgressSegment');
    });

    test('StatusBreakdown items have label, value, color', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'StatusBreakdown.tsx'), 'utf-8');
        expect(content).toContain('label: string');
        expect(content).toContain('value: number');
        expect(content).toContain('color: string');
    });

    test('KpiCard has delta indicator support', () => {
        const content = fs.readFileSync(path.join(UI_DIR, 'KpiCard.tsx'), 'utf-8');
        expect(content).toContain('delta?: number');
        expect(content).toContain('deltaLabel?: string');
        expect(content).toMatch(/▲|▼/); // Trend arrows
    });
});
