'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppIcon } from '@/components/icons/AppIcon';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { formatDate } from '@/lib/format-date';
import { TERMINAL_WORK_ITEM_STATUSES } from '@/app-layer/domain/work-item-status';
import { DataTable, createColumns } from '@/components/ui/table';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import { buildTaskFilters, TASK_FILTER_KEYS } from './filter-defs';

const STATUS_BADGE: Record<string, string> = {
    OPEN: 'badge-neutral', TRIAGED: 'badge-info', IN_PROGRESS: 'badge-info',
    BLOCKED: 'badge-danger', RESOLVED: 'badge-success', CLOSED: 'badge-neutral', CANCELED: 'badge-neutral',
};
const STATUS_LABELS: Record<string, string> = {
    OPEN: 'Open', TRIAGED: 'Triaged', IN_PROGRESS: 'In Progress',
    BLOCKED: 'Blocked', RESOLVED: 'Resolved', CLOSED: 'Closed', CANCELED: 'Canceled',
};
const SEVERITY_BADGE: Record<string, string> = {
    INFO: 'badge-neutral', LOW: 'badge-neutral', MEDIUM: 'badge-warning',
    HIGH: 'badge-danger', CRITICAL: 'badge-danger',
};
const TYPE_LABELS: Record<string, string> = {
    AUDIT_FINDING: 'Audit Finding', CONTROL_GAP: 'Control Gap',
    INCIDENT: 'Incident', IMPROVEMENT: 'Improvement', TASK: 'Task',
};
const STATUS_OPTIONS = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'CANCELED'];

// SLA windows (hours)
const SLA_RESOLVE: Record<string, number> = { CRITICAL: 24, HIGH: 72, MEDIUM: 168, LOW: 720 };

function getSlaLabel(severity: string, createdAt: string, status: string): string {
    if ((TERMINAL_WORK_ITEM_STATUSES as readonly string[]).includes(status)) return '';
    const hours = SLA_RESOLVE[severity];
    if (!hours) return '';
    const deadline = new Date(new Date(createdAt).getTime() + hours * 3600000);
    return new Date() > deadline ? 'SLA Breached' : '';
}

interface TaskListItem {
    id: string;
    key: string | null;
    title: string;
    type: string;
    severity: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
    updatedAt: string;
    assignee: { name: string } | null;
    assigneeUserId: string | null;
}

interface TasksClientProps {
    initialTasks: TaskListItem[];
    initialFilters?: Record<string, string>;
    tenantSlug: string;
    appPermissions: {
        tasks: { create: boolean; edit: boolean };
    };
}

/**
 * Client island for tasks — handles filters, bulk selection, optimistic mutations.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 */
export function TasksClient(props: TasksClientProps) {
    const filterCtx = useFilterContext([], TASK_FILTER_KEYS, {
        serverFilters: props.initialFilters,
    });
    return (
        <FilterProvider value={filterCtx}>
            <TasksPageInner {...props} />
        </FilterProvider>
    );
}

