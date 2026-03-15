'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { queryKeys } from '@/lib/queryKeys';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';

const RISK_COLORS = ['', '#22c55e', '#84cc16', '#f59e0b', '#ef4444', '#dc2626'];

interface RiskListItem {
    id: string;
    title: string;
    threat: string;
    likelihood: number;
    impact: number;
    inherentScore: number;
    treatment: string | null;
    asset: { name: string } | null;
    controls: unknown[];
}

export default function RisksPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { tenantSlug } = useTenantContext();
    const t = useTranslations('risks');
    const tc = useTranslations('common');
    const [view, setView] = useState<'register' | 'heatmap'>('register');

    // URL-driven filter state
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'status', 'category']);

    const risksQuery = useQuery<RiskListItem[]>({
        queryKey: queryKeys.risks.list(tenantSlug, filters),
        queryFn: async () => {
            const params = new URLSearchParams(filters);
            const qs = params.toString();
            const res = await fetch(apiUrl(`/risks${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch risks');
            return res.json();
        },
    });

    const risks = risksQuery.data ?? [];

    const heatmap: number[][] = Array.from({ length: 5 }, (_, l) =>
        Array.from({ length: 5 }, (_, i) => risks.filter(r => r.likelihood === (5 - l) && r.impact === (i + 1)).length)
    );

    const getRiskLevel = (score: number) => {
        if (score <= 5) return { label: t('low'), class: 'badge-success' };
        if (score <= 12) return { label: t('medium'), class: 'badge-warning' };
        if (score <= 18) return { label: t('high'), class: 'badge-danger' };
        return { label: t('critical'), class: 'badge-danger' };
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-slate-400 text-sm">{t('risksIdentified', { count: risks.length })}</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/risks/dashboard')} className="btn btn-secondary" id="risk-dashboard-btn">
                        {t('heatmap')}
                    </Link>
                    <button onClick={() => setView(view === 'register' ? 'heatmap' : 'register')} className="btn btn-secondary">
                        {view === 'register' ? t('heatmap') : t('register')}
                    </button>
                    <Link href={tenantHref('/risks/import')} className="btn btn-secondary" id="risk-import-btn">
                        Import
                    </Link>
                    <Link href={tenantHref('/risks/new')} className="btn btn-primary" id="new-risk-btn">{t('addRisk')}</Link>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="text"
                            className="input w-full"
                            placeholder="Search risks..."
                            value={filters.q || ''}
                            onChange={e => setFilter('q', e.target.value)}
                            id="risk-search"
                        />
                    </div>
                    <select className="input w-36" value={filters.status || ''} onChange={e => setFilter('status', e.target.value)} id="risk-status-filter">
                        <option value="">All Status</option>
                        <option value="OPEN">Open</option>
                        <option value="MITIGATING">Mitigating</option>
                        <option value="ACCEPTED">Accepted</option>
                        <option value="CLOSED">Closed</option>
                    </select>
                    <select className="input w-44" value={filters.category || ''} onChange={e => setFilter('category', e.target.value)} id="risk-category-filter">
                        <option value="">All Categories</option>
                        <option value="Technical">Technical</option>
                        <option value="Operational">Operational</option>
                        <option value="Compliance">Compliance</option>
                        <option value="Strategic">Strategic</option>
                    </select>
                    {hasActiveFilters && (
                        <button type="button" className="btn btn-sm btn-secondary text-xs" onClick={clearFilters} id="filter-clear">
                            ✕ Clear filters
                        </button>
                    )}
                </div>
            </div>

            {view === 'heatmap' ? (
                <div className="glass-card p-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4">{t('heatmapTitle')}</h3>
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
                <div className="glass-card overflow-hidden">
                    <table className="data-table">
                        <thead><tr><th>{t('riskTitle')}</th><th>{t('asset')}</th><th>{t('threat')}</th><th>L×I</th><th>{t('score')}</th><th>{t('level')}</th><th>{t('treatment')}</th><th>{t('controlsCol')}</th></tr></thead>
                        <tbody>
                            {risks.map(r => {
                                const level = getRiskLevel(r.inherentScore);
                                return (
                                    <tr key={r.id}>
                                        <td className="font-medium text-white text-sm">{r.title}</td>
                                        <td className="text-xs">{r.asset?.name || '—'}</td>
                                        <td className="text-xs text-slate-400">{r.threat}</td>
                                        <td className="text-xs">{r.likelihood}×{r.impact}</td>
                                        <td className="font-bold">{r.inherentScore}</td>
                                        <td><span className={`badge ${level.class}`}>{level.label}</span></td>
                                        <td className="text-xs">{r.treatment || t('untreated')}</td>
                                        <td className="text-xs">{r.controls?.length || 0}</td>
                                    </tr>
                                );
                            })}
                            {risks.length === 0 && (
                                <tr><td colSpan={8} className="text-center text-slate-500 py-8">
                                    {hasActiveFilters ? 'No risks match your filters' : t('noRisks')}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
