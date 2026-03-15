'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { SkeletonLine, SkeletonCard } from '@/components/ui/skeleton';

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
const PRIORITY_LABELS: Record<string, string> = {
    P0: 'P0 — Critical', P1: 'P1 — High', P2: 'P2 — Medium', P3: 'P3 — Low',
};
const TYPE_LABELS: Record<string, string> = {
    AUDIT_FINDING: 'Audit Finding', CONTROL_GAP: 'Control Gap',
    INCIDENT: 'Incident', IMPROVEMENT: 'Improvement', TASK: 'Task',
};
const ENTITY_TYPE_OPTIONS = ['CONTROL', 'RISK', 'ASSET', 'EVIDENCE', 'FRAMEWORK_REQUIREMENT'];
const RELATION_OPTIONS = ['RELATES_TO', 'CAUSED_BY', 'MITIGATED_BY', 'EVIDENCE_FOR'];

type Tab = 'overview' | 'links' | 'comments' | 'activity';

const FINDING_SOURCE_LABELS: Record<string, string> = {
    INTERNAL: 'Internal', EXTERNAL_AUDITOR: 'External Auditor', PEN_TEST: 'Pen Test', INCIDENT: 'Incident',
};
const GAP_TYPE_LABELS: Record<string, string> = {
    DESIGN: 'Design', OPERATING_EFFECTIVENESS: 'Operating Effectiveness', DOCUMENTATION: 'Documentation',
};

// SLA windows (hours)
const SLA_RESOLVE: Record<string, number> = { CRITICAL: 24, HIGH: 72, MEDIUM: 168, LOW: 720 };
const SLA_TRIAGE: Record<string, number> = { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 };

function getSlaStatus(severity: string, createdAt: string, status: string) {
    if (['RESOLVED', 'CLOSED', 'CANCELED'].includes(status)) return { label: '', breach: false };
    const now = Date.now();
    const created = new Date(createdAt).getTime();
    const resolveH = SLA_RESOLVE[severity];
    const triageH = SLA_TRIAGE[severity];
    if (resolveH && now > created + resolveH * 3600000) return { label: 'SLA Breached', breach: true };
    if (triageH && status === 'OPEN' && now > created + triageH * 3600000) return { label: 'Triage SLA Breached', breach: true };
    return { label: '', breach: false };
}

