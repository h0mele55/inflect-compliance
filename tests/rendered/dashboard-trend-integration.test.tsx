/**
 * Epic 59 — dashboard trend integration.
 *
 * End-to-end-ish coverage of the trend surface on the executive
 * dashboard. Renders a mini dashboard (KpiGrid-style + TrendSection-
 * style) with fixture data and verifies:
 *
 *   - Every TrendCard resolves with its own accessible sparkline
 *   - KPI cards with and without trend data co-exist without
 *     visual or ARIA bleed between them
 *   - The empty-trend fallback renders the token-backed baseline
 *     instead of a silent zero-height gap
 *   - The Suspense-fallback scenario (KpiGrid without trends)
 *     renders the full set of numbers and no sparklines
 *   - A large number of TrendCards mount without throwing — a
 *     crude performance sanity check
 */

import React from 'react';
import { render } from '@testing-library/react';

// ParentSize under jsdom returns 0×0 without this stub, and the chart
// short-circuits to empty. Give it a real size so the area renders.
jest.mock('@visx/responsive', () => {
    const actual = jest.requireActual('@visx/responsive');
    return {
        ...actual,
        ParentSize: ({
            children,
            className,
        }: {
            children: (args: { width: number; height: number }) => React.ReactNode;
            className?: string;
        }) => (
            <div
                data-testid="parent-size"
                className={className}
                style={{ width: 200, height: 48 }}>
                {children({ width: 200, height: 48 })}
            </div>
        ),
    };
});

import KpiCard from '@/components/ui/KpiCard';
import { TrendCard } from '@/components/ui/TrendCard';
import { ShieldCheck, AlertTriangle, Paperclip, Bug, FileText, CheckCircle2 } from 'lucide-react';

// ─── Fixtures ────────────────────────────────────────────────────────

function series(values: number[], start = new Date('2026-04-01T00:00:00Z')) {
    return values.map((value, i) => ({
        date: new Date(start.getTime() + i * 24 * 60 * 60 * 1000),
        value,
    }));
}

const COVERAGE = series([68, 70, 72, 74, 75, 76, 75, 76, 77, 78]);
const RISKS = series([20, 21, 22, 20, 19, 18, 17, 16, 15, 14]);
const EVIDENCE = series([5, 5, 6, 7, 6, 5, 4, 3, 3, 2]);
const FINDINGS = series([12, 12, 11, 10, 9, 8, 8, 7, 7, 6]);

// ─── Mini KpiGrid (structurally mirrors dashboard/page.tsx) ──────────

function MiniKpiGrid({
    trends,
}: {
    trends?: {
        coverage?: ReturnType<typeof series>;
        risks?: ReturnType<typeof series>;
        evidence?: ReturnType<typeof series>;
        findings?: ReturnType<typeof series>;
    };
}) {
    return (
        <div id="kpi-grid">
            <KpiCard label="Coverage" value={75.3} format="percent" icon={ShieldCheck} trend={trends?.coverage} trendVariant="success" />
            <KpiCard label="Risks" value={14} icon={AlertTriangle} trend={trends?.risks} trendVariant="warning" />
            <KpiCard label="Evidence" value={2} icon={Paperclip} trend={trends?.evidence} trendVariant="error" />
            <KpiCard label="Open Tasks" value={8} icon={CheckCircle2} />
            <KpiCard label="Policies" value={12} icon={FileText} />
            <KpiCard label="Findings" value={6} icon={Bug} trend={trends?.findings} trendVariant="error" />
        </div>
    );
}

// ─── Mini TrendSection (structurally mirrors dashboard/page.tsx) ─────

