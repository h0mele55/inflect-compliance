'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/queryKeys';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { CompactFilterBar } from '@/components/filters/CompactFilterBar';
import { risksFilterConfig } from '@/components/filters/configs';
import { DataTable, createColumns } from '@/components/ui/table';

interface RiskListItem {
    id: string;
    title: string;
    threat: string;
    likelihood: number;
    impact: number;
    inherentScore: number;
    treatment: string | null;
    status?: string;
    nextReviewAt?: string | null;
    treatmentOwner?: string | null;
    asset: { name: string } | null;
    controls: unknown[];
}

interface RisksClientProps {
    initialRisks: RiskListItem[];
    initialFilters?: Record<string, string>;
    tenantSlug: string;
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };
    translations: {
        title: string;
        risksIdentified: string;
        heatmap: string;
        register: string;
        addRisk: string;
        riskTitle: string;
        asset: string;
        threat: string;
        score: string;
        level: string;
        treatment: string;
        controlsCol: string;
        noRisks: string;
        low: string;
        medium: string;
        high: string;
        critical: string;
        untreated: string;
        heatmapTitle: string;
        totalRisks: string;
        avgScore: string;
        openRisks: string;
        overdueReviews: string;
    };
}

/**
 * Client island for risks — handles filters, heatmap toggle, and interactive list.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 */
