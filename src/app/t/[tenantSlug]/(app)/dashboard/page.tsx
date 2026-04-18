import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { getExecutiveDashboard } from '@/app-layer/usecases/dashboard';
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
} from 'lucide-react';
import OnboardingBanner from '@/components/onboarding/OnboardingBanner';
import { Skeleton } from '@/components/ui/skeleton';
import KpiCard from '@/components/ui/KpiCard';
import ProgressCard from '@/components/ui/ProgressCard';
import DonutChart from '@/components/ui/DonutChart';
import TrendLine from '@/components/ui/TrendLine';
import StatusBreakdown from '@/components/ui/StatusBreakdown';
import RiskHeatmap from '@/components/ui/RiskHeatmap';
import ExpiryCalendar from '@/components/ui/ExpiryCalendar';
import RecentActivityCard from './RecentActivityCard';

import type { ExecutiveDashboardPayload } from '@/app-layer/repositories/DashboardRepository';

export const dynamic = 'force-dynamic';

/**
 * Executive Dashboard — React Server Component.
 *
 * Fetches the full executive KPI payload + trend data server-side.
 * Uses reusable widget components for a polished, data-rich layout.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────┐
 *   │  Header (title + notification bell)                │
 *   ├────────┬────────┬────────┬────────┬────────┬──────┤
 *   │ KPI 1  │ KPI 2  │ KPI 3  │ KPI 4  │ KPI 5  │KPI 6│
 *   ├────────────────────┬──────────────────────────────┤
 *   │  Control Coverage  │  Risk Distribution            │
 *   ├────────────────────┼──────────────────────────────┤
 *   │  Evidence Status   │  Compliance Alerts            │
 *   ├────────────────────┴──────────────────────────────┤
 *   │  Trend Line (Suspense-wrapped)                     │
 *   ├────────────────────┬──────────────────────────────┤
 *   │  Quick Actions     │  Recent Activity (Suspense)  │
 *   └────────────────────┴──────────────────────────────┘
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

    const exec = await getExecutiveDashboard(ctx);
    const href = (path: string) => `/t/${tenantSlug}${path}`;

    return (
        <div className="space-y-6 animate-fadeIn">
            <OnboardingBanner />

            {/* ─── Header ─── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-slate-400 text-sm mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    {exec.stats.unreadNotifications > 0 && (
                        <Link href={href('/notifications')} className="btn btn-ghost btn-sm">
                            <Bell className="w-4 h-4" aria-hidden="true" />
                            <span className="badge badge-danger">{exec.stats.unreadNotifications}</span>
                        </Link>
                    )}
                </div>
            </div>

            {/* ─── KPI Grid (6 cards) ─── */}
            <KpiGrid exec={exec} t={t} />

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
                <RiskHeatmap
                    id="risk-heatmap"
                    cells={exec.riskHeatmap}
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
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('quickActions')}</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <Link href={href('/assets')} className="btn btn-secondary btn-sm text-xs">{t('addAsset')}</Link>
                        <Link href={href('/risks')} className="btn btn-secondary btn-sm text-xs">{t('addRisk')}</Link>
                        <Link href={href('/evidence')} className="btn btn-secondary btn-sm text-xs">{t('addEvidence')}</Link>
                        <Link href={href('/audits')} className="btn btn-secondary btn-sm text-xs">{t('newAudit')}</Link>
                        <Link href={href('/policies')} className="btn btn-secondary btn-sm text-xs">{t('newPolicy')}</Link>
                        <Link href={href('/reports')} className="btn btn-secondary btn-sm text-xs">{t('exportReports')}</Link>
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KpiGrid({ exec, t }: { exec: ExecutiveDashboardPayload; t: (key: string, opts?: any) => string }) {
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
            />
            <KpiCard
                id="kpi-risks"
                label={t('risks')}
                value={exec.stats.risks}
                icon={AlertTriangle}
                gradient="from-amber-500 to-orange-500"
                subtitle={t('highCritical', { count: exec.stats.highRisks })}
            />
            <KpiCard
                id="kpi-evidence"
                label={t('evidence')}
                value={exec.stats.evidence}
                icon={Paperclip}
                gradient="from-purple-500 to-pink-500"
                subtitle={`${exec.evidenceExpiry.overdue} overdue`}
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
                { label: 'Not Started', value: controlCoverage.notStarted, color: 'bg-slate-600' },
            ]}
            footer={
                <Link href={href('/clauses')} className="text-brand-400 hover:text-brand-300">
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
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Risk Distribution</h3>
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
                                <span className="text-slate-400">{item.label}</span>
                            </div>
                            <span className="text-slate-300 font-medium tabular-nums">{item.value}</span>
                        </div>
                    ))}
                    <div className="border-t border-slate-700/50 pt-2 mt-2 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Open / Mitigating</span>
                        <span className="text-slate-300 font-medium tabular-nums">
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
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('complianceAlerts')}</h3>
            <div className="space-y-2">
                {alerts.length === 0 ? (
                    <p className="text-emerald-400 text-sm">{t('noAlerts')}</p>
                ) : (
                    alerts.map((alert, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full ${alert.color} shrink-0`} />
                            <span className="text-slate-400">{alert.text}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Trend Section (async, Suspense-compatible) ──────────────────────

async function TrendSection({ ctx }: { ctx: Parameters<typeof getComplianceTrends>[0] }) {
    let trends: TrendPayload;
    try {
        trends = await getComplianceTrends(ctx, 30);
    } catch {
        // Trend data may not be available yet (no snapshots generated)
        return null;
    }

    // No trend data yet — show a helpful empty state
    if (trends.daysAvailable < 2) {
        return (
            <div className="glass-card p-5" id="trend-section">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Compliance Trends</h3>
                <p className="text-xs text-slate-500">
                    Trend charts will appear here after the daily compliance snapshot runs.
                    Snapshots are generated automatically at 05:00 UTC.
                </p>
            </div>
        );
    }

    const coverageData = trends.dataPoints.map(d => d.controlCoveragePercent);
    const risksOpenData = trends.dataPoints.map(d => d.risksOpen);
    const evidenceOverdueData = trends.dataPoints.map(d => d.evidenceOverdue);
    const findingsData = trends.dataPoints.map(d => d.findingsOpen);

    return (
        <div className="glass-card p-5" id="trend-section">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-300">Compliance Trends</h3>
                <span className="text-xs text-slate-500">{trends.daysAvailable} day{trends.daysAvailable !== 1 ? 's' : ''} of data</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <TrendCard
                    label="Coverage"
                    value={coverageData[coverageData.length - 1]}
                    format="%"
                    data={coverageData}
                    color="#22c55e"
                />
                <TrendCard
                    label="Open Risks"
                    value={risksOpenData[risksOpenData.length - 1]}
                    data={risksOpenData}
                    color="#f59e0b"
                />
                <TrendCard
                    label="Overdue Evidence"
                    value={evidenceOverdueData[evidenceOverdueData.length - 1]}
                    data={evidenceOverdueData}
                    color="#ef4444"
                />
                <TrendCard
                    label="Open Findings"
                    value={findingsData[findingsData.length - 1]}
                    data={findingsData}
                    color="#a855f7"
                />
            </div>
        </div>
    );
}

/** Compact trend mini-card: label + current value + sparkline */
function TrendCard({ label, value, format, data, color }: {
    label: string;
    value: number;
    format?: string;
    data: number[];
    color: string;
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-sm font-semibold text-slate-200 tabular-nums">
                    {value}{format ?? ''}
                </span>
            </div>
            <TrendLine
                data={data}
                color={color}
                height={48}
                showArea={true}
                showEndDot={true}
                label={`${label} trend`}
            />
        </div>
    );
}
