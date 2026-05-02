import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { getExecutiveDashboard } from '@/app-layer/usecases/dashboard';
import { getRiskMatrixConfig } from '@/app-layer/usecases/risk-matrix-config';
import { getComplianceTrends, type TrendPayload } from '@/app-layer/usecases/compliance-trends';
import {
    ShieldCheck,
    AlertTriangle,
    Paperclip,
    CheckCircle2,
    Bug,
    Bell,
    FileText,
    Building2,
    TrendingUp,
} from 'lucide-react';
import OnboardingBanner from '@/components/onboarding/OnboardingBanner';
import { Skeleton } from '@/components/ui/skeleton';
import KpiCard from '@/components/ui/KpiCard';
import ProgressCard from '@/components/ui/ProgressCard';
import DonutChart from '@/components/ui/DonutChart';
import { TrendCard } from '@/components/ui/TrendCard';
import StatusBreakdown from '@/components/ui/StatusBreakdown';
import { RiskMatrix } from '@/components/ui/RiskMatrix';
import ExpiryCalendar from '@/components/ui/ExpiryCalendar';
import RecentActivityCard from './RecentActivityCard';
import { StatusBadge } from '@/components/ui/status-badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@dub/utils';

import type { ExecutiveDashboardPayload } from '@/app-layer/repositories/DashboardRepository';

export const dynamic = 'force-dynamic';

/**
 * Executive Dashboard — React Server Component.
 *
 * Fetches the full executive KPI payload + trend data server-side.
 * Uses reusable widget components for a polished, data-rich layout.
 */
