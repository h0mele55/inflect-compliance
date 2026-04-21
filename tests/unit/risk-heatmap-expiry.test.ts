/**
 * Risk Heatmap & Evidence Expiry Calendar Widget Tests
 *
 * Structural tests verifying:
 *   1. Component exports & structure
 *   2. Empty state handling
 *   3. Color/urgency logic correctness
 *   4. Date formatting safety
 *   5. Backend DTO additions
 *   6. Dashboard integration
 */

import * as fs from 'fs';
import * as path from 'path';

const UI_DIR = path.resolve(__dirname, '../../src/components/ui');
const REPO_FILE = path.resolve(__dirname, '../../src/app-layer/repositories/DashboardRepository.ts');
const USECASE_FILE = path.resolve(__dirname, '../../src/app-layer/usecases/dashboard.ts');
const DASHBOARD_FILE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/dashboard/page.tsx',
);

// ─── Widget Exports ────────────────────────────────────────────────

describe('RiskHeatmap Widget', () => {
    const content = fs.readFileSync(path.join(UI_DIR, 'RiskHeatmap.tsx'), 'utf-8');

    test('file exists and is substantial', () => {
        expect(content.length).toBeGreaterThan(1000);
    });

    test('exports default component and HeatmapCell type', () => {
        expect(content).toContain('export default function RiskHeatmap');
        expect(content).toContain('export interface HeatmapCell');
    });

    test('renders a 5×5 grid by default', () => {
        expect(content).toContain('scale = 5');
        // Should iterate rows and cols
        expect(content).toContain('Array.from({ length: scale }');
    });

    test('handles empty state (zero risks)', () => {
        expect(content).toContain('totalRisks === 0');
        expect(content).toContain('No risks registered yet');
    });

    test('color-codes by risk score', () => {
        expect(content).toContain('score >= 15');
        expect(content).toContain('score >= 10');
        expect(content).toContain('score >= 5');
        expect(content).toContain('bg-red-500');
        expect(content).toContain('bg-orange-500');
        expect(content).toContain('bg-amber-500');
        expect(content).toContain('bg-emerald-500');
    });

    test('uses likelihood × impact lookup', () => {
        expect(content).toContain('likelihood * impact');
        expect(content).toContain('lookup.get');
        expect(content).toContain('new Map');
    });

    test('has axis labels (Likelihood + Impact)', () => {
        expect(content).toContain('Likelihood');
        expect(content).toContain('Impact');
    });

    test('has legend', () => {
        expect(content).toContain('Low');
        expect(content).toContain('Medium');
        expect(content).toContain('High');
        expect(content).toContain('Critical');
    });

    test('supports className and id props', () => {
        expect(content).toContain("className?: string");
        expect(content).toContain("id?: string");
    });

    test('uses glass-card design', () => {
        expect(content).toContain('glass-card');
    });
});

describe('ExpiryCalendar Widget', () => {
    const content = fs.readFileSync(path.join(UI_DIR, 'ExpiryCalendar.tsx'), 'utf-8');

    test('file exists and is substantial', () => {
        expect(content.length).toBeGreaterThan(1000);
    });

    test('exports default component and ExpiryItem type', () => {
        expect(content).toContain('export default function ExpiryCalendar');
        expect(content).toContain('export interface ExpiryItem');
    });

    test('handles empty state (no items)', () => {
        expect(content).toContain('items.length === 0');
        expect(content).toContain('No upcoming evidence expirations');
    });

    test('groups by urgency levels', () => {
        expect(content).toContain("'overdue'");
        expect(content).toContain("'urgent'");
        expect(content).toContain("'upcoming'");
        expect(content).toContain("'normal'");
    });

    test('urgency color coding', () => {
        expect(content).toContain('text-red-400');
        expect(content).toContain('text-amber-400');
        expect(content).toContain('text-yellow-400');
    });

    test('formats days until correctly', () => {
        expect(content).toContain("'Today'");
        expect(content).toContain("'Tomorrow'");
        expect(content).toContain('overdue');
    });

    test('date formatting uses UTC to avoid timezone shifts', () => {
        // Epic 58 — the inline UTC formatter was replaced by the
        // canonical `formatDateCompact` helper, which declares
        // `timeZone: 'UTC'` on its shared `Intl.DateTimeFormat` in
        // `src/lib/format-date.ts`. The UTC guarantee still holds;
        // the call site just delegates instead of hardcoding the
        // option bag.
        expect(content).toContain('formatDateCompact');
    });

    test('truncates long titles', () => {
        expect(content).toContain('truncate');
    });

    test('has scrollable overflow for long lists', () => {
        expect(content).toContain('overflow-y-auto');
    });

    test('supports className and id props', () => {
        expect(content).toContain("className?: string");
        expect(content).toContain("id?: string");
    });

    test('uses glass-card design', () => {
        expect(content).toContain('glass-card');
    });
});

// ─── Backend DTO & Query Additions ──────────────────────────────────