// Relevance check: AUDIT_FINDING/CONTROL_GAP needs control/framework link; INCIDENT needs asset/control
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRelevanceStatus(task: any, links: any[]) {
    const type = task?.type;
    if (!type) return { satisfied: true, message: '' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasControl = !!task.controlId || links.some((l: any) => l.entityType === 'CONTROL');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasFramework = links.some((l: any) => l.entityType === 'FRAMEWORK_REQUIREMENT');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasAsset = links.some((l: any) => l.entityType === 'ASSET');

    if (['AUDIT_FINDING', 'CONTROL_GAP'].includes(type) && !hasControl && !hasFramework) {
        return { satisfied: false, message: 'Requires a Control or Framework Requirement link' };
    }
    if (type === 'INCIDENT' && !hasAsset && !hasControl) {
        return { satisfied: false, message: 'Requires an Asset or Control link' };
    }
    return { satisfied: true, message: '' };
}

export default function TaskDetailPage() {
    const params = useParams();
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions, role } = useTenantContext();
    const taskId = params?.taskId as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [task, setTask] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('overview');

    // Status
    const [changingStatus, setChangingStatus] = useState(false);

    // Assignment
    const [assigneeInput, setAssigneeInput] = useState('');
    const [assigning, setAssigning] = useState(false);

    // Links
    const [links, setLinks] = useState<any[]>([]);
    const [linksLoading, setLinksLoading] = useState(false);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [linkEntityType, setLinkEntityType] = useState('CONTROL');
    const [linkEntityId, setLinkEntityId] = useState('');
    const [linkRelation, setLinkRelation] = useState('RELATES_TO');
    const [savingLink, setSavingLink] = useState(false);

    // Comments
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentBody, setCommentBody] = useState('');
    const [savingComment, setSavingComment] = useState(false);

    // Activity
    const [activity, setActivity] = useState<any[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);

    const canComment = role !== 'READER';

    const fetchTask = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl(`/tasks/${taskId}`));
            if (!res.ok) throw new Error('Task not found');
            const data = await res.json();
            setTask(data);
            setAssigneeInput(data.assigneeUserId || '');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, taskId]);

    useEffect(() => { fetchTask(); }, [fetchTask]);

    // Fetch links when tab opens
    useEffect(() => {
        if (tab !== 'links') return;
        setLinksLoading(true);
        fetch(apiUrl(`/tasks/${taskId}/links`))
            .then(r => r.ok ? r.json() : [])
            .then(setLinks)
            .catch(() => { })
            .finally(() => setLinksLoading(false));
    }, [tab, apiUrl, taskId]);

    // Fetch comments when tab opens
    useEffect(() => {
        if (tab !== 'comments') return;
        setCommentsLoading(true);
        fetch(apiUrl(`/tasks/${taskId}/comments`))
            .then(r => r.ok ? r.json() : [])
            .then(setComments)
            .catch(() => { })
            .finally(() => setCommentsLoading(false));
    }, [tab, apiUrl, taskId]);

    // Fetch activity when tab opens
    useEffect(() => {
        if (tab !== 'activity') return;
        setActivityLoading(true);
        fetch(apiUrl(`/tasks/${taskId}/activity`))
            .then(r => r.ok ? r.json() : [])
            .then(setActivity)
            .catch(() => { })
            .finally(() => setActivityLoading(false));
    }, [tab, apiUrl, taskId]);

    const changeStatus = async (status: string) => {
        setChangingStatus(true);
        await fetch(apiUrl(`/tasks/${taskId}/status`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await fetchTask();
        setChangingStatus(false);
    };

    const handleAssign = async () => {
        setAssigning(true);
        await fetch(apiUrl(`/tasks/${taskId}/assign`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigneeUserId: assigneeInput || null }),
        });
        await fetchTask();
        setAssigning(false);
    };

    const addLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!linkEntityId.trim()) return;
        setSavingLink(true);
        await fetch(apiUrl(`/tasks/${taskId}/links`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType: linkEntityType, entityId: linkEntityId, relation: linkRelation }),
        });
        setLinkEntityId('');
        setShowLinkForm(false);
        // Refresh links
        const res = await fetch(apiUrl(`/tasks/${taskId}/links`));
        if (res.ok) setLinks(await res.json());
        setSavingLink(false);
    };

    const removeLink = async (linkId: string) => {
        await fetch(apiUrl(`/tasks/${taskId}/links/${linkId}`), { method: 'DELETE' });
        setLinks(prev => prev.filter(l => l.id !== linkId));
    };

    const addComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!commentBody.trim()) return;
        setSavingComment(true);
        await fetch(apiUrl(`/tasks/${taskId}/comments`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: commentBody }),
        });
        setCommentBody('');
        // Refresh comments
        const res = await fetch(apiUrl(`/tasks/${taskId}/comments`));
        if (res.ok) setComments(await res.json());
        setSavingComment(false);
    };

    if (loading) return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true">
            <div className="space-y-2">
                <SkeletonLine className="w-12" />
                <SkeletonLine className="w-64 h-7" />
                <div className="flex gap-2">
                    <SkeletonLine className="w-16 h-5 rounded-full" />
                    <SkeletonLine className="w-16 h-5 rounded-full" />
                    <SkeletonLine className="w-16 h-5 rounded-full" />
                </div>
            </div>
            <SkeletonCard lines={4} />
        </div>
    );
    if (error) return <div className="p-12 text-center text-red-400">{error}</div>;
    if (!task) return <div className="p-12 text-center text-slate-500">Task not found.</div>;

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'overview', label: '📋 Overview' },
        { key: 'links', label: '🔗 Links', count: task._count?.links ?? links.length },
        { key: 'comments', label: '💬 Comments', count: task._count?.comments ?? comments.length },
        { key: 'activity', label: '📜 Activity' },
    ];

    const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && !['RESOLVED', 'CLOSED', 'CANCELED'].includes(task.status);
    const sla = getSlaStatus(task.severity, task.createdAt, task.status);
    const relevance = getRelevanceStatus(task, links);
    const metadata = task.metadataJson || {};

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Link href={tenantHref('/tasks')} className="text-slate-400 text-xs hover:text-white transition">← Tasks</Link>
                    <h1 className="text-2xl font-bold mt-1" id="task-title">{task.title}</h1>
                    <div className="flex gap-2 mt-1 flex-wrap items-center">
                        {task.key && <span className="text-xs font-mono text-slate-500">{task.key}</span>}
                        <span className={`badge ${STATUS_BADGE[task.status] || 'badge-neutral'}`} id="task-status">
                            {STATUS_LABELS[task.status] || task.status}
                        </span>
                        <span className={`badge ${SEVERITY_BADGE[task.severity] || 'badge-neutral'}`} id="task-severity">
                            {task.severity}
                        </span>
                        <span className="badge badge-info text-xs">{TYPE_LABELS[task.type] || task.type}</span>
                        {isOverdue && <span className="badge badge-danger">Overdue</span>}
                        {sla.breach && <span className="badge badge-danger" id="sla-badge">⚠ {sla.label}</span>}
                        {relevance.satisfied ? (
                            <span className="badge badge-success text-xs" id="relevance-badge">✓ Relevance satisfied</span>
                        ) : (
                            <span className="badge badge-warning text-xs" id="relevance-badge">⚠ {relevance.message}</span>
                        )}
                    </div>
                </div>
                {permissions.canWrite && (
                    <div className="flex gap-2 items-center">
                        <select
                            className="input w-40 text-sm"
                            value={task.status}
                            onChange={e => changeStatus(e.target.value)}
                            disabled={changingStatus}
                            id="task-status-select"
                        >
                            {Object.entries(STATUS_LABELS).map(([val, lbl]) => (
                                <option key={val} value={val}>{lbl}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Assignment controls */}
            {permissions.canWrite && (
                <div className="glass-card p-4">
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-400">Assignee:</span>
                        <span className="text-sm text-white font-medium" id="task-assignee">
                            {task.assignee?.name || task.assigneeUserId || 'Unassigned'}
                        </span>
                        <input
                            type="text"
                            className="input w-48 text-sm"
                            placeholder="User ID"
                            value={assigneeInput}
                            onChange={e => setAssigneeInput(e.target.value)}
                            id="task-assignee-input"
                        />
                        <button className="btn btn-secondary text-sm" onClick={handleAssign} disabled={assigning} id="assign-task-btn">
                            {assigning ? 'Saving...' : 'Assign'}
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-700">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        className={`px-4 py-2 text-sm font-medium transition border-b-2 ${tab === t.key ? 'border-brand-400 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
                        onClick={() => setTab(t.key)}
                        id={`tab-${t.key}`}
                    >
                        {t.label} {t.count !== undefined && <span className="ml-1 text-xs opacity-60">({t.count})</span>}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {tab === 'overview' && (
                <div className="glass-card p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                            <span className="text-xs text-slate-500 uppercase">Description</span>
                            <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{task.description || 'No description.'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Type</span>
                            <p className="text-sm text-slate-300 mt-1">{TYPE_LABELS[task.type] || task.type}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Priority</span>
                            <p className="text-sm text-slate-300 mt-1">{PRIORITY_LABELS[task.priority] || task.priority}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Assignee</span>
                            <p className="text-sm text-slate-300 mt-1">{task.assignee?.name || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Reporter</span>
                            <p className="text-sm text-slate-300 mt-1">{task.createdBy?.name || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Due Date</span>
                            <p className="text-sm text-slate-300 mt-1">{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Created</span>
                            <p className="text-sm text-slate-300 mt-1">{new Date(task.createdAt).toLocaleString()}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Created By</span>
                            <p className="text-sm text-slate-300 mt-1">{task.createdBy?.name || '—'}</p>
                        </div>
                        {task.control && (
                            <div>
                                <span className="text-xs text-slate-500 uppercase">Control</span>
                                <p className="text-sm text-slate-300 mt-1">{task.control.code} — {task.control.name}</p>
                            </div>
                        )}
                        {task.completedAt && (
                            <div>
                                <span className="text-xs text-slate-500 uppercase">Completed At</span>
                                <p className="text-sm text-emerald-400 mt-1">{new Date(task.completedAt).toLocaleString()}</p>
                            </div>
                        )}
                        {task.resolution && (
                            <div className="col-span-2">
                                <span className="text-xs text-slate-500 uppercase">Resolution</span>
                                <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{task.resolution}</p>
                            </div>
                        )}
                    </div>

                    {/* Audit / Finding Fields from metadataJson */}
                    {(task.type === 'AUDIT_FINDING' || task.type === 'CONTROL_GAP') && (metadata.findingSource || metadata.controlGapType) && (
                        <div className="border-t border-slate-700 pt-4 mt-4">
                            <h3 className="text-sm font-semibold text-slate-300 mb-3">🔍 Audit Details</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {metadata.findingSource && (
                                    <div>
                                        <span className="text-xs text-slate-500 uppercase">Finding Source</span>
                                        <p className="text-sm text-slate-300 mt-1">{FINDING_SOURCE_LABELS[metadata.findingSource] || metadata.findingSource}</p>
                                    </div>
                                )}
                                {metadata.controlGapType && (
                                    <div>
                                        <span className="text-xs text-slate-500 uppercase">Control Gap Type</span>
                                        <p className="text-sm text-slate-300 mt-1">{GAP_TYPE_LABELS[metadata.controlGapType] || metadata.controlGapType}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Links Tab */}
            {tab === 'links' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary text-sm" onClick={() => setShowLinkForm(!showLinkForm)} id="add-link-btn">
                                + Add Link
                            </button>
                        </div>
                    )}
                    {showLinkForm && permissions.canWrite && (
                        <form onSubmit={addLink} className="glass-card p-4 space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                                <select className="input" value={linkEntityType} onChange={e => setLinkEntityType(e.target.value)} id="link-entity-type">
                                    {ENTITY_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <input type="text" className="input" placeholder="Entity ID *" value={linkEntityId} onChange={e => setLinkEntityId(e.target.value)} required id="link-entity-id" />
                                <select className="input" value={linkRelation} onChange={e => setLinkRelation(e.target.value)} id="link-relation">
                                    {RELATION_OPTIONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                                </select>
                            </div>
                            <button type="submit" disabled={savingLink} className="btn btn-primary text-sm" id="submit-link-btn">
                                {savingLink ? 'Linking...' : 'Add Link'}
                            </button>
                        </form>
                    )}
                    <div className="glass-card overflow-hidden">
                        {linksLoading ? (
                            <div className="p-4 space-y-2">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <SkeletonLine key={i} className="w-full" />
                                ))}
                            </div>
                        ) : links.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">No links yet</div>
                        ) : (
                            <table className="data-table" id="links-list">
                                <thead>
                                    <tr><th>Type</th><th>Entity ID</th><th>Relation</th><th>Created</th>{permissions.canWrite && <th>Actions</th>}</tr>
                                </thead>
                                <tbody>
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {links.map((l: any) => (
                                        <tr key={l.id}>
                                            <td><span className="badge badge-info text-xs">{l.entityType}</span></td>
                                            <td className="text-sm text-slate-300 font-mono">{l.entityId}</td>
                                            <td className="text-xs text-slate-400">{l.relation?.replace(/_/g, ' ') || '—'}</td>
                                            <td className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleDateString()}</td>
                                            {permissions.canWrite && (
                                                <td>
                                                    <button className="text-red-400 text-xs hover:text-red-300" onClick={() => removeLink(l.id)}>
                                                        ✕ Remove
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Comments Tab */}
            {tab === 'comments' && (
                <div className="space-y-4">
                    {canComment && (
                        <form onSubmit={addComment} className="glass-card p-4 space-y-3">
                            <textarea
                                className="input w-full"
                                rows={3}
                                placeholder="Add a comment..."
                                value={commentBody}
                                onChange={e => setCommentBody(e.target.value)}
                                required
                                id="comment-body"
                            />
                            <button type="submit" disabled={savingComment} className="btn btn-primary text-sm" id="submit-comment-btn">
                                {savingComment ? 'Posting...' : 'Add Comment'}
                            </button>
                        </form>
                    )}
                    <div className="glass-card overflow-hidden" id="comments-list">
                        {commentsLoading ? (
                            <div className="p-4 space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="space-y-1">
                                        <SkeletonLine className="w-32" />
                                        <SkeletonLine className="w-full" />
                                    </div>
                                ))}
                            </div>
                        ) : comments.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">No comments yet</div>
                        ) : (
                            <div className="divide-y divide-slate-700/50">
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {comments.map((c: any) => (
                                    <div key={c.id} className="px-5 py-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium text-white">{c.createdBy?.name || 'Unknown'}</span>
                                            <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
                                        </div>
                                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.body}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Activity Tab */}
            {tab === 'activity' && (
                <div className="glass-card overflow-hidden" id="activity-list">
                    {activityLoading ? (
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="animate-pulse rounded-full bg-slate-700/60 w-2 h-2 mt-2" />
                                    <div className="flex-1 space-y-1">
                                        <SkeletonLine className="w-48" />
                                        <SkeletonLine className="w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : activity.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">No activity yet</div>
                    ) : (
                        <div className="divide-y divide-slate-700/50">
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {activity.map((evt: any) => (
                                <div key={evt.id} className="px-5 py-3 flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-brand-400 mt-2 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-sm font-medium text-white">{evt.user?.name || 'System'}</span>
                                            <span className="badge badge-neutral text-xs">{evt.action?.replace(/_/g, ' ')}</span>
                                        </div>
                                        <p className="text-xs text-slate-400 truncate">{evt.details?.split('\n')[0]}</p>
                                        <span className="text-xs text-slate-500">{new Date(evt.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
