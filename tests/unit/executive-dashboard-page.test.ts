/**
 * Executive Dashboard Page Tests
 *
 * Verifies the dashboard page structure, widget composition,
 * server/client boundaries, and data contract compatibility.
 *
 * Since the codebase is SSR-first (no React Testing Library),
 * we test via structural analysis and export verification.
 */

import * as fs from 'fs';
import * as path from 'path';

const DASHBOARD_DIR = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/dashboard',
);
const DASHBOARD_PAGE = path.join(DASHBOARD_DIR, 'page.tsx');

function readPage(): string {
    return fs.readFileSync(DASHBOARD_PAGE, 'utf-8');
}

// ─── Page Structure ────────────────────────────────────────────────

describe('Executive Dashboard Page', () => {
    const content = readPage();

    test('page file exists and is substantial', () => {
        expect(fs.existsSync(DASHBOARD_PAGE)).toBe(true);
        expect(content.length).toBeGreaterThan(5000);
    });

    test('uses force-dynamic for real-time data', () => {
        expect(content).toContain("dynamic = 'force-dynamic'");
    });

    test('exports async default function (RSC)', () => {
        expect(content).toContain('export default async function DashboardPage');
    });

    test('uses getExecutiveDashboard (not old getDashboardData for KPIs)', () => {
        expect(content).toContain('getExecutiveDashboard');
    });

    test('fetches trend data via getComplianceTrends', () => {
        expect(content).toContain('getComplianceTrends');
    });

    test('uses tenant context from getTenantCtx', () => {
        expect(content).toContain('getTenantCtx');
    });
});

// ─── Widget Composition ────────────────────────────────────────────

describe('Dashboard Widget Composition', () => {
    const content = readPage();

    test('uses KpiCard component', () => {
        expect(content).toContain("from '@/components/ui/KpiCard'");
        // At least 4 KpiCard instances
        const kpiCount = (content.match(/<KpiCard/g) || []).length;
        expect(kpiCount).toBeGreaterThanOrEqual(4);
    });

    test('uses ProgressCard component', () => {
        expect(content).toContain("from '@/components/ui/ProgressCard'");
        expect(content).toContain('<ProgressCard');
    });

    test('uses DonutChart component', () => {
        expect(content).toContain("from '@/components/ui/DonutChart'");
        expect(content).toContain('<DonutChart');
    });

    test('uses TrendCard component (Epic 59 — TimeSeriesChart-backed)', () => {
        expect(content).toContain("from '@/components/ui/TrendCard'");
        expect(content).toContain('<TrendCard');
    });

    test('uses StatusBreakdown component', () => {
        expect(content).toContain("from '@/components/ui/StatusBreakdown'");
        expect(content).toContain('<StatusBreakdown');
    });

    test('has at least 6 KPI cards for executive grid', () => {
        const kpiCount = (content.match(/<KpiCard/g) || []).length;
        expect(kpiCount).toBe(6);
    });
});

// ─── Layout Sections ───────────────────────────────────────────────

describe('Dashboard Layout Sections', () => {
    const content = readPage();

    test('has KPI grid section', () => {
        expect(content).toContain('id="kpi-grid"');
    });

    test('has control coverage section', () => {
        expect(content).toContain('id="control-coverage"');
    });

    test('has risk distribution section', () => {
        expect(content).toContain('id="risk-distribution"');
    });

    test('has evidence status section', () => {
        expect(content).toContain('id="evidence-status"');
    });

    test('has compliance alerts section', () => {
        expect(content).toContain('id="compliance-alerts"');
    });

    test('has trend section', () => {
        expect(content).toContain('id="trend-section"');
    });

    test('uses responsive grid layout (lg:grid-cols-2)', () => {
        expect(content).toContain('lg:grid-cols-2');
    });

    test('uses 6-col KPI grid on large screens', () => {
        expect(content).toContain('lg:grid-cols-6');
    });
});

// ─── Server/Client Boundary ────────────────────────────────────────

describe('Dashboard Server/Client Split', () => {
    const content = readPage();

    test('page does NOT have "use client" directive (Server Component)', () => {
        expect(content).not.toMatch(/^'use client'/m);
        expect(content).not.toMatch(/^"use client"/m);
    });

    test('uses Suspense for async sections (proper streaming)', () => {
        const suspenseCount = (content.match(/<Suspense/g) || []).length;
        expect(suspenseCount).toBeGreaterThanOrEqual(2); // trend + recent activity
    });

    test('uses Skeleton fallbacks within Suspense', () => {
        expect(content).toContain('<Skeleton');
    });
});

// ─── Data Contract Compatibility ───────────────────────────────────

describe('Dashboard Data Contracts', () => {
    const content = readPage();

    test('consumes ExecutiveDashboardPayload type', () => {
        expect(content).toContain('ExecutiveDashboardPayload');
    });

    test('accesses controlCoverage.coveragePercent', () => {
        expect(content).toContain('controlCoverage.coveragePercent');
    });

    test('accesses riskBySeverity fields', () => {
        expect(content).toContain('riskBySeverity.critical');
        expect(content).toContain('riskBySeverity.high');
        expect(content).toContain('riskBySeverity.medium');
        expect(content).toContain('riskBySeverity.low');
    });

    test('accesses evidenceExpiry fields', () => {
        expect(content).toContain('evidenceExpiry.overdue');
        expect(content).toContain('evidenceExpiry.dueSoon7d');
        expect(content).toContain('evidenceExpiry.current');
    });

    test('accesses taskSummary.overdue', () => {
        expect(content).toContain('taskSummary.overdue');
    });

    test('accesses policySummary fields', () => {
        expect(content).toContain('policySummary.total');
        expect(content).toContain('policySummary.published');
    });

    test('accesses trend data points for sparklines', () => {
        expect(content).toContain('controlCoveragePercent');
        expect(content).toContain('risksOpen');
        expect(content).toContain('evidenceOverdue');
        expect(content).toContain('findingsOpen');
    });
});

// ─── Empty State Handling ──────────────────────────────────────────

describe('Dashboard Empty State Handling', () => {
    const content = readPage();

    test('trend section handles no/insufficient data gracefully', () => {
        expect(content).toContain('daysAvailable < 2');
        expect(content).toContain('Trend charts will appear here');
    });

    test('compliance alerts handles no-alerts state', () => {
        expect(content).toContain('noAlerts');
        expect(content).toContain('alerts.length === 0');
    });

    test('notification bell only shows with unread count > 0', () => {
        expect(content).toContain('unreadNotifications > 0');
    });

    test('trend section catches errors gracefully', () => {
        expect(content).toContain('catch');
        expect(content).toContain('return null');
    });
});

// ─── Backward Compatibility ────────────────────────────────────────

describe('Dashboard Backward Compatibility', () => {
    test('loading.tsx still exists', () => {
        expect(fs.existsSync(path.join(DASHBOARD_DIR, 'loading.tsx'))).toBe(true);
    });

    test('RecentActivityCard still exists and is used', () => {
        expect(fs.existsSync(path.join(DASHBOARD_DIR, 'RecentActivityCard.tsx'))).toBe(true);
        const content = readPage();
        expect(content).toContain('RecentActivityCard');
    });

    test('OnboardingBanner is still rendered', () => {
        const content = readPage();
        expect(content).toContain('OnboardingBanner');
    });

    test('quick actions section preserved', () => {
        const content = readPage();
        expect(content).toContain('quickActions');
    });

    test('i18n translations still used', () => {
        const content = readPage();
        expect(content).toContain('getTranslations');
    });
});
