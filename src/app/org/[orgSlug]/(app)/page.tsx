import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
    ShieldCheck,
    AlertTriangle,
    Paperclip,
    Building2,
    ChevronRight,
    Activity,
    LineChart,
    Layers,
} from 'lucide-react';

import { getOrgCtx } from '@/app-layer/context';
import {
    getPortfolioSummary,
    getPortfolioTenantHealth,
    getPortfolioTrends,
} from '@/app-layer/usecases/portfolio';
import KpiCard from '@/components/ui/KpiCard';
import DonutChart, { type DonutSegment } from '@/components/ui/DonutChart';
import { TrendCard } from '@/components/ui/TrendCard';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import type {
    PortfolioSummary,
    TenantHealthRow,
    PortfolioTrend,
    RagBadge,
} from '@/app-layer/schemas/portfolio';

/**
 * Epic O-4 — portfolio overview (CISO landing page).
 *
 * Server-rendered, read-only. Fetches the three portfolio views in
 * parallel via the existing usecase layer (no API round-trip — same
 * pattern as the tenant dashboard). Renders four spec'd sections in
 * priority order:
 *
 *   1. Stat cards — top-line health (coverage, risks, evidence,
 *      tenants).
 *   2. RAG donut + risk-trend area chart side-by-side — distribution
 *      and direction.
 *   3. Coverage by tenant — sorted, drill-down per row.
 *   4. Drill-down CTAs — entry points into the three deep-dive lists.
 *
 * No edit controls. The page reads only; every mutation surface lives
 * elsewhere (org/members, org/settings, per-tenant pages reached via
 * drill-down).
 */
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default async function PortfolioOverviewPage({ params }: PageProps) {
    const { orgSlug } = await params;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        // Layout already handled the auth/membership gate; this catch
        // is defence-in-depth in case a request reaches the page
        // through an unusual path.
        notFound();
    }

    // Parallel fetch — three independent reads, no inter-dependency.
    const [summary, healthRows, trend] = await Promise.all([
        getPortfolioSummary(ctx),
        getPortfolioTenantHealth(ctx),
        getPortfolioTrends(ctx, 90),
    ]);

    return (
        <div className="space-y-8">
            <PageHeader summary={summary} />

            <StatCardsRow summary={summary} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RagDistributionCard summary={summary} />
                <RiskTrendCard trend={trend} />
            </div>

            <TenantCoverageList rows={healthRows} />

            <DrillDownCtas summary={summary} orgSlug={orgSlug} />
        </div>
    );
}

// ─── Sections ────────────────────────────────────────────────────────

function PageHeader({ summary }: { summary: PortfolioSummary }) {
    const generated = new Date(summary.generatedAt);
    return (
        <header className="flex items-end justify-between gap-4 flex-wrap">
            <div>
                <h1 className="text-2xl font-semibold text-content-emphasis">Portfolio Overview</h1>
                <p className="text-sm text-content-muted mt-1">
                    {summary.tenants.total} tenant{summary.tenants.total === 1 ? '' : 's'}
                    {summary.tenants.pending > 0 && (
                        <> · {summary.tenants.pending} pending first snapshot</>
                    )}
                </p>
            </div>
            <p className="text-xs text-content-subtle tabular-nums">
                Generated {generated.toLocaleString()}
            </p>
        </header>
    );
}

function StatCardsRow({ summary }: { summary: PortfolioSummary }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
                label="Coverage"
                value={summary.controls.coveragePercent}
                format="percent"
                icon={ShieldCheck}
                gradient="from-emerald-500 to-teal-500"
                subtitle={`${summary.controls.implemented.toLocaleString()} of ${summary.controls.applicable.toLocaleString()} controls implemented`}
                id="org-stat-coverage"
            />
            <KpiCard
                label="Critical Risks"
                value={summary.risks.critical}
                format="number"
                icon={AlertTriangle}
                gradient="from-rose-500 to-red-500"
                subtitle={`${summary.risks.open.toLocaleString()} open · ${summary.risks.high.toLocaleString()} high`}
                id="org-stat-critical-risks"
            />
            <KpiCard
                label="Overdue Evidence"
                value={summary.evidence.overdue}
                format="number"
                icon={Paperclip}
                gradient="from-amber-500 to-orange-500"
                subtitle={`${summary.evidence.dueSoon7d.toLocaleString()} due within 7 days`}
                id="org-stat-overdue-evidence"
            />
            <KpiCard
                label="Tenants"
                value={summary.tenants.total}
                format="number"
                icon={Building2}
                gradient="from-blue-500 to-indigo-500"
                subtitle={`${summary.tenants.snapshotted.toLocaleString()} snapshotted`}
                id="org-stat-tenants"
            />
        </div>
    );
}