describe('Dashboard DTO Extensions', () => {
    const repoContent = fs.readFileSync(REPO_FILE, 'utf-8');

    test('RiskHeatmapCell interface exported', () => {
        expect(repoContent).toContain('export interface RiskHeatmapCell');
        expect(repoContent).toContain('likelihood: number');
        expect(repoContent).toContain('impact: number');
        expect(repoContent).toContain('count: number');
    });

    test('EvidenceExpiryItem interface exported', () => {
        expect(repoContent).toContain('export interface EvidenceExpiryItem');
        expect(repoContent).toContain('nextReviewDate: string');
        expect(repoContent).toContain('daysUntil: number');
    });

    test('ExecutiveDashboardPayload includes riskHeatmap', () => {
        expect(repoContent).toContain('riskHeatmap: RiskHeatmapCell[]');
    });

    test('ExecutiveDashboardPayload includes upcomingExpirations', () => {
        expect(repoContent).toContain('upcomingExpirations: EvidenceExpiryItem[]');
    });

    test('getRiskHeatmap uses groupBy on likelihood + impact', () => {
        expect(repoContent).toContain('getRiskHeatmap');
        expect(repoContent).toContain("by: ['likelihood', 'impact']");
    });

    test('getUpcomingExpirations uses findMany with date filter', () => {
        expect(repoContent).toContain('getUpcomingExpirations');
        expect(repoContent).toContain('nextReviewDate');
        expect(repoContent).toContain('take: 20');
    });
});

describe('Dashboard Usecase Updates', () => {
    const usecaseContent = fs.readFileSync(USECASE_FILE, 'utf-8');

    test('fetches riskHeatmap in parallel', () => {
        expect(usecaseContent).toContain('DashboardRepository.getRiskHeatmap');
    });

    test('fetches upcomingExpirations in parallel', () => {
        expect(usecaseContent).toContain('DashboardRepository.getUpcomingExpirations');
    });

    test('returns riskHeatmap in payload', () => {
        expect(usecaseContent).toContain('riskHeatmap,');
    });

    test('returns upcomingExpirations in payload', () => {
        expect(usecaseContent).toContain('upcomingExpirations,');
    });
});

// ─── Dashboard Page Integration ─────────────────────────────────────

describe('Dashboard Page Integration', () => {
    const content = fs.readFileSync(DASHBOARD_FILE, 'utf-8');

    test('imports RiskHeatmap', () => {
        expect(content).toContain("from '@/components/ui/RiskHeatmap'");
    });

    test('imports ExpiryCalendar', () => {
        expect(content).toContain("from '@/components/ui/ExpiryCalendar'");
    });

    test('renders RiskHeatmap with id', () => {
        expect(content).toContain('<RiskHeatmap');
        expect(content).toContain('id="risk-heatmap"');
    });

    test('renders ExpiryCalendar with id', () => {
        expect(content).toContain('<ExpiryCalendar');
        expect(content).toContain('id="expiry-calendar"');
    });

    test('passes exec.riskHeatmap to RiskHeatmap', () => {
        expect(content).toContain('cells={exec.riskHeatmap}');
    });

    test('passes exec.upcomingExpirations to ExpiryCalendar', () => {
        expect(content).toContain('items={exec.upcomingExpirations}');
    });

    test('heatmap and expiry calendar in the same grid row', () => {
        // Both should be in a lg:grid-cols-2 container
        const heatmapIdx = content.indexOf('risk-heatmap');
        const expiryIdx = content.indexOf('expiry-calendar');
        // They should be close together (same grid block)
        expect(Math.abs(heatmapIdx - expiryIdx)).toBeLessThan(600);
    });
});

// ─── Urgency Logic Unit Tests ───────────────────────────────────────

describe('ExpiryCalendar Urgency Logic', () => {
    const content = fs.readFileSync(path.join(UI_DIR, 'ExpiryCalendar.tsx'), 'utf-8');

    test('overdue threshold: daysUntil < 0', () => {
        expect(content).toContain('daysUntil < 0');
    });

    test('urgent threshold: daysUntil <= 7', () => {
        expect(content).toContain('daysUntil <= 7');
    });

    test('upcoming threshold: daysUntil <= 14', () => {
        expect(content).toContain('daysUntil <= 14');
    });

    test('ordered groups: overdue first, normal last', () => {
        const overdueIdx = content.indexOf("'overdue'");
        const normalIdx = content.lastIndexOf("'normal'");
        expect(overdueIdx).toBeLessThan(normalIdx);
    });
});

// ─── Risk Heatmap Score Logic Unit Tests ─────────────────────────────

describe('RiskHeatmap Score Logic', () => {
    const content = fs.readFileSync(path.join(UI_DIR, 'RiskHeatmap.tsx'), 'utf-8');

    test('critical threshold: score >= 15', () => {
        expect(content).toContain('score >= 15');
    });

    test('high threshold: score >= 10', () => {
        expect(content).toContain('score >= 10');
    });

    test('medium threshold: score >= 5', () => {
        expect(content).toContain('score >= 5');
    });

    test('getScoreLabel function exists for accessibility', () => {
        expect(content).toContain('function getScoreLabel');
    });

    test('cell tooltips include score and label', () => {
        expect(content).toContain('getScoreLabel(score)');
    });
});
