'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';

export default function DashboardPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const t = useTranslations('dashboard');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        fetch(apiUrl('/dashboard')).then((r) => r.json()).then(setData);
    }, [apiUrl]);

    if (!data) return <div className="animate-pulse text-slate-400 p-8">{t('loading')}</div>;

    const { stats, recentActivity } = data;

    const statCards = [
        { label: t('assets'), value: stats.assets, icon: '🏢', color: 'from-blue-500 to-cyan-500' },
        { label: t('risks'), value: stats.risks, icon: '⚠️', color: 'from-amber-500 to-orange-500', sub: t('highCritical', { count: stats.highRisks }) },
        { label: t('controls'), value: stats.controls, icon: '🛡️', color: 'from-emerald-500 to-teal-500' },
        { label: t('evidence'), value: stats.evidence, icon: '📎', color: 'from-purple-500 to-pink-500', sub: t('pendingReview', { count: stats.pendingEvidence }) },
        { label: t('openTasks'), value: stats.openTasks, icon: '✅', color: 'from-indigo-500 to-blue-500' },
        { label: t('openFindings'), value: stats.openFindings, icon: '🐛', color: 'from-red-500 to-rose-500' },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-slate-400 text-sm mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    {stats.unreadNotifications > 0 && (
                        <Link href={tenantHref('/notifications')} className="btn btn-ghost btn-sm">
                            🔔 <span className="badge badge-danger">{stats.unreadNotifications}</span>
                        </Link>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {statCards.map((card) => (
                    <div key={card.label} className="glass-card p-4 hover:scale-[1.02] transition-transform">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{card.icon}</span>
                            <span className="text-xs text-slate-400">{card.label}</span>
                        </div>
                        <p className="text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, var(--tw-gradient-from), var(--tw-gradient-to))` }}>
                            {card.value}
                        </p>
                        {card.sub && <p className="text-xs text-slate-500 mt-1">{card.sub}</p>}
                    </div>
                ))}
            </div>

            {/* Clause Progress + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('clauseProgress')}</h3>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-brand-500 to-emerald-500 rounded-full transition-all"
                                style={{ width: `${(stats.clausesReady / stats.totalClauses) * 100}%` }} />
                        </div>
                        <span className="text-sm font-medium text-slate-300">{stats.clausesReady}/{stats.totalClauses}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                        <Link href={tenantHref('/clauses')} className="text-brand-400 hover:text-brand-300">{t('viewAllClauses')}</Link>
                    </div>
                </div>

                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('complianceAlerts')}</h3>
                    <div className="space-y-2">
                        {stats.overdueEvidence > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-red-400">{t('overdueEvidence', { count: stats.overdueEvidence })}</span>
                            </div>
                        )}
                        {stats.pendingEvidence > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-amber-400">{t('evidenceAwaitingReview', { count: stats.pendingEvidence })}</span>
                            </div>
                        )}
                        {stats.highRisks > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                <span className="text-orange-400">{t('highCriticalRisks', { count: stats.highRisks })}</span>
                            </div>
                        )}
                        {stats.openFindings > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 rounded-full bg-purple-500" />
                                <span className="text-purple-400">{t('openAuditFindings', { count: stats.openFindings })}</span>
                            </div>
                        )}
                        {!stats.overdueEvidence && !stats.pendingEvidence && !stats.highRisks && !stats.openFindings && (
                            <p className="text-emerald-400 text-sm">{t('noAlerts')}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('quickActions')}</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <Link href={tenantHref('/assets')} className="btn btn-secondary btn-sm text-xs">{t('addAsset')}</Link>
                        <Link href={tenantHref('/risks')} className="btn btn-secondary btn-sm text-xs">{t('addRisk')}</Link>
                        <Link href={tenantHref('/evidence')} className="btn btn-secondary btn-sm text-xs">{t('addEvidence')}</Link>
                        <Link href={tenantHref('/audits')} className="btn btn-secondary btn-sm text-xs">{t('newAudit')}</Link>
                        <Link href={tenantHref('/policies')} className="btn btn-secondary btn-sm text-xs">{t('newPolicy')}</Link>
                        <Link href={tenantHref('/reports')} className="btn btn-secondary btn-sm text-xs">{t('exportReports')}</Link>
                    </div>
                </div>

                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('recentActivity')}</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {recentActivity.map((log: any) => (
                            <div key={log.id} className="flex items-start gap-2 text-xs">
                                <span className="text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</span>
                                <span className="text-slate-400">
                                    <span className="text-slate-300 font-medium">{log.user?.name}</span>{' '}
                                    {log.action.toLowerCase()} {log.entity.toLowerCase()}
                                </span>
                            </div>
                        ))}
                        {recentActivity.length === 0 && <p className="text-slate-500 text-xs">{t('noRecentActivity')}</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