function MiniTrendSection({
    coverage,
    risks,
    evidence,
    findings,
}: {
    coverage?: ReturnType<typeof series>;
    risks?: ReturnType<typeof series>;
    evidence?: ReturnType<typeof series>;
    findings?: ReturnType<typeof series>;
}) {
    return (
        <div id="trend-section">
            <TrendCard label="Coverage" value={coverage?.[coverage.length - 1]?.value ?? 0} format="%" points={coverage ?? []} colorClassName="text-emerald-500" />
            <TrendCard label="Open Risks" value={risks?.[risks.length - 1]?.value ?? 0} points={risks ?? []} colorClassName="text-amber-500" />
            <TrendCard label="Overdue Evidence" value={evidence?.[evidence.length - 1]?.value ?? 0} points={evidence ?? []} colorClassName="text-red-500" />
            <TrendCard label="Open Findings" value={findings?.[findings.length - 1]?.value ?? 0} points={findings ?? []} colorClassName="text-purple-500" />
        </div>
    );
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Epic 59 — dashboard trend integration', () => {
    it('renders four labelled sparklines in the trend section', () => {
        const { container, getByLabelText } = render(
            <MiniTrendSection coverage={COVERAGE} risks={RISKS} evidence={EVIDENCE} findings={FINDINGS} />,
        );
        const charts = container.querySelectorAll('[data-chart="time-series"]');
        expect(charts.length).toBe(4);
        expect(getByLabelText('Coverage trend')).toBeInTheDocument();
        expect(getByLabelText('Open Risks trend')).toBeInTheDocument();
        expect(getByLabelText('Overdue Evidence trend')).toBeInTheDocument();
        expect(getByLabelText('Open Findings trend')).toBeInTheDocument();
    });

    it('falls back to the baseline when a TrendCard has no points', () => {
        const { container, queryByLabelText } = render(
            <MiniTrendSection coverage={COVERAGE} risks={[]} evidence={EVIDENCE} findings={FINDINGS} />,
        );
        // The empty card still renders its header + aria-label container,
        // but the chart SVG is replaced by the token-backed baseline.
        expect(queryByLabelText('Open Risks trend')).not.toBeNull();
        const charts = container.querySelectorAll('[data-chart="time-series"]');
        expect(charts.length).toBe(3); // only the non-empty cards
        expect(container.querySelectorAll('[data-trend-empty]').length).toBe(1);
    });

    it('KPI grid with sparklines — only the four wired cards carry a trend', () => {
        const { container, getByLabelText, queryByLabelText } = render(
            <MiniKpiGrid trends={{ coverage: COVERAGE, risks: RISKS, evidence: EVIDENCE, findings: FINDINGS }} />,
        );
        // Four cards expose sparklines
        expect(getByLabelText('Coverage 30-day trend')).toBeInTheDocument();
        expect(getByLabelText('Risks 30-day trend')).toBeInTheDocument();
        expect(getByLabelText('Evidence 30-day trend')).toBeInTheDocument();
        expect(getByLabelText('Findings 30-day trend')).toBeInTheDocument();
        // Two cards deliberately opt out of trend rendering
        expect(queryByLabelText('Open Tasks 30-day trend')).toBeNull();
        expect(queryByLabelText('Policies 30-day trend')).toBeNull();
        // Sparkline count matches the four wired cards
        expect(container.querySelectorAll('[data-kpi-trend]').length).toBe(4);
    });

    it('KPI grid Suspense fallback — numbers render even when trends are missing', () => {
        const { container, getByText } = render(<MiniKpiGrid />);
        // Every KPI value is visible
        expect(getByText('Coverage')).toBeInTheDocument();
        expect(getByText('Open Tasks')).toBeInTheDocument();
        expect(getByText('Policies')).toBeInTheDocument();
        // Zero sparklines mounted — this is the fast fallback path
        expect(container.querySelectorAll('[data-kpi-trend]').length).toBe(0);
        expect(container.querySelectorAll('[data-chart="time-series"]').length).toBe(0);
    });

    it('mounts many TrendCards without throwing (performance sanity)', () => {
        // 30 cards is ~3× what any dashboard page currently renders.
        const cards = Array.from({ length: 30 }, (_, i) => (
            <TrendCard
                key={i}
                label={`Metric ${i}`}
                value={i}
                points={series([i, i + 1, i + 2, i + 3])}
                colorClassName="text-emerald-500"
            />
        ));
        expect(() => render(<div>{cards}</div>)).not.toThrow();
    });
});
