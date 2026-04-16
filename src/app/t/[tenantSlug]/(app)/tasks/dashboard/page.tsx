'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { AppIcon } from '@/components/icons/AppIcon';
import { User, Link2, AlertOctagon } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
    OPEN: 'Open', TRIAGED: 'Triaged', IN_PROGRESS: 'In Progress',
    BLOCKED: 'Blocked', RESOLVED: 'Resolved', CLOSED: 'Closed', CANCELED: 'Canceled',
};
const STATUS_COLORS: Record<string, string> = {
    OPEN: '#94a3b8', TRIAGED: '#60a5fa', IN_PROGRESS: '#38bdf8',
    BLOCKED: '#ef4444', RESOLVED: '#22c55e', CLOSED: '#64748b', CANCELED: '#64748b',
};
const SEVERITY_LABELS: Record<string, string> = { INFO: 'Info', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
const SEVERITY_COLORS: Record<string, string> = { INFO: '#94a3b8', LOW: '#22d3ee', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' };
const TYPE_LABELS: Record<string, string> = {
    AUDIT_FINDING: 'Audit Finding', CONTROL_GAP: 'Control Gap',
    INCIDENT: 'Incident', IMPROVEMENT: 'Improvement', TASK: 'Task',
};
const TASK_STATUS_BADGE: Record<string, string> = {
    OPEN: 'badge-neutral', TRIAGED: 'badge-info', IN_PROGRESS: 'badge-info',
    BLOCKED: 'badge-danger', RESOLVED: 'badge-success', CLOSED: 'badge-neutral', CANCELED: 'badge-neutral',
};

interface Metrics {
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    overdue: number;
    dueIn7d: number;
    dueIn30d: number;
    trend: { created30d: number; resolved30d: number };
    topControls: { controlId: string; code: string; name: string; openTaskCount: number }[];
    topLinkedEntities: { entityType: string; entityId: string; count: number }[];
}

export default function TaskDashboardPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
    const [myTasks, setMyTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const [mRes, tRes, myRes] = await Promise.all([
            fetch(apiUrl('/tasks/metrics')),
            fetch(apiUrl('/tasks?due=overdue')),
            fetch(apiUrl('/tasks?assigneeUserId=me')),
        ]);
        if (mRes.ok) setMetrics(await mRes.json());
        if (tRes.ok) setOverdueTasks(await tRes.json());
        if (myRes.ok) {
            const all = await myRes.json();
            // Show only open tasks assigned to current user
            setMyTasks(Array.isArray(all) ? all.filter((t: any) => !['RESOLVED', 'CLOSED', 'CANCELED'].includes(t.status)).slice(0, 10) : []);
        }
        setLoading(false);
    }, [apiUrl]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading || !metrics) {
        return <div className="p-12 text-center text-slate-500 animate-pulse">Loading dashboard...</div>;
    }

    const maxBar = Math.max(metrics.trend.created30d, metrics.trend.resolved30d, 1);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold"><AppIcon name="dashboard" className="inline-block mr-2 align-text-bottom" /> Task Dashboard</h1>
                    <p className="text-slate-400 text-sm">{metrics.total} total tasks</p>
                </div>
                <Link href={tenantHref('/tasks')} className="btn btn-secondary">← Task Register</Link>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="dashboard-metrics">
                <div className="glass-card p-4 text-center">
                    <div className="text-3xl font-bold text-white">{metrics.total}</div>
                    <div className="text-xs text-slate-400 mt-1">Total Tasks</div>
                </div>
                <div className="glass-card p-4 text-center border-red-500/30">
                    <div className="text-3xl font-bold text-red-400">{metrics.overdue}</div>
                    <div className="text-xs text-slate-400 mt-1">Overdue</div>
                </div>
                <div className="glass-card p-4 text-center border-amber-500/30">
                    <div className="text-3xl font-bold text-amber-400">{metrics.dueIn7d}</div>
                    <div className="text-xs text-slate-400 mt-1">Due in 7 days</div>
                </div>
                <div className="glass-card p-4 text-center border-blue-500/30">
                    <div className="text-3xl font-bold text-blue-400">{metrics.dueIn30d}</div>
                    <div className="text-xs text-slate-400 mt-1">Due in 30 days</div>
                </div>
            </div>

            {/* My Tasks */}
            <div className="glass-card p-4" id="my-tasks-section">
                <h3 className="text-sm font-semibold mb-3 text-slate-300"><User size={14} className="inline-block mr-1" /> My Tasks</h3>
                {myTasks.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-4">No open tasks assigned to you</p>
                ) : (
                    <div className="space-y-1">
                        {myTasks.map((task: any) => (
                            <Link
                                key={task.id}
                                href={tenantHref(`/tasks/${task.id}`)}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition text-sm"
                            >
                                <span className="font-mono text-xs text-slate-500 w-16 truncate">{task.key}</span>
                                <span className="flex-1 text-white truncate">{task.title}</span>
                                <span className={`badge ${TASK_STATUS_BADGE[task.status] || 'badge-neutral'} text-xs`}>{task.status}</span>
                                {task.dueAt && (
                                    <span className={`text-xs ${new Date(task.dueAt) < new Date() ? 'text-red-400' : 'text-slate-400'}`}>
                                        {formatDate(task.dueAt)}
                                    </span>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Breakdown + Trend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* By Status */}
                <div className="glass-card p-4">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">By Status</h3>
                    <div className="space-y-2">
                        {Object.entries(STATUS_LABELS).map(([key, label]) => {
                            const count = metrics.byStatus[key] || 0;
                            const pct = metrics.total ? Math.round((count / metrics.total) * 100) : 0;
                            return (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                    <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[key] }} />
                                    <span className="flex-1 text-slate-400">{label}</span>
                                    <span className="font-mono text-white">{count}</span>
                                    <div className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_COLORS[key] }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* By Severity */}
                <div className="glass-card p-4">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">By Severity</h3>
                    <div className="space-y-2">
                        {Object.entries(SEVERITY_LABELS).map(([key, label]) => {
                            const count = metrics.bySeverity[key] || 0;
                            const pct = metrics.total ? Math.round((count / metrics.total) * 100) : 0;
                            return (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                    <div className="w-2 h-2 rounded-full" style={{ background: SEVERITY_COLORS[key] }} />
                                    <span className="flex-1 text-slate-400">{label}</span>
                                    <span className="font-mono text-white">{count}</span>
                                    <div className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SEVERITY_COLORS[key] }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 30-Day Trend */}
                <div className="glass-card p-4">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300">30-Day Trend</h3>
                    <div className="flex items-end gap-4 h-24 mt-4">
                        <div className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-blue-500/20 rounded-t" style={{ height: `${(metrics.trend.created30d / maxBar) * 80}px` }}>
                                <div className="w-full h-full bg-blue-500/60 rounded-t" />
                            </div>
                            <span className="text-xs text-slate-400">Created</span>
                            <span className="text-sm font-bold text-blue-400">{metrics.trend.created30d}</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-green-500/20 rounded-t" style={{ height: `${(metrics.trend.resolved30d / maxBar) * 80}px` }}>
                                <div className="w-full h-full bg-green-500/60 rounded-t" />
                            </div>
                            <span className="text-xs text-slate-400">Resolved</span>
                            <span className="text-sm font-bold text-green-400">{metrics.trend.resolved30d}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* By Type */}
            <div className="glass-card p-4">
                <h3 className="text-sm font-semibold mb-3 text-slate-300">By Type</h3>
                <div className="flex flex-wrap gap-3">
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                        <div key={key} className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs">
                            <span className="text-slate-400">{label}: </span>
                            <span className="font-bold text-white">{metrics.byType[key] || 0}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Controls with Open Tasks */}
            {metrics.topControls && metrics.topControls.length > 0 && (
                <div className="glass-card p-4" id="top-controls-section">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300"><AppIcon name="controls" size={14} className="inline-block mr-1" /> Top Controls with Open Tasks</h3>
                    <div className="space-y-2">
                        {metrics.topControls.map((ctrl) => (
                            <Link
                                key={ctrl.controlId}
                                href={tenantHref(`/controls/${ctrl.controlId}`)}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition text-sm"
                            >
                                <span className="font-mono text-xs text-slate-500 w-20 truncate">{ctrl.code}</span>
                                <span className="flex-1 text-white truncate">{ctrl.name}</span>
                                <span className="badge badge-warning text-xs">{ctrl.openTaskCount} open</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Linked Entities (Assets/Risks) */}
            {metrics.topLinkedEntities && metrics.topLinkedEntities.length > 0 && (
                <div className="glass-card p-4" id="top-linked-entities-section">
                    <h3 className="text-sm font-semibold mb-3 text-slate-300"><Link2 size={14} className="inline-block mr-1" /> Top Assets & Risks with Open Tasks</h3>
                    <div className="space-y-2">
                        {metrics.topLinkedEntities.map((entity) => (
                            <div
                                key={`${entity.entityType}:${entity.entityId}`}
                                className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/30 text-sm"
                            >
                                <span className={`badge text-xs ${entity.entityType === 'ASSET' ? 'badge-info' : 'badge-warning'}`}>
                                    {entity.entityType}
                                </span>
                                <span className="flex-1 text-slate-300 font-mono text-xs truncate">{entity.entityId}</span>
                                <span className="badge badge-neutral text-xs">{entity.count} tasks</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Overdue Tasks */}
            {overdueTasks.length > 0 && (
                <div className="glass-card p-4" id="overdue-tasks-section">
                    <h3 className="text-sm font-semibold mb-3 text-red-400"><AlertOctagon size={14} className="inline-block mr-1" /> Overdue Tasks</h3>
                    <div className="space-y-2">
                        {overdueTasks.slice(0, 10).map((task: any) => (
                            <Link
                                key={task.id}
                                href={tenantHref(`/tasks/${task.id}`)}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition text-sm"
                            >
                                <span className="font-mono text-xs text-slate-500">{task.key}</span>
                                <span className="flex-1 text-white truncate">{task.title}</span>
                                <span className="badge badge-danger text-xs">{task.severity}</span>
                                <span className="text-xs text-red-400">
                                    Due {formatDate(task.dueAt)}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
