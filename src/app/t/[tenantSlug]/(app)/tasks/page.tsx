'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

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
const SEVERITY_OPTIONS = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUS_OPTIONS = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'CANCELED'];
const TYPE_OPTIONS = ['AUDIT_FINDING', 'CONTROL_GAP', 'INCIDENT', 'IMPROVEMENT', 'TASK'];

// SLA windows (hours)
const SLA_RESOLVE: Record<string, number> = { CRITICAL: 24, HIGH: 72, MEDIUM: 168, LOW: 720 };

function getSlaLabel(severity: string, createdAt: string, status: string): string {
    if (['RESOLVED', 'CLOSED', 'CANCELED'].includes(status)) return '';
    const hours = SLA_RESOLVE[severity];
    if (!hours) return '';
    const deadline = new Date(new Date(createdAt).getTime() + hours * 3600000);
    return new Date() > deadline ? 'SLA Breached' : '';
}

export default function TasksPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();

    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [severityFilter, setSeverityFilter] = useState('');
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Bulk selection
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState('');
    const [bulkValue, setBulkValue] = useState('');
    const [bulkLoading, setBulkLoading] = useState(false);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (typeFilter) params.set('type', typeFilter);
        if (severityFilter) params.set('severity', severityFilter);
        if (overdueOnly) params.set('due', 'overdue');
        if (searchQuery) params.set('q', searchQuery);
        const qs = params.toString();
        const res = await fetch(apiUrl(`/tasks${qs ? `?${qs}` : ''}`));
        if (res.ok) setTasks(await res.json());
        setLoading(false);
        setSelected(new Set());
    }, [apiUrl, statusFilter, typeFilter, severityFilter, overdueOnly, searchQuery]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isOverdue = (task: any) => task.dueAt && new Date(task.dueAt) < new Date() && !['RESOLVED', 'CLOSED', 'CANCELED'].includes(task.status);

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

    const handleBulkSubmit = async () => {
        if (!bulkAction || selected.size === 0) return;
        setBulkLoading(true);
        const ids = Array.from(selected);
        let url = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any = { taskIds: ids };

        if (bulkAction === 'assign') {
            url = apiUrl('/tasks/bulk/assign');
            body.assigneeUserId = bulkValue || null;
        } else if (bulkAction === 'status') {
            url = apiUrl('/tasks/bulk/status');
            body.status = bulkValue;
        } else if (bulkAction === 'due') {
            url = apiUrl('/tasks/bulk/due');
            body.dueAt = bulkValue || null;
        }

        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        setBulkLoading(false);
        setBulkAction('');
        setBulkValue('');
        fetchTasks();
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">📋 Tasks</h1>
                    <p className="text-slate-400 text-sm">{tasks.length} tasks in register</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/tasks/dashboard')} className="btn btn-secondary" id="dashboard-btn">📊 Dashboard</Link>
                    {permissions.canWrite && (
                        <Link href={tenantHref('/tasks/new')} className="btn btn-primary" id="new-task-btn">
                            + New Task
                        </Link>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="text"
                            className="input w-full"
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            id="task-search"
                        />
                    </div>
                    <select className="input w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} id="task-status-filter">
                        <option value="">All Status</option>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    <select className="input w-36" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} id="task-type-filter">
                        <option value="">All Types</option>
                        {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                    <select className="input w-36" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} id="task-severity-filter">
                        <option value="">All Severity</option>
                        {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} />
                        Overdue only
                    </label>
                </div>
            </div>

            {/* Bulk Actions Toolbar */}
            {permissions.canWrite && selected.size > 0 && (
                <div className="glass-card p-3 flex items-center gap-3 border border-brand-500/30" id="bulk-toolbar">
                    <span className="text-sm text-brand-400 font-medium">{selected.size} selected</span>
                    <select className="input w-40 text-sm" value={bulkAction} onChange={e => { setBulkAction(e.target.value); setBulkValue(''); }} id="bulk-action-select">
                        <option value="">Choose action...</option>
                        <option value="assign">Assign</option>
                        <option value="status">Change Status</option>
                        <option value="due">Set Due Date</option>
                    </select>
                    {bulkAction === 'assign' && (
                        <input className="input w-48 text-sm" placeholder="User ID (blank = unassign)" value={bulkValue} onChange={e => setBulkValue(e.target.value)} id="bulk-value-input" />
                    )}
                    {bulkAction === 'status' && (
                        <select className="input w-40 text-sm" value={bulkValue} onChange={e => setBulkValue(e.target.value)} id="bulk-value-input">
                            <option value="">Select status...</option>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                    )}
                    {bulkAction === 'due' && (
                        <input type="date" className="input w-40 text-sm" value={bulkValue} onChange={e => setBulkValue(e.target.value)} id="bulk-value-input" />
                    )}
                    <button
                        className="btn btn-primary text-sm"
                        disabled={!bulkAction || (bulkAction === 'status' && !bulkValue) || bulkLoading}
                        onClick={handleBulkSubmit}
                        id="bulk-apply-btn"
                    >
                        {bulkLoading ? 'Applying...' : 'Apply'}
                    </button>
                    <button className="text-xs text-slate-400 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
            )}

            {/* Table */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500 animate-pulse">Loading tasks...</div>
                ) : tasks.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <p className="text-lg mb-2">No tasks found</p>
                        <p className="text-sm">Create a task to get started.</p>
                    </div>
                ) : (
                    <table className="data-table" id="tasks-table">
                        <thead>
                            <tr>
                                {permissions.canWrite && (
                                    <th className="w-8">
                                        <input type="checkbox" checked={selected.size === tasks.length && tasks.length > 0} onChange={toggleSelectAll} id="select-all-checkbox" />
                                    </th>
                                )}
                                <th>Key / Title</th>
                                <th>Type</th>
                                <th>Severity</th>
                                <th>Status</th>
                                <th>Assignee</th>
                                <th>Due Date</th>
                                <th>Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => {
                                const slaLabel = getSlaLabel(task.severity, task.createdAt, task.status);
                                return (
                                    <tr key={task.id} className="cursor-pointer hover:bg-slate-700/30 transition">
                                        {permissions.canWrite && (
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(task.id)}
                                                    onChange={() => toggleSelect(task.id)}
                                                    className="task-checkbox"
                                                />
                                            </td>
                                        )}
                                        <td>
                                            <Link href={tenantHref(`/tasks/${task.id}`)} className="font-medium text-white hover:text-brand-400 transition">
                                                {task.key && <span className="text-xs font-mono text-slate-500 mr-2">{task.key}</span>}
                                                {task.title}
                                            </Link>
                                            {isOverdue(task) && <span className="badge badge-danger text-xs ml-2">Overdue</span>}
                                            {slaLabel && <span className="badge badge-danger text-xs ml-1" title="SLA Breached">⚠ SLA</span>}
                                        </td>
                                        <td className="text-xs text-slate-400">{TYPE_LABELS[task.type] || task.type}</td>
                                        <td>
                                            <span className={`badge ${SEVERITY_BADGE[task.severity] || 'badge-neutral'}`}>
                                                {task.severity}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${STATUS_BADGE[task.status] || 'badge-neutral'}`}>
                                                {STATUS_LABELS[task.status] || task.status}
                                            </span>
                                        </td>
                                        <td className="text-xs text-slate-400">{task.assignee?.name || '—'}</td>
                                        <td className="text-xs text-slate-400">
                                            {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="text-xs text-slate-400">
                                            {new Date(task.updatedAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
