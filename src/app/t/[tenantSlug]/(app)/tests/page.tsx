'use client';
import { formatDate } from '@/lib/format-date';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DataTable, createColumns } from '@/components/ui/table';
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

    if (loading) return <div className="p-12 text-center text-content-subtle animate-pulse">Loading tests overview...</div>;

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold" id="tests-page-title">Tests</h1>
                    <p className="text-sm text-content-muted mt-1">Test plans and recent results across all controls</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/tests/due')} className="btn btn-ghost btn-sm">Due Queue</Link>
                    <Link href={tenantHref('/tests/dashboard')} className="btn btn-ghost btn-sm">Dashboard</Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 text-center cursor-pointer hover:ring-1 hover:ring-brand-500/50 transition" onClick={() => setFilter('all')}>
                    <div className="text-2xl font-bold text-brand-400">{plans.length}</div>
                    <div className="text-xs text-content-muted mt-1">Total Plans</div>
                </div>
                <div className="glass-card p-4 text-center cursor-pointer hover:ring-1 hover:ring-red-500/50 transition" onClick={() => setFilter('due')}>
                    <div className={`text-2xl font-bold ${duePlans.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {duePlans.length}
                    </div>
                    <div className="text-xs text-content-muted mt-1">Overdue</div>
                </div>
                <div className="glass-card p-4 text-center cursor-pointer hover:ring-1 hover:ring-red-500/50 transition" onClick={() => setFilter('failed')}>
                    <div className={`text-2xl font-bold ${failedPlans.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {failedPlans.length}
                    </div>
                    <div className="text-xs text-content-muted mt-1">Last Failed</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-bold text-green-400">
                        {plans.filter(p => getLastResult(p) === 'PASS').length}
                    </div>
                    <div className="text-xs text-content-muted mt-1">Last Passed</div>
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
                        {f === 'all' ? 'All' : f === 'due' ? 'Overdue' : 'Failed'}
                    </button>
                ))}
            </div>

            {/* Plans Table */}
            {(() => {
                const planColumns = createColumns<TestPlanSummary>([
                    {
                        id: 'plan', header: 'Plan', accessorKey: 'name',
                        cell: ({ row }) => (
                            <div>
                                <Link href={tenantHref(`/controls/${row.original.control.id}/tests/${row.original.id}`)} className="text-content-emphasis font-medium hover:text-brand-400 transition">
                                    {row.original.name}
                                </Link>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className={`badge badge-xs ${row.original.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                                        {row.original.status}
                                    </span>
                                </div>
                            </div>
                        ),
                    },
                    {
                        id: 'control', header: 'Control', accessorFn: (p) => p.control?.code || p.control?.name || '—',
                        cell: ({ row }) => (
                            <Link href={tenantHref(`/controls/${row.original.control.id}`)} className="text-content-muted hover:text-content-emphasis text-xs transition">
                                {row.original.control?.code || row.original.control?.name || '—'}
                            </Link>
                        ),
                    },
                    { id: 'frequency', header: 'Frequency', accessorFn: (p) => FREQ_LABELS[p.frequency] || p.frequency },
                    {
                        id: 'nextDue', header: 'Next Due', accessorKey: 'nextDueAt',
                        cell: ({ row }) => row.original.nextDueAt ? (
                            <span className={isOverdue(row.original.nextDueAt) ? 'text-red-400 font-semibold' : 'text-content-muted'}>
                                {formatDate(row.original.nextDueAt)}
                            </span>
                        ) : <span className="text-content-subtle">—</span>,
                    },
                    {
                        id: 'lastResult', header: 'Last Result',
                        accessorFn: (p) => getLastResult(p) || '',
                        cell: ({ row }) => {
                            const result = getLastResult(row.original);
                            return result ? (
                                <span className={`badge badge-xs ${RESULT_BADGE[result] || 'badge-neutral'}`}>{result}</span>
                            ) : <span className="text-content-subtle text-xs">No runs</span>;
                        },
                    },
                    {
                        id: 'runs', header: 'Runs',
                        accessorFn: (p) => p._count?.runs ?? 0,
                        cell: ({ getValue }) => <span className="text-content-subtle">{getValue() as number}</span>,
                    },
                    {
                        id: 'actions', header: '',
                        cell: ({ row }) => (
                            <Link href={tenantHref(`/controls/${row.original.control.id}/tests/${row.original.id}`)} className="text-xs text-brand-400 hover:underline">
                                View →
                            </Link>
                        ),
                    },
                ]);
                return (
                    <DataTable
                        data={filteredPlans}
                        columns={planColumns}
                        getRowId={(p) => p.id}
                        emptyState={filter === 'all' ? 'No test plans found. Create test plans from the Control detail page.' : `No ${filter === 'due' ? 'overdue' : 'failed'} test plans.`}
                        resourceName={(p) => p ? 'test plans' : 'test plan'}
                        data-testid="tests-rollup-table"
                    />
                );
            })()}
        </div>
    );
}