export function RisksClient({
    initialRisks,
    initialFilters,
    tenantSlug,
    permissions,
    translations: t,
}: RisksClientProps) {
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const router = useRouter();
    const [view, setView] = useState<'register' | 'heatmap'>('register');

    // URL-driven filter state
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'status', 'category'], initialFilters);

    // React Query with server-hydrated initial data
    const hasFilters = !!(filters.q || filters.status || filters.category);
    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = serverHadFilters
        ? JSON.stringify(filters) === JSON.stringify(initialFilters)
        : !hasFilters;
    const risksQuery = useQuery<RiskListItem[]>({
        queryKey: queryKeys.risks.list(tenantSlug, filters),
        queryFn: async () => {
            const params = new URLSearchParams(filters);
            const qs = params.toString();
            const res = await fetch(apiUrl(`/risks${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch risks');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialRisks : undefined,
        initialDataUpdatedAt: 0,
    });

    const risks = risksQuery.data ?? [];
    const loading = risksQuery.isLoading && !risksQuery.data;

    // ── KPI Computations ──
    const total = risks.length;
    const avgScore = total ? (risks.reduce((s, r) => s + r.inherentScore, 0) / total).toFixed(1) : '0.0';
    const openCount = risks.filter(r => r.status === 'OPEN' || r.status === 'MITIGATING').length;
    const now = new Date();
    const overdueRisks = risks.filter(r => r.nextReviewAt && new Date(r.nextReviewAt) < now);

    const heatmap: number[][] = Array.from({ length: 5 }, (_, l) =>
        Array.from({ length: 5 }, (_, i) => risks.filter(r => r.likelihood === (5 - l) && r.impact === (i + 1)).length)
    );

    const getRiskLevel = (score: number) => {
        if (score <= 5) return { label: t.low, class: 'badge-success' };
        if (score <= 12) return { label: t.medium, class: 'badge-warning' };
        if (score <= 18) return { label: t.high, class: 'badge-danger' };
        return { label: t.critical, class: 'badge-danger' };
    };

    // ── Column Definitions ──
    const riskColumns = useMemo(() => createColumns<RiskListItem>([
        {
            accessorKey: 'title',
            header: t.riskTitle,
            cell: ({ getValue }) => (
                <span className="font-medium text-white text-sm">{getValue<string>()}</span>
            ),
        },
        {
            accessorFn: (r) => r.asset?.name || '—',
            id: 'asset',
            header: t.asset,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            accessorKey: 'threat',
            header: t.threat,
            cell: ({ getValue }) => (
                <span className="text-xs text-slate-400">{getValue<string>()}</span>
            ),
        },
        {
            id: 'lxi',
            header: 'L×I',
            accessorFn: (r) => `${r.likelihood}×${r.impact}`,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            accessorKey: 'inherentScore',
            header: t.score,
            cell: ({ getValue }) => (
                <span className="font-bold">{getValue<number>()}</span>
            ),
        },
        {
            id: 'level',
            header: t.level,
            accessorFn: (r) => r.inherentScore,
            cell: ({ getValue }) => {
                const level = getRiskLevel(getValue<number>());
                return <span className={`badge ${level.class}`}>{level.label}</span>;
            },
        },
        {
            id: 'treatment',
            header: t.treatment,
            accessorFn: (r) => r.treatment || t.untreated,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            id: 'controls',
            header: t.controlsCol,
            accessorFn: (r) => r.controls?.length || 0,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<number>()}</span>
            ),
        },
    ]), [t, getRiskLevel]);

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t.title}</h1>
                    <p className="text-slate-400 text-sm">{t.risksIdentified}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setView(view === 'register' ? 'heatmap' : 'register')} className="btn btn-secondary">
                        {view === 'register' ? t.heatmap : t.register}
                    </button>
                    {permissions.canWrite && (
                        <>
                            <Link href={tenantHref('/risks/ai')} className="btn btn-secondary" id="ai-risk-btn">
                                AI Assessment
                            </Link>
                            <Link href={tenantHref('/risks/import')} className="btn btn-secondary" id="risk-import-btn">
                                Import
                            </Link>
                            <Link href={tenantHref('/risks/new')} className="btn btn-primary" id="new-risk-btn">{t.addRisk}</Link>
                        </>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{t.totalRisks}</p>
                    <p className="text-3xl font-bold mt-2">{total}</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{t.avgScore}</p>
                    <p className="text-3xl font-bold mt-2 text-amber-400">{avgScore}</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{t.openRisks}</p>
                    <p className="text-3xl font-bold mt-2 text-emerald-400">{openCount}</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{t.overdueReviews}</p>
                    <p className="text-3xl font-bold mt-2 text-red-400">{overdueRisks.length}</p>
                </div>
            </div>

            {/* Filters */}
            <CompactFilterBar config={risksFilterConfig} filters={filters} setFilter={setFilter} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} />

            {view === 'heatmap' ? (
                <div className="glass-card p-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4">{t.heatmapTitle}</h3>
                    <div className="flex gap-2">
                        <div className="flex flex-col items-center justify-between text-xs text-slate-400 pr-2">
                            {[5, 4, 3, 2, 1].map(n => <span key={n} className="h-16 flex items-center">{n}</span>)}
                            <span className="mt-1">L↑</span>
                        </div>
                        <div className="flex-1">
                            <div className="grid grid-rows-5 gap-1">
                                {heatmap.map((row, li) => (
                                    <div key={li} className="grid grid-cols-5 gap-1">
                                        {row.map((count, ii) => {
                                            const score = (5 - li) * (ii + 1);
                                            const bg = score <= 5 ? 'bg-emerald-900/50' : score <= 12 ? 'bg-amber-900/50' : score <= 18 ? 'bg-orange-900/50' : 'bg-red-900/50';
                                            return (
                                                <div key={ii} className={`${bg} h-16 rounded-lg flex items-center justify-center text-sm font-bold transition hover:scale-105 ${count > 0 ? 'ring-1 ring-white/20' : ''}`}>
                                                    {count > 0 ? count : ''}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between text-xs text-slate-400 mt-2 px-3">
                                {[1, 2, 3, 4, 5].map(n => <span key={n}>{n}</span>)}
                            </div>
                            <div className="text-center text-xs text-slate-400 mt-1">Impact →</div>
                        </div>
                    </div>
                </div>
            ) : (
                <DataTable<RiskListItem>
                    data={risks}
                    columns={riskColumns}
                    loading={loading}
                    getRowId={(r) => r.id}
                    onRowClick={(row) => router.push(tenantHref(`/risks/${row.original.id}`))}
                    emptyState={
                        hasActiveFilters
                            ? 'No risks match your filters'
                            : t.noRisks
                    }
                    resourceName={(p) => p ? 'risks' : 'risk'}
                    data-testid="risks-table"
                />
            )}
        </div>
    );
}