const RAG_COLORS: Record<RagBadge | 'PENDING', string> = {
    GREEN: 'rgb(16, 185, 129)',
    AMBER: 'rgb(245, 158, 11)',
    RED: 'rgb(239, 68, 68)',
    PENDING: 'rgb(148, 163, 184)',
};

function RagDistributionCard({ summary }: { summary: PortfolioSummary }) {
    const totalCategorised = summary.rag.green + summary.rag.amber + summary.rag.red;
    const segments: DonutSegment[] = [
        { label: 'Healthy', value: summary.rag.green, color: RAG_COLORS.GREEN },
        { label: 'At risk', value: summary.rag.amber, color: RAG_COLORS.AMBER },
        { label: 'Critical', value: summary.rag.red, color: RAG_COLORS.RED },
        { label: 'Pending snapshot', value: summary.rag.pending, color: RAG_COLORS.PENDING },
    ].filter((s) => s.value > 0);

    return (
        <section
            className="glass-card p-6"
            aria-labelledby="org-rag-heading"
            id="org-rag-distribution"
        >
            <div className="flex items-baseline justify-between mb-4">
                <h2 id="org-rag-heading" className="text-sm font-semibold uppercase tracking-widest text-content-subtle">
                    Tenant Health Distribution
                </h2>
                {totalCategorised > 0 && (
                    <span className="text-xs text-content-muted">
                        {totalCategorised} of {summary.tenants.total} tenants
                    </span>
                )}
            </div>
            {segments.length === 0 ? (
                <EmptyState
                    icon={Activity}
                    title="No snapshots yet"
                    description="Tenant health appears once a daily snapshot has been recorded."
                />
            ) : (
                <DonutChart
                    segments={segments}
                    centerLabel={totalCategorised > 0 ? `${summary.rag.green + summary.rag.amber + summary.rag.red}` : undefined}
                    centerSub="Active tenants"
                    showLegend
                    id="org-rag-donut"
                />
            )}
        </section>
    );
}

function RiskTrendCard({ trend }: { trend: PortfolioTrend }) {
    const points = trend.dataPoints.map((p) => ({
        date: new Date(p.date),
        value: p.risksOpen,
    }));
    const latest = points.length > 0 ? points[points.length - 1].value : 0;

    if (points.length === 0) {
        return (
            <section
                className="glass-card p-6"
                aria-labelledby="org-risk-trend-heading"
                id="org-risk-trend"
            >
                <h2
                    id="org-risk-trend-heading"
                    className="text-sm font-semibold uppercase tracking-widest text-content-subtle mb-4"
                >
                    Open Risks (90 days)
                </h2>
                <EmptyState
                    icon={LineChart}
                    title="Trend pending"
                    description="The org-wide risk trend appears once snapshots have been collected for at least one day."
                />
            </section>
        );
    }

    return (
        <div id="org-risk-trend">
            <TrendCard
                label={`Open Risks (${trend.daysAvailable}d, ${trend.tenantsAggregated} tenants)`}
                value={latest}
                points={points}
                colorClassName="text-rose-500"
            />
        </div>
    );
}