function TasksPageInner({
    initialTasks,
    initialFilters,
    tenantSlug,
    appPermissions,
}: TasksClientProps) {
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const queryClient = useQueryClient();
    const router = useRouter();

    // Hydration marker — signals to E2E tests that React event handlers are attached
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => { setHydrated(true); }, []);

    const { state, search, hasActive } = useFilters();

    // Bulk selection
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState('');
    const [bulkValue, setBulkValue] = useState('');

    // ─── Query: tasks list (hydrated with server data) ───

    const fetchParams = useMemo(
        () => toApiSearchParams(state, { search }),
        [state, search],
    );
    const queryKeyFilters = useMemo(() => {
        const obj: Record<string, string> = {};
        for (const [k, v] of fetchParams) obj[k] = v;
        return obj;
    }, [fetchParams]);

    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = useMemo(() => {
        if (!serverHadFilters) return !hasActive;
        const keys = new Set([...Object.keys(queryKeyFilters), ...Object.keys(initialFilters!)]);
        for (const k of keys) {
            if ((queryKeyFilters[k] ?? '') !== (initialFilters![k] ?? '')) return false;
        }
        return true;
    }, [queryKeyFilters, initialFilters, serverHadFilters, hasActive]);

    const tasksQuery = useQuery<TaskListItem[]>({
        queryKey: queryKeys.tasks.list(tenantSlug, queryKeyFilters),
        queryFn: async () => {
            const qs = fetchParams.toString();
            const res = await fetch(apiUrl(`/tasks${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch tasks');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialTasks : undefined,
        initialDataUpdatedAt: 0,
        // Prevent aggressive refetch during user interaction (SWR after 30s)
        staleTime: 30_000,
    });

    const tasks = tasksQuery.data ?? [];
    const loading = tasksQuery.isLoading && !tasksQuery.data;
    const liveFilters = useMemo(
        () => buildTaskFilters(tasks as unknown as Parameters<typeof buildTaskFilters>[0]),
        [tasks],
    );

    const isOverdue = (task: TaskListItem) => task.dueAt && new Date(task.dueAt) < new Date() && !(TERMINAL_WORK_ITEM_STATUSES as readonly string[]).includes(task.status);

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const toggleSelectAll = () => {
        if (selected.size === tasks.length) setSelected(new Set());
        else setSelected(new Set(tasks.map(i => i.id)));
    };

    // ─── Mutation: bulk actions ───

    const bulkMutation = useMutation({
        mutationFn: async ({ action, value, ids }: { action: string; value: string; ids: string[] }) => {
            let url = '';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body: any = { taskIds: ids };

            if (action === 'assign') {
                url = apiUrl('/tasks/bulk/assign');
                body.assigneeUserId = value || null;
            } else if (action === 'status') {
                url = apiUrl('/tasks/bulk/status');
                body.status = value;
            } else if (action === 'due') {
                url = apiUrl('/tasks/bulk/due');
                body.dueAt = value || null;
            }

            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error('Bulk action failed');
            return res.json();
        },
        onMutate: async ({ action, value, ids }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all(tenantSlug) });

            const listKey = queryKeys.tasks.list(tenantSlug, queryKeyFilters);
            const previousList = queryClient.getQueryData<TaskListItem[]>(listKey);

            if (previousList) {
                queryClient.setQueryData<TaskListItem[]>(listKey, old =>
                    old?.map(task => {
                        if (!ids.includes(task.id)) return task;
                        if (action === 'status') return { ...task, status: value };
                        if (action === 'assign') return { ...task, assigneeUserId: value || null, assignee: value ? { name: value } : null };
                        if (action === 'due') return { ...task, dueAt: value || null };
                        return task;
                    })
                );
            }

            return { previousList, listKey };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousList) {
                queryClient.setQueryData(context.listKey, context.previousList);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(tenantSlug) });
            setSelected(new Set());
            setBulkAction('');
            setBulkValue('');
        },
    });

    const handleBulkSubmit = () => {
        if (!bulkAction || selected.size === 0) return;
        bulkMutation.mutate({ action: bulkAction, value: bulkValue, ids: Array.from(selected) });
    };

    // ── Column definitions ──
    const taskColumns = useMemo(() => {
        const cols: ReturnType<typeof createColumns<TaskListItem>> = [];

        if (appPermissions.tasks.edit) {
            cols.push({
                id: 'select',
                header: () => (
                    <input type="checkbox" checked={selected.size === tasks.length && tasks.length > 0} onChange={toggleSelectAll} id="select-all-checkbox" />
                ),
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        checked={selected.has(row.original.id)}
                        onChange={() => toggleSelect(row.original.id)}
                        onClick={e => e.stopPropagation()}
                        className="task-checkbox"
                    />
                ),
                enableHiding: false,
                size: 32,
            });
        }

        cols.push(
            {
                id: 'title',
                header: 'Key / Title',
                accessorFn: (t) => t.title,
                cell: ({ row }) => {
                    const task = row.original;
                    const slaLabel = getSlaLabel(task.severity, task.createdAt, task.status);
                    return (
                        <div>
                            <Link href={tenantHref(`/tasks/${task.id}`)} className="font-medium text-white hover:text-brand-400 transition" onClick={(e) => e.stopPropagation()}>
                                {task.key && <span className="text-xs font-mono text-slate-500 mr-2">{task.key}</span>}
                                {task.title}
                            </Link>
                            {isOverdue(task) && <span className="badge badge-danger text-xs ml-2">Overdue</span>}
                            {slaLabel && <span className="badge badge-danger text-xs ml-1" title="SLA Breached">SLA</span>}
                        </div>
                    );
                },
            },
            {
                accessorKey: 'type',
                header: 'Type',
                cell: ({ getValue }) => <span className="text-xs text-slate-400">{TYPE_LABELS[getValue<string>()] || getValue<string>()}</span>,
            },
            {
                accessorKey: 'severity',
                header: 'Severity',
                cell: ({ row }) => (
                    <span className={`badge ${SEVERITY_BADGE[row.original.severity] || 'badge-neutral'}`}>
                        {row.original.severity}
                    </span>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => (
                    <span className={`badge ${STATUS_BADGE[row.original.status] || 'badge-neutral'}`}>
                        {STATUS_LABELS[row.original.status] || row.original.status}
                    </span>
                ),
            },
            {
                id: 'assignee',
                header: 'Assignee',
                accessorFn: (t) => t.assignee?.name || '—',
                cell: ({ getValue }) => <span className="text-xs text-slate-400">{getValue<string>()}</span>,
            },
            {
                id: 'dueAt',
                header: 'Due Date',
                cell: ({ row }) => <span className="text-xs text-slate-400">{row.original.dueAt ? formatDate(row.original.dueAt) : '—'}</span>,
            },
            {
                id: 'updatedAt',
                header: 'Updated',
                cell: ({ row }) => <span className="text-xs text-slate-400">{formatDate(row.original.updatedAt)}</span>,
            },
        );

        return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appPermissions.tasks.edit, selected, tasks.length, tenantHref]);

    return (
        <div className="space-y-6 animate-fadeIn" data-hydrated={hydrated || undefined}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Tasks</h1>
                    <p className="text-slate-400 text-sm">{tasks.length} tasks in register</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/tasks/dashboard')} className="btn btn-secondary inline-flex items-center gap-2" id="dashboard-btn"><AppIcon name="dashboard" size={16} /> Dashboard</Link>
                    {appPermissions.tasks.create && (
                        <Link href={tenantHref('/tasks/new')} className="btn btn-primary" id="new-task-btn">
                            + New Task
                        </Link>
                    )}
                </div>
            </div>

            {/* Filters */}
            <FilterToolbar
                filters={liveFilters}
                searchId="task-search"
                searchPlaceholder="Search tasks… (Enter)"
            />

            {/* Bulk Actions Toolbar */}
            {appPermissions.tasks.edit && selected.size > 0 && (
                <div className="glass-card p-3 flex items-center gap-3 border border-brand-500/30" id="bulk-toolbar">
                    <span className="text-sm text-brand-400 font-medium">{selected.size} selected</span>
                    <select className="input w-full sm:w-40 text-sm" value={bulkAction} onChange={e => { setBulkAction(e.target.value); setBulkValue(''); }} id="bulk-action-select">
                        <option value="">Choose action...</option>
                        <option value="assign">Assign</option>
                        <option value="status">Change Status</option>
                        <option value="due">Set Due Date</option>
                    </select>
                    {bulkAction === 'assign' && (
                        <input className="input w-full sm:w-48 text-sm" placeholder="User ID (blank = unassign)" value={bulkValue} onChange={e => setBulkValue(e.target.value)} id="bulk-value-input" />
                    )}
                    {bulkAction === 'status' && (
                        <select className="input w-full sm:w-40 text-sm" value={bulkValue} onChange={e => setBulkValue(e.target.value)} id="bulk-value-input">
                            <option value="">Select status...</option>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                    )}
                    {bulkAction === 'due' && (
                        <input type="date" className="input w-full sm:w-40 text-sm" value={bulkValue} onChange={e => setBulkValue(e.target.value)} id="bulk-value-input" />
                    )}
                    <button
                        className="btn btn-primary"
                        disabled={!bulkAction || (bulkAction === 'status' && !bulkValue) || bulkMutation.isPending}
                        onClick={handleBulkSubmit}
                        id="bulk-apply-btn"
                    >
                        {bulkMutation.isPending ? 'Applying...' : 'Apply'}
                    </button>
                    <button className="text-xs text-slate-400 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
            )}

            {/* Table */}
            <DataTable<TaskListItem>
                data={tasks}
                columns={taskColumns}
                loading={loading}
                getRowId={(t) => t.id}
                onRowClick={(row) => router.push(tenantHref(`/tasks/${row.original.id}`))}
                emptyState="No tasks found. Create a task to get started."
                resourceName={(p) => p ? 'tasks' : 'task'}
                data-testid="tasks-table"
            />
        </div>
    );
}
