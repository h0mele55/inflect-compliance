'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

interface TestPlanSummary {
    id: string;
    name: string;
    frequency: string;
    status: string;
    nextDueAt: string | null;
    controlId: string;
    method: string;
    control: { id: string; name: string; code: string | null };
    owner?: { id: string; name: string | null; email: string } | null;
    _count?: { runs: number; steps: number };
    runs?: Array<{
        id: string;
        result: string | null;
        executedAt: string | null;
        status: string;
    }>;
}

const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};
const RESULT_BADGE: Record<string, string> = {
    PASS: 'badge-success', FAIL: 'badge-danger', INCONCLUSIVE: 'badge-warning',
};

export default function TestsRollupPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();
    void permissions;

    const [plans, setPlans] = useState<TestPlanSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'due' | 'failed'>('all');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl('/tests/plans'));
            if (res.ok) setPlans(await res.json());
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const formatDate = (d: string | null) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const isOverdue = (d: string | null) => {
        if (!d) return false;
        return new Date(d) < new Date();
    };

    const getLastResult = (plan: TestPlanSummary) => {
        if (!plan.runs || plan.runs.length === 0) return null;
        return plan.runs[0]?.result;
    };

    const filteredPlans = plans.filter(p => {
        if (filter === 'due') return p.nextDueAt && isOverdue(p.nextDueAt);
        if (filter === 'failed') return getLastResult(p) === 'FAIL';
        return true;
    });

    // Stats
    const duePlans = plans.filter(p => p.nextDueAt && isOverdue(p.nextDueAt));
    const failedPlans = plans.filter(p => getLastResult(p) === 'FAIL');

    if (loading) return <div className="p-12 text-center text-slate-500 animate-pulse">Loading tests overview...</div>;

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold" id="tests-page-title">🧪 Tests</h1>
                    <p className="text-sm text-slate-400 mt-1">Test plans and recent results across all controls</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/tests/due')} className="btn btn-ghost btn-sm">⏰ Due Queue</Link>
                    <Link href={tenantHref('/tests/dashboard')} className="btn btn-ghost btn-sm">📊 Dashboard</Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 text-center cursor-pointer hover:ring-1 hover:ring-brand-500/50 transition" onClick={() => setFilter('all')}>
                    <div className="text-2xl font-bold text-brand-400">{plans.length}</div>
                    <div className="text-xs text-slate-400 mt-1">Total Plans</div>
                </div>
                <div className="glass-card p-4 text-center cursor-pointer hover:ring-1 hover:ring-red-500/50 transition" onClick={() => setFilter('due')}>
                    <div className={`text-2xl font-bold ${duePlans.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {duePlans.length}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Overdue</div>
                </div>
                <div className="glass-card p-4 text-center cursor-pointer hover:ring-1 hover:ring-red-500/50 transition" onClick={() => setFilter('failed')}>
                    <div className={`text-2xl font-bold ${failedPlans.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {failedPlans.length}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Last Failed</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-bold text-green-400">
                        {plans.filter(p => getLastResult(p) === 'PASS').length}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Last Passed</div>
                </div>
            </div>

            {/* Filter Toggle */}
            <div className="flex gap-2">
                {(['all', 'due', 'failed'] as const).map(f => (
                    <button
                        key={f}
                        className={`btn btn-xs ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === 'all' ? 'All' : f === 'due' ? '⏰ Overdue' : '❌ Failed'}
                    </button>
                ))}
            </div>

            {/* Plans Table */}
            {filteredPlans.length === 0 ? (
                <div className="glass-card p-8 text-center text-slate-500">
                    {filter === 'all'
                        ? 'No test plans found. Create test plans from the Control detail page.'
                        : `No ${filter === 'due' ? 'overdue' : 'failed'} test plans.`}
                </div>
            ) : (
                <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase">
                                <th className="text-left p-3">Plan</th>
                                <th className="text-left p-3">Control</th>
                                <th className="text-left p-3">Frequency</th>
                                <th className="text-left p-3">Next Due</th>
                                <th className="text-left p-3">Last Result</th>
                                <th className="text-left p-3">Runs</th>
                                <th className="text-right p-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {filteredPlans.map(plan => {
                                const lastResult = getLastResult(plan);
                                return (
                                    <tr key={plan.id} className="hover:bg-slate-800/30 transition">
                                        <td className="p-3">
                                            <Link
                                                href={tenantHref(`/controls/${plan.control.id}/tests/${plan.id}`)}
                                                className="text-white font-medium hover:text-brand-400 transition"
                                            >
                                                {plan.name}
                                            </Link>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className={`badge badge-xs ${plan.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                                                    {plan.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <Link href={tenantHref(`/controls/${plan.control.id}`)} className="text-slate-400 hover:text-white text-xs transition">
                                                {plan.control?.code || plan.control?.name || '—'}
                                            </Link>
                                        </td>
                                        <td className="p-3 text-slate-400">{FREQ_LABELS[plan.frequency] || plan.frequency}</td>
                                        <td className="p-3">
                                            {plan.nextDueAt ? (
                                                <span className={isOverdue(plan.nextDueAt) ? 'text-red-400 font-semibold' : 'text-slate-400'}>
                                                    {formatDate(plan.nextDueAt)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            {lastResult ? (
                                                <span className={`badge badge-xs ${RESULT_BADGE[lastResult] || 'badge-neutral'}`}>
                                                    {lastResult}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 text-xs">No runs</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-slate-500">{plan._count?.runs ?? 0}</td>
                                        <td className="p-3 text-right">
                                            <Link
                                                href={tenantHref(`/controls/${plan.control.id}/tests/${plan.id}`)}
                                                className="text-xs text-brand-400 hover:underline"
                                            >
                                                View →
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