export default async function DashboardPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    const [t, ctx] = await Promise.all([
        getTranslations('dashboard'),
        getTenantCtx({ tenantSlug }),
    ]);

    const [exec, matrixConfig] = await Promise.all([
        getExecutiveDashboard(ctx),
        getRiskMatrixConfig(ctx),
    ]);
    const href = (path: string) => `/t/${tenantSlug}${path}`;

    return (
        <div className="space-y-6 animate-fadeIn">
            <OnboardingBanner />

            {/* ─── Header ─── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-content-emphasis">{t('title')}</h1>
                    <p className="text-content-muted text-sm mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    {exec.stats.unreadNotifications > 0 && (
                        <Link href={href('/notifications')} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                            <Bell className="w-4 h-4" aria-hidden="true" />
                            <StatusBadge variant="error" icon={null} size="sm">{exec.stats.unreadNotifications}</StatusBadge>
                        </Link>
                    )}
                </div>
            </div>

            {/* ─── KPI Grid (6 cards) ─── */}
            {/* Values render immediately; sparklines stream in via Suspense once
                the trend snapshot resolves so we never block the numbers on the
                slower daily-snapshot read. */}
            <Suspense fallback={<KpiGrid exec={exec} t={t} />}>
                <KpiGridWithTrends exec={exec} t={t} ctx={ctx} />
            </Suspense>

            {/* ─── Control Coverage + Risk Distribution ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ControlCoverageSection exec={exec} href={href} t={t} />
                <RiskDistributionSection exec={exec} />
            </div>

            {/* ─── Evidence Status + Compliance Alerts ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <EvidenceStatusSection exec={exec} />
                <ComplianceAlerts exec={exec} t={t} />
            </div>

            {/* ─── Risk Heatmap + Evidence Expiry ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/*
                  Epic 44 — `<RiskMatrix>` replaces the legacy
                  `<RiskHeatmap>`. Reads dimensions + axis labels +
                  bands from the tenant's `RiskMatrixConfig`. Tenants
                  that haven't customised resolve to the canonical
                  5×5 default — visual parity with the prior heatmap
                  preserved through the band's hex colours.
                */}
                <RiskMatrix
                    id="risk-heatmap"
                    config={matrixConfig}
                    cells={exec.riskHeatmap}
                    showSwapToggle={false}
                />
                <ExpiryCalendar
                    id="expiry-calendar"
                    items={exec.upcomingExpirations}
                />
            </div>

            {/* ─── Trend Section (Suspense) ─── */}
            <Suspense fallback={
                <div className="glass-card p-5 space-y-3">
                    <Skeleton className="h-4 w-full sm:w-48" />
                    <Skeleton className="h-16 w-full" />
                </div>
            }>
                <TrendSection ctx={ctx} />
            </Suspense>

            {/* ─── Quick Actions + Recent Activity ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-content-default mb-3">{t('quickActions')}</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <Link href={href('/assets')} className={cn(buttonVariants({ variant: 'secondary', size: 'xs' }))}>{t('addAsset')}</Link>
                        <Link href={href('/risks')} className={cn(buttonVariants({ variant: 'secondary', size: 'xs' }))}>{t('addRisk')}</Link>
                        <Link href={href('/evidence')} className={cn(buttonVariants({ variant: 'secondary', size: 'xs' }))}>{t('addEvidence')}</Link>
                        <Link href={href('/audits')} className={cn(buttonVariants({ variant: 'secondary', size: 'xs' }))}>{t('newAudit')}</Link>
                        <Link href={href('/policies')} className={cn(buttonVariants({ variant: 'secondary', size: 'xs' }))}>{t('newPolicy')}</Link>
                        <Link href={href('/reports')} className={cn(buttonVariants({ variant: 'secondary', size: 'xs' }))}>{t('exportReports')}</Link>
                    </div>
                </div>

                <Suspense fallback={
                    <div className="glass-card p-5 space-y-3">
                        <Skeleton className="h-4 w-full sm:w-32" />
                        <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <Skeleton className="h-3 w-full sm:w-28 shrink-0" />
                                    <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-full' : 'w-3/4'}`} />
                                </div>
                            ))}
                        </div>
                    </div>
                }>
                    <RecentActivityCard tenantSlug={tenantSlug} label={t('recentActivity')} noActivityLabel={t('noRecentActivity')} />
                </Suspense>
            </div>
        </div>
    );
}

// ─── KPI Grid ───────────────────────────────────────────────────────

type KpiTrendBundle = {
    coverage?: ReadonlyArray<{ date: Date; value: number }>;
    risks?: ReadonlyArray<{ date: Date; value: number }>;
    evidence?: ReadonlyArray<{ date: Date; value: number }>;
    findings?: ReadonlyArray<{ date: Date; value: number }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KpiGrid({ exec, t, trends }: { exec: ExecutiveDashboardPayload; t: (key: string, opts?: any) => string; trends?: KpiTrendBundle }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" id="kpi-grid">
            <KpiCard
                id="kpi-coverage"
                label={t('controls')}
                value={exec.controlCoverage.coveragePercent}
                format="percent"
                icon={ShieldCheck}
                gradient="from-emerald-500 to-teal-500"
                subtitle={`${exec.controlCoverage.implemented} of ${exec.controlCoverage.applicable} implemented`}
                trend={trends?.coverage}
                trendVariant="success"
            />
            <KpiCard
                id="kpi-risks"
                label={t('risks')}
                value={exec.stats.risks}
                icon={AlertTriangle}
                gradient="from-amber-500 to-orange-500"
                subtitle={t('highCritical', { count: exec.stats.highRisks })}
                trend={trends?.risks}
                trendVariant="warning"
            />
            <KpiCard
                id="kpi-evidence"
                label={t('evidence')}
                value={exec.stats.evidence}
                icon={Paperclip}
                gradient="from-purple-500 to-pink-500"
                subtitle={`${exec.evidenceExpiry.overdue} overdue`}
                trend={trends?.evidence}
                trendVariant="error"
            />
            <KpiCard
                id="kpi-tasks"
                label={t('openTasks')}
                value={exec.stats.openTasks}
                icon={CheckCircle2}
                gradient="from-indigo-500 to-blue-500"
                subtitle={`${exec.taskSummary.overdue} overdue`}
            />
            <KpiCard
                id="kpi-policies"
                label="Policies"
                value={exec.policySummary.total}
                icon={FileText}
                gradient="from-sky-500 to-cyan-500"
                subtitle={`${exec.policySummary.published} published`}
            />
            <KpiCard
                id="kpi-findings"
                label={t('openFindings')}
                value={exec.stats.openFindings}
                icon={Bug}
                gradient="from-red-500 to-rose-500"
                trend={trends?.findings}
                trendVariant="error"
            />
        </div>
    );
}

// ─── Control Coverage ────────────────────────────────────────────────

function ControlCoverageSection({ exec, href, t }: {
    exec: ExecutiveDashboardPayload;
    href: (path: string) => string;
    t: (key: string) => string;
}) {
    const { controlCoverage } = exec;

    return (
        <ProgressCard
            id="control-coverage"
            label="Control Coverage"
            value={controlCoverage.implemented}
            max={controlCoverage.applicable || 1}
            segments={[
                { label: 'Implemented', value: controlCoverage.implemented, color: 'bg-emerald-500' },
                { label: 'In Progress', value: controlCoverage.inProgress, color: 'bg-amber-500' },
                { label: 'Not Started', value: controlCoverage.notStarted, color: 'bg-border-emphasis' },
            ]}
            // GAP-CI-77: brand-emphasis (not brand-default) for AA on
            // light cream — orange #D04A02 only hits 4.13:1 on cream
            // while #B83D00 sits at 5.8:1. Dark-theme yellow remains
            // high contrast either way.
            footer={
                <Link href={href('/clauses')} className="text-[var(--brand-emphasis)] hover:text-[var(--brand-muted)]">
                    {t('viewAllClauses')}
                </Link>
            }
        />
    );
}

// ─── Risk Distribution ───────────────────────────────────────────────

function RiskDistributionSection({ exec }: { exec: ExecutiveDashboardPayload }) {
    const { riskBySeverity, riskByStatus } = exec;

    return (
        <div className="glass-card p-5" id="risk-distribution">
            <h3 className="text-sm font-semibold text-content-default mb-3">Risk Distribution</h3>
            <div className="grid grid-cols-2 gap-4 items-center">
                {/* Donut: severity */}
                <DonutChart
                    id="risk-severity-donut"
                    segments={[
                        { label: 'Critical', value: riskBySeverity.critical, color: '#dc2626' },
                        { label: 'High', value: riskBySeverity.high, color: '#f97316' },
                        { label: 'Medium', value: riskBySeverity.medium, color: '#f59e0b' },
                        { label: 'Low', value: riskBySeverity.low, color: '#22c55e' },
                    ]}
                    size={130}
                    centerLabel={String(riskBySeverity.critical + riskBySeverity.high + riskBySeverity.medium + riskBySeverity.low)}
                    centerSub="Total"
                    showLegend={false}
                />

                {/* Status breakdown sidebar */}
                <div className="space-y-2">
                    {[
                        { label: 'Critical', value: riskBySeverity.critical, color: 'bg-red-500' },
                        { label: 'High', value: riskBySeverity.high, color: 'bg-orange-500' },
                        { label: 'Medium', value: riskBySeverity.medium, color: 'bg-amber-500' },
                        { label: 'Low', value: riskBySeverity.low, color: 'bg-emerald-500' },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${item.color} shrink-0`} />
                                <span className="text-content-muted">{item.label}</span>
                            </div>
                            <span className="text-content-default font-medium tabular-nums">{item.value}</span>
                        </div>
                    ))}
                    <div className="border-t border-border-subtle pt-2 mt-2 flex items-center justify-between text-xs">
                        <span className="text-content-muted">Open / Mitigating</span>
                        <span className="text-content-default font-medium tabular-nums">
                            {riskByStatus.open} / {riskByStatus.mitigating}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Evidence Status ─────────────────────────────────────────────────

function EvidenceStatusSection({ exec }: { exec: ExecutiveDashboardPayload }) {
    const { evidenceExpiry } = exec;

    return (
        <StatusBreakdown
            id="evidence-status"
            label="Evidence Status"
            items={[
                { label: 'Overdue', value: evidenceExpiry.overdue, color: 'bg-red-500' },
                { label: 'Due ≤7d', value: evidenceExpiry.dueSoon7d, color: 'bg-amber-500' },
                { label: 'Due ≤30d', value: evidenceExpiry.dueSoon30d, color: 'bg-yellow-500' },
                { label: 'Current', value: evidenceExpiry.current, color: 'bg-emerald-500' },
            ]}
        />
    );
}

// ─── Compliance Alerts ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ComplianceAlerts({ exec, t }: { exec: ExecutiveDashboardPayload; t: (key: string, opts?: any) => string }) {
    const { stats, evidenceExpiry, taskSummary, vendorSummary, policySummary } = exec;
    const alerts: { color: string; text: string }[] = [];

    if (evidenceExpiry.overdue > 0) alerts.push({ color: 'bg-red-500', text: t('overdueEvidence', { count: evidenceExpiry.overdue }) });
    if (stats.pendingEvidence > 0) alerts.push({ color: 'bg-amber-500', text: t('evidenceAwaitingReview', { count: stats.pendingEvidence }) });
    if (stats.highRisks > 0) alerts.push({ color: 'bg-orange-500', text: t('highCriticalRisks', { count: stats.highRisks }) });
    if (taskSummary.overdue > 0) alerts.push({ color: 'bg-red-400', text: `${taskSummary.overdue} overdue tasks` });
    if (policySummary.overdueReview > 0) alerts.push({ color: 'bg-yellow-500', text: `${policySummary.overdueReview} policies need review` });
    if (vendorSummary.overdueReview > 0) alerts.push({ color: 'bg-purple-500', text: `${vendorSummary.overdueReview} vendors need review` });
    if (stats.openFindings > 0) alerts.push({ color: 'bg-purple-500', text: t('openAuditFindings', { count: stats.openFindings }) });

    return (
        <div className="glass-card p-5" id="compliance-alerts">
            <h3 className="text-sm font-semibold text-content-default mb-3">{t('complianceAlerts')}</h3>
            <div className="space-y-2">
                {alerts.length === 0 ? (
                    <p className="text-content-success text-sm">{t('noAlerts')}</p>
                ) : (
                    alerts.map((alert, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full ${alert.color} shrink-0`} />
                            <span className="text-content-muted">{alert.text}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ─── KPI Grid with trends (async, Suspense-compatible) ───────────────
//
// Wraps the sync KpiGrid with a trend fetch. The parent Suspense
// fallback renders the sync KpiGrid immediately so values are never
// gated on the trend read. Trend snapshot failures degrade silently —
// KpiGrid just renders without sparklines.

async function KpiGridWithTrends({
    exec,
    t,
    ctx,
}: {
    exec: ExecutiveDashboardPayload;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t: (key: string, opts?: any) => string;
    ctx: Parameters<typeof getComplianceTrends>[0];
}) {
    let trends: KpiTrendBundle | undefined;
    try {
        const payload = await getComplianceTrends(ctx, 30);
        if (payload.daysAvailable >= 2) {
            trends = {
                coverage: payload.dataPoints.map(d => ({ date: new Date(d.date), value: d.controlCoveragePercent })),
                risks: payload.dataPoints.map(d => ({ date: new Date(d.date), value: d.risksOpen })),
                evidence: payload.dataPoints.map(d => ({ date: new Date(d.date), value: d.evidenceOverdue })),
                findings: payload.dataPoints.map(d => ({ date: new Date(d.date), value: d.findingsOpen })),
            };
        }
    } catch {
        trends = undefined;
    }
    return <KpiGrid exec={exec} t={t} trends={trends} />;
}

// ─── Trend Section (async, Suspense-compatible) ──────────────────────

async function TrendSection({ ctx }: { ctx: Parameters<typeof getComplianceTrends>[0] }) {
    let trends: TrendPayload;
    try {
        trends = await getComplianceTrends(ctx, 30);
    } catch {
        return null;
    }

    if (trends.daysAvailable < 2) {
        // Inline empty state — this is a server component, and
        // <EmptyState>'s `icon` prop takes a Component reference
        // (`React.ElementType`). Passing a function/forwardRef from a
        // server component to a client component is a Next.js 15
        // violation ("Functions cannot be passed directly to Client
        // Components"). EmptyState is the right primitive for
        // client-page empty states; this server-rendered page renders
        // the icon JSX inline so the SSR boundary only sees serialised
        // React nodes.
        return (
            <div
                className="glass-card flex flex-col items-center justify-center gap-y-4 py-12 px-6"
                id="trend-section"
            >
                <div className="flex size-14 items-center justify-center rounded-xl border border-border-subtle bg-bg-muted">
                    <TrendingUp className="size-6 text-content-muted" aria-hidden="true" />
                </div>
                <p className="text-center text-base font-medium text-content-emphasis">
                    Compliance Trends
                </p>
                <p className="max-w-sm text-balance text-center text-sm text-content-muted">
                    Trend charts will appear here after the daily compliance snapshot runs.
                    Snapshots are generated automatically at 05:00 UTC.
                </p>
            </div>
        );
    }

    const coveragePoints = trends.dataPoints.map(d => ({ date: new Date(d.date), value: d.controlCoveragePercent }));
    const risksOpenPoints = trends.dataPoints.map(d => ({ date: new Date(d.date), value: d.risksOpen }));
    const evidenceOverduePoints = trends.dataPoints.map(d => ({ date: new Date(d.date), value: d.evidenceOverdue }));
    const findingsPoints = trends.dataPoints.map(d => ({ date: new Date(d.date), value: d.findingsOpen }));

    return (
        <div className="glass-card p-5" id="trend-section">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-content-default">Compliance Trends</h3>
                <span className="text-xs text-content-subtle">{trends.daysAvailable} day{trends.daysAvailable !== 1 ? 's' : ''} of data</span>
            </div>
            {/* GAP-CI-77: TrendCard label colours use semantic status
                tokens (not raw Tailwind palette) so theme-aware contrast
                is enforced. Tailwind text-amber-500 / text-red-500 fail
                AA against light-theme cream (~3.5:1); the status tokens
                are tuned to 5+:1 in both themes. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <TrendCard
                    label="Coverage"
                    value={coveragePoints[coveragePoints.length - 1].value}
                    format="%"
                    points={coveragePoints}
                    colorClassName="text-content-success"
                />
                <TrendCard
                    label="Open Risks"
                    value={risksOpenPoints[risksOpenPoints.length - 1].value}
                    points={risksOpenPoints}
                    colorClassName="text-content-warning"
                />
                <TrendCard
                    label="Overdue Evidence"
                    value={evidenceOverduePoints[evidenceOverduePoints.length - 1].value}
                    points={evidenceOverduePoints}
                    colorClassName="text-content-error"
                />
                <TrendCard
                    label="Open Findings"
                    value={findingsPoints[findingsPoints.length - 1].value}
                    points={findingsPoints}
                    colorClassName="text-content-info"
                />
            </div>
        </div>
    );
}
