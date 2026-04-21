'use client';
import { formatDate } from '@/lib/format-date';
import { useState, useEffect } from 'react';
import Link from 'next/link';

/* eslint-disable @typescript-eslint/no-explicit-any */
const TASK_STATUS_BADGE: Record<string, string> = {
    OPEN: 'badge-neutral', TRIAGED: 'badge-info', IN_PROGRESS: 'badge-info',
    BLOCKED: 'badge-danger', RESOLVED: 'badge-success', CLOSED: 'badge-neutral', CANCELED: 'badge-neutral',
};
const SEVERITY_BADGE: Record<string, string> = {
    CRITICAL: 'badge-danger', HIGH: 'badge-danger', MEDIUM: 'badge-warning', LOW: 'badge-info', INFO: 'badge-neutral',
};

interface LinkedTasksPanelProps {
    apiBase: string;
    entityType: string;
    entityId: string;
    tenantHref: (path: string) => string;
}

export default function LinkedTasksPanel({ apiBase, entityType, entityId, tenantHref }: LinkedTasksPanelProps) {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`${apiBase}/tasks?linkedEntityType=${encodeURIComponent(entityType)}&linkedEntityId=${encodeURIComponent(entityId)}`)
            .then(r => r.ok ? r.json() : [])
            .then(setTasks)
            .catch(() => setTasks([]))
            .finally(() => setLoading(false));
    }, [apiBase, entityType, entityId]);

    if (loading) {
        return <div className="text-content-subtle text-sm animate-pulse py-4 text-center">Loading linked tasks…</div>;
    }

    if (tasks.length === 0) {
        return <p className="text-content-subtle text-sm text-center py-4">No linked tasks</p>;
    }

    return (
        <div className="space-y-1">
            {tasks.map((task: any) => (
                <Link
                    key={task.id}
                    href={tenantHref(`/tasks/${task.id}`)}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-elevated/30 transition text-sm"
                    id={`linked-task-${task.id}`}
                >
                    {task.key && <span className="font-mono text-xs text-content-subtle w-16 truncate">{task.key}</span>}
                    <span className="flex-1 text-white truncate">{task.title}</span>
                    <span className={`badge ${TASK_STATUS_BADGE[task.status] || 'badge-neutral'} text-xs`}>{task.status}</span>
                    {task.severity && (
                        <span className={`badge ${SEVERITY_BADGE[task.severity] || 'badge-neutral'} text-xs`}>{task.severity}</span>
                    )}
                    {task.dueAt && (
                        <span className={`text-xs ${new Date(task.dueAt) < new Date() ? 'text-red-400' : 'text-content-muted'}`}>
                            {formatDate(task.dueAt)}
                        </span>
                    )}
                </Link>
            ))}
        </div>
    );
}
