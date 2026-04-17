'use client';
import { formatDate } from '@/lib/format-date';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

interface DuePlan {
    id: string;
    name: string;
    frequency: string;
    nextDueAt: string | null;
    controlId: string;
    isOverdue: boolean;
    hasPendingRun: boolean;
    control: { id: string; name: string; code: string | null };
    owner: { id: string; name: string | null; email: string } | null;
    _count: { runs: number };
}

const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};

export default function DueQueuePage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();

    const [queue, setQueue] = useState<DuePlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [planning, setPlanning] = useState(false);
    const [planningResult, setPlanningResult] = useState<{ checked: number; created: number; alreadyPending: number } | null>(null);
    const [error, setError] = useState('');

    const fetchQueue = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl('/tests/due'));
            if (res.ok) setQueue(await res.json());
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);

    const handleRunDuePlanning = async () => {
        setPlanning(true);
        setPlanningResult(null);
        setError('');
        try {
            const res = await fetch(apiUrl('/tests/due'), { method: 'POST' });
            if (res.ok) {
                const result = await res.json();
                setPlanningResult(result);
                await fetchQueue();
            } else {
                setError('Failed to run due planning');
            }
        } finally {
            setPlanning(false);
        }
    };

    const handleQuickRun = async (planId: string) => {
        const res = await fetch(apiUrl(`/tests/plans/${planId}/runs`), { method: 'POST' });
        if (res.ok) {
            const run = await res.json();
            window.location.href = tenantHref(`/tests/runs/${run.id}`);
        }
    };

    const overdueCount = queue.filter(p => p.isOverdue).length;
    const pendingCount = queue.filter(p => p.hasPendingRun).length;

    if (loading) return <div className="p-12 text-center text-slate-500 animate-pulse">Loading due queue...</div>;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold" id="due-queue-title">Due Queue</h1>
                    <p className="text-sm text-slate-400 mt-1">Test plans due or overdue for execution</p>
                </div>
                <div className="flex gap-3">
                    <Link href={tenantHref('/tests')} className="btn btn-ghost btn-sm">← Tests</Link>
                    <Link href={tenantHref('/tests/dashboard')} className="btn btn-ghost btn-sm">Dashboard</Link>
                    {permissions.canWrite && (
                        <button
                            onClick={handleRunDuePlanning}
                            disabled={planning}
                            className="btn btn-primary btn-sm"
                            id="run-due-planning-btn"
                        >
                            {planning ? 'Running...' : 'Run Due Planning'}
                        </button>
                    )}
                </div>
            </div>

            {/* Planning result */}
            {planningResult && (
                <div className="glass-card p-4 border border-green-500/30 bg-green-500/5" id="planning-result">
                    <p className="text-sm text-green-400">
                        Due planning complete: checked {planningResult.checked} plans,
                        created {planningResult.created} new runs,
                        {planningResult.alreadyPending} already had pending runs.
                    </p>
                </div>
            )}
            {error && <div className="glass-card p-4 border border-red-500/30 text-red-400 text-sm">{error}</div>}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-bold text-brand-400">{queue.length}</div>
                    <div className="text-xs text-slate-400 mt-1">Due / Due Soon</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{overdueCount}</div>
                    <div className="text-xs text-slate-400 mt-1">Overdue</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{pendingCount}</div>
                    <div className="text-xs text-slate-400 mt-1">Pending Runs</div>
                </div>
            </div>

            {/* Queue Table */}
            {queue.length === 0 ? (
                <div className="glass-card p-8 text-center text-slate-500">
                    No tests are due! All plans are on schedule.
                </div>
            ) : (
                <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase">
                                <th className="text-left p-3">Plan</th>
                                <th className="text-left p-3">Control</th>
                                <th className="text-left p-3">Frequency</th>
                                <th className="text-left p-3">Due Date</th>
                                <th className="text-left p-3">Owner</th>
                                <th className="text-left p-3">Status</th>
                                <th className="text-right p-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {queue.map(plan => (
                                <tr key={plan.id} className="hover:bg-slate-800/30 transition">
                                    <td className="p-3">
                                        <Link
                                            href={tenantHref(`/controls/${plan.controlId}/tests/${plan.id}`)}
                                            className="text-white font-medium hover:text-brand-400 transition"
                                        >
                                            {plan.name}
                                        </Link>
                                    </td>
                                    <td className="p-3">
                                        <Link href={tenantHref(`/controls/${plan.controlId}`)} className="text-slate-400 hover:text-white text-xs transition">
                                            {plan.control?.code || plan.control?.name || '—'}
                                        </Link>
                                    </td>
                                    <td className="p-3 text-slate-400">{FREQ_LABELS[plan.frequency] || plan.frequency}</td>
                                    <td className="p-3">
                                        <span className={plan.isOverdue ? 'text-red-400 font-semibold' : 'text-amber-400'}>
                                            {formatDate(plan.nextDueAt)}
                                            {plan.isOverdue && ' !'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-slate-400 text-xs">{plan.owner?.name || plan.owner?.email || '—'}</td>
                                    <td className="p-3">
                                        {plan.hasPendingRun ? (
                                            <span className="badge badge-xs badge-warning">Run Pending</span>
                                        ) : (
                                            <span className="badge badge-xs badge-danger">Needs Run</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right">
                                        {!plan.hasPendingRun && permissions.canWrite && (
                                            <button
                                                onClick={() => handleQuickRun(plan.id)}
                                                className="btn btn-xs btn-primary"
                                            >
                                                Run Now
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