function TenantCoverageList({ rows }: { rows: TenantHealthRow[] }) {
    if (rows.length === 0) {
        return (
            <section
                className="glass-card p-6"
                aria-labelledby="org-tenants-heading"
                id="org-tenant-coverage"
            >
                <h2
                    id="org-tenants-heading"
                    className="text-sm font-semibold uppercase tracking-widest text-content-subtle mb-4"
                >
                    Coverage by Tenant
                </h2>
                <EmptyState
                    icon={Layers}
                    title="No tenants linked"
                    description="Add tenants to this organization to see per-tenant coverage and health."
                />
            </section>
        );
    }

    // Sort: RED first (most actionable), then AMBER, then GREEN, then PENDING.
    // Within a band, alphabetical by name.
    const ragOrder: Record<RagBadge | 'PENDING', number> = {
        RED: 0,
        AMBER: 1,
        GREEN: 2,
        PENDING: 3,
    };
    const sorted = [...rows].sort((a, b) => {
        const ra = ragOrder[a.rag ?? 'PENDING'];
        const rb = ragOrder[b.rag ?? 'PENDING'];
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
    });

    return (
        <section
            className="glass-card p-6"
            aria-labelledby="org-tenants-heading"
            id="org-tenant-coverage"
        >
            <div className="flex items-baseline justify-between mb-4">
                <h2
                    id="org-tenants-heading"
                    className="text-sm font-semibold uppercase tracking-widest text-content-subtle"
                >
                    Coverage by Tenant
                </h2>
                <span className="text-xs text-content-muted">
                    {sorted.length} tenant{sorted.length === 1 ? '' : 's'}
                </span>
            </div>
            <ul className="divide-y divide-border-subtle" data-testid="org-tenant-coverage-list">
                {sorted.map((row) => (
                    <li key={row.tenantId} className="py-3">
                        <Link
                            href={row.drillDownUrl}
                            className="flex items-center gap-4 hover:bg-bg-muted -mx-3 px-3 py-2 rounded-lg transition-colors group"
                            data-testid={`org-tenant-row-${row.slug}`}
                        >
                            <RagPill rag={row.rag} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-sm font-medium text-content-emphasis truncate">
                                        {row.name}
                                    </span>
                                    <span className="text-xs tabular-nums text-content-muted">
                                        {row.coveragePercent !== null
                                            ? `${row.coveragePercent.toFixed(1)}%`
                                            : '—'}
                                    </span>
                                </div>
                                <CoverageBar percent={row.coveragePercent} rag={row.rag} />
                                <div className="mt-1.5 flex items-center gap-4 text-xs text-content-muted">
                                    <span>
                                        {row.openRisks ?? '—'} open risks
                                    </span>
                                    <span>
                                        {row.criticalRisks ?? 0} critical
                                    </span>
                                    <span>
                                        {row.overdueEvidence ?? 0} overdue evidence
                                    </span>
                                </div>
                            </div>
                            <ChevronRight
                                className="w-4 h-4 text-content-subtle group-hover:text-content-emphasis transition-colors"
                                aria-hidden="true"
                            />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function RagPill({ rag }: { rag: RagBadge | null }) {
    if (rag === null) {
        return <StatusBadge variant="neutral">Pending</StatusBadge>;
    }
    const variant: 'success' | 'warning' | 'error' =
        rag === 'GREEN' ? 'success' : rag === 'AMBER' ? 'warning' : 'error';
    return <StatusBadge variant={variant}>{rag}</StatusBadge>;
}

function CoverageBar({ percent, rag }: { percent: number | null; rag: RagBadge | null }) {
    const width = percent === null ? 0 : Math.min(100, Math.max(0, percent));
    const colorClass =
        rag === 'GREEN'
            ? 'bg-emerald-500'
            : rag === 'AMBER'
              ? 'bg-amber-500'
              : rag === 'RED'
                ? 'bg-rose-500'
                : 'bg-border-emphasis';
    return (
        <div className="mt-1 h-1.5 rounded-full bg-bg-muted overflow-hidden">
            <div
                className={`h-full ${colorClass} transition-all`}
                style={{ width: `${width}%` }}
                role="progressbar"
                aria-valuenow={width}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={percent !== null ? `${percent.toFixed(1)}% coverage` : 'Coverage pending'}
            />
        </div>
    );
}

function DrillDownCtas({
    summary,
    orgSlug,
}: {
    summary: PortfolioSummary;
    orgSlug: string;
}) {
    const ctas = [
        {
            label: 'Non-Performing Controls',
            count: summary.controls.applicable - summary.controls.implemented,
            href: `/org/${orgSlug}/controls`,
            icon: ShieldCheck,
            tone: 'rose',
        },
        {
            label: 'Critical Risks',
            count: summary.risks.critical,
            href: `/org/${orgSlug}/risks`,
            icon: AlertTriangle,
            tone: 'amber',
        },
        {
            label: 'Overdue Evidence',
            count: summary.evidence.overdue,
            href: `/org/${orgSlug}/evidence`,
            icon: Paperclip,
            tone: 'orange',
        },
    ] as const;

    return (
        <section
            aria-labelledby="org-drilldown-heading"
            id="org-drilldown-ctas"
            className="space-y-3"
        >
            <h2
                id="org-drilldown-heading"
                className="text-sm font-semibold uppercase tracking-widest text-content-subtle"
            >
                Drill-down
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {ctas.map((cta) => (
                    <Link
                        key={cta.href}
                        href={cta.href}
                        className="glass-card p-4 hover:shadow-lg transition-all group"
                        data-testid={`org-drilldown-${cta.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-content-emphasis">
                                <cta.icon
                                    className={`w-5 h-5 text-${cta.tone}-500`}
                                    aria-hidden="true"
                                />
                                <span className="font-medium text-sm">{cta.label}</span>
                            </div>
                            <ChevronRight
                                className="w-4 h-4 text-content-subtle group-hover:text-content-emphasis transition-colors"
                                aria-hidden="true"
                            />
                        </div>
                        <p className="mt-3 text-2xl font-bold text-content-emphasis tabular-nums">
                            {cta.count.toLocaleString()}
                        </p>
                        <p className="text-xs text-content-muted">
                            {cta.count === 1 ? 'item' : 'items'} across the portfolio
                        </p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
