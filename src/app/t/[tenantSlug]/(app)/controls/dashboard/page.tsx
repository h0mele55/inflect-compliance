'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import type { ControlDashboardDTO, ConsistencyCheckDTO } from '@/lib/dto';
import { AppIcon } from '@/components/icons/AppIcon';

const STATUS_COLORS: Record<string, string> = {
    NOT_STARTED: '#94a3b8', IN_PROGRESS: '#38bdf8', IMPLEMENTED: '#34d399', NEEDS_REVIEW: '#fbbf24',
};
const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', IMPLEMENTED: 'Implemented', NEEDS_REVIEW: 'Needs Review',
};

export default function ControlsDashboard() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();

    const [data, setData] = useState<ControlDashboardDTO | null>(null);
    const [loading, setLoading] = useState(true);
    const [consistency, setConsistency] = useState<ConsistencyCheckDTO | null>(null);
    const [showConsistency, setShowConsistency] = useState(false);

    const fetchDashboard = useCallback(async (attempt = 0) => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl('/controls/dashboard'));
            if (res.ok) {
                setData(await res.json());
            } else if (attempt < 2) {
                // Retry on server errors (e.g., dev server compilation race)
                await new Promise(r => setTimeout(r, 2000));
                return fetchDashboard(attempt + 1);
            }
        } catch {
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, 2000));
                return fetchDashboard(attempt + 1);
            }
        }
        setLoading(false);
    }, [apiUrl]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    const fetchConsistency = async () => {
        setShowConsistency(true);
        const res = await fetch(apiUrl('/controls/consistency-check'));
        if (res.ok) setConsistency(await res.json());
    };

    if (loading) return (
        <div className="space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold" id="dashboard-heading"><AppIcon name="dashboard" className="inline-block mr-2 align-text-bottom" /> Controls Dashboard</h1>
            <div className="p-12 text-center text-slate-500 animate-pulse">Loading dashboard...</div>
        </div>
    );
    if (!data) return (
        <div className="space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold" id="dashboard-heading"><AppIcon name="dashboard" className="inline-block mr-2 align-text-bottom" /> Controls Dashboard</h1>
            <div className="p-12 text-center text-red-400">Failed to load dashboard.</div>
        </div>
    );

    const maxStatus = Math.max(...Object.values(data.statusDistribution || {}).map(Number), 1);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold" id="dashboard-heading"><AppIcon name="dashboard" className="inline-block mr-2 align-text-bottom" /> Controls Dashboard</h1>
                    <p className="text-slate-400 text-sm">{data.totalControls} controls in register</p>
                </div>
                <div className="flex gap-2">
                    {permissions.canAdmin && (
                        <button onClick={fetchConsistency} className="btn btn-secondary" id="consistency-check-btn">
                            <AppIcon name="search" size={16} className="inline-block" /> Consistency Check
                        </button>
                    )}
                    <Link href={tenantHref('/controls')} className="btn btn-secondary">
                        ← Back to Controls
                    </Link>
                </div>
            </div>

            {/* Stat Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="dashboard-stats">
                <div className="glass-card p-4">
                    <p className="text-xs text-slate-500 uppercase">Implementation Progress</p>
                    <p className="text-3xl font-bold text-emerald-400 mt-1" id="implementation-progress">{data.implementationProgress}%</p>
                    <p className="text-xs text-slate-500 mt-1">{data.implementedCount}/{data.applicableCount} applicable controls</p>
                    <div className="w-full h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${data.implementationProgress}%` }} />
                    </div>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs text-slate-500 uppercase">Overdue Tasks</p>
                    <p className={`text-3xl font-bold mt-1 ${data.overdueTasks > 0 ? 'text-red-400' : 'text-slate-400'}`} id="overdue-tasks">{data.overdueTasks}</p>
                    <p className="text-xs text-slate-500 mt-1">tasks past due date</p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs text-slate-500 uppercase">Controls Due Soon</p>
                    <p className={`text-3xl font-bold mt-1 ${data.controlsDueSoon > 0 ? 'text-yellow-400' : 'text-slate-400'}`} id="due-soon">{data.controlsDueSoon}</p>
                    <p className="text-xs text-slate-500 mt-1">within next 30 days</p>
                </div>
                <div className="glass-card p-4">
                    <p className="text-xs text-slate-500 uppercase">Applicability</p>
                    <p className="text-3xl font-bold text-blue-400 mt-1">{data.applicabilityDistribution.applicable}</p>
                    <p className="text-xs text-slate-500 mt-1">{data.applicabilityDistribution.notApplicable} excluded (N/A)</p>
                </div>
            </div>

            {/* Status Distribution */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4">Status Distribution</h3>
                    <div className="space-y-3" id="status-distribution">
                        {Object.entries(data.statusDistribution || {}).map(([status, count]) => (
                            <div key={status}>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-slate-400">{STATUS_LABELS[status] || status}</span>
                                    <span className="text-white font-medium">{String(count)}</span>
                                </div>
                                <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${(Number(count) / maxStatus) * 100}%`,
                                            backgroundColor: STATUS_COLORS[status] || '#64748b',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Owners by Open Tasks</h3>
                    {data.topOwners?.length > 0 ? (
                        <div className="space-y-2" id="top-owners">
                            {data.topOwners.map((o) => (
                                <div key={o.id} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-300">{o.name}</span>
                                    <span className="badge badge-neutral">{o.openTasks} open</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500">No assigned owners yet</p>
                    )}
                </div>
            </div>

            {/* Consistency Check */}
            {showConsistency && consistency && (
                <div className="glass-card p-5" id="consistency-results">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3"><AppIcon name="search" size={16} className="inline-block mr-1" /> Consistency Check Results</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center">
                            <p className={`text-xl font-bold ${consistency.summary.missingCodeCount > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                {consistency.summary.missingCodeCount}
                            </p>
                            <p className="text-xs text-slate-500">Missing Code</p>
                        </div>
                        <div className="text-center">
                            <p className={`text-xl font-bold ${consistency.summary.duplicateCodeCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {consistency.summary.duplicateCodeCount}
                            </p>
                            <p className="text-xs text-slate-500">Duplicate Codes</p>
                        </div>
                        <div className="text-center">
                            <p className={`text-xl font-bold ${consistency.summary.overdueTaskCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {consistency.summary.overdueTaskCount}
                            </p>
                            <p className="text-xs text-slate-500">Overdue Tasks</p>
                        </div>
                    </div>
                    {consistency.summary.missingCodeCount === 0 && consistency.summary.duplicateCodeCount === 0 && consistency.summary.overdueTaskCount === 0 && (
                        <p className="text-sm text-emerald-400 text-center"><AppIcon name="success" size={16} className="inline-block mr-1" /> All checks passed — no issues found</p>
                    )}
                </div>
            )}
        </div>
    );
}
