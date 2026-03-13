'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import TraceabilityPanel from '@/components/TraceabilityPanel';
import LinkedTasksPanel from '@/components/LinkedTasksPanel';
import TestPlansPanel from '@/components/TestPlansPanel';
import type {
    ControlDetailDTO, ControlTaskDTO, EvidenceLinkDTO,
    FrameworkMappingDTO, ContributorDTO, AuditLogEntry,
} from '@/lib/dto';
import type { FrameworkDTO, RequirementDTO } from '@/lib/dto';

const STATUS_BADGE: Record<string, string> = {
    NOT_STARTED: 'badge-neutral', IN_PROGRESS: 'badge-info', IMPLEMENTED: 'badge-success',
    NEEDS_REVIEW: 'badge-warning', PLANNED: 'badge-neutral', IMPLEMENTING: 'badge-info',
};
const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', IMPLEMENTED: 'Implemented',
    NEEDS_REVIEW: 'Needs Review', PLANNED: 'Planned', IMPLEMENTING: 'Implementing',
};
const TASK_STATUS_BADGE: Record<string, string> = {
    OPEN: 'badge-neutral', IN_PROGRESS: 'badge-info', DONE: 'badge-success', BLOCKED: 'badge-danger',
};
const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};

type Tab = 'overview' | 'tasks' | 'evidence' | 'mappings' | 'traceability' | 'activity' | 'tests';

const EVENT_LABELS: Record<string, string> = {
    CONTROL_CREATED: 'Created', CONTROL_UPDATED: 'Updated', CONTROL_STATUS_CHANGED: 'Status Changed',
    CONTROL_APPLICABILITY_CHANGED: 'Applicability Changed', CONTROL_OWNER_CHANGED: 'Owner Changed',
    CONTROL_CONTRIBUTOR_ADDED: 'Contributor Added', CONTROL_CONTRIBUTOR_REMOVED: 'Contributor Removed',
    CONTROL_TASK_CREATED: 'Task Created', CONTROL_TASK_COMPLETED: 'Task Completed',
    CONTROL_TASK_UPDATED: 'Task Updated', CONTROL_EVIDENCE_LINKED: 'Evidence Linked',
    CONTROL_EVIDENCE_UNLINKED: 'Evidence Unlinked', CONTROL_TEST_COMPLETED: 'Test Completed',
    CONTROL_INSTALLED_FROM_TEMPLATE: 'Installed from Template',
};

export default function ControlDetailPage() {
    const params = useParams();
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();
    const controlId = params?.controlId as string;

    const [control, setControl] = useState<ControlDetailDTO | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('overview');

    // Status change
    const [changingStatus, setChangingStatus] = useState(false);

    // Applicability
    const [showApplicability, setShowApplicability] = useState(false);
    const [appChoice, setAppChoice] = useState('APPLICABLE');
    const [appJustification, setAppJustification] = useState('');
    const [savingApp, setSavingApp] = useState(false);

    // Task creation
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskDue, setTaskDue] = useState('');
    const [savingTask, setSavingTask] = useState(false);

    // Evidence linking
    const [showEvidenceForm, setShowEvidenceForm] = useState(false);
    const [evidenceUrl, setEvidenceUrl] = useState('');
    const [evidenceNote, setEvidenceNote] = useState('');
    const [savingEvidence, setSavingEvidence] = useState(false);

    // File upload for this control
    const [showFileUpload, setShowFileUpload] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [fileUploadTitle, setFileUploadTitle] = useState('');
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState('');
    const fileUploadRef = useRef<HTMLInputElement>(null);

    // Mapping
    const [showMapForm, setShowMapForm] = useState(false);
    const [frameworks, setFrameworks] = useState<FrameworkDTO[]>([]);
    const [selectedFramework, setSelectedFramework] = useState('');
    const [requirements, setRequirements] = useState<RequirementDTO[]>([]);
    const [selectedReq, setSelectedReq] = useState('');
    const [savingMap, setSavingMap] = useState(false);

    // Activity trail
    const [activity, setActivity] = useState<AuditLogEntry[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);

    // Test completed
    const [markingTest, setMarkingTest] = useState(false);

    // Automation
    const [editingAutomation, setEditingAutomation] = useState(false);
    const [autoEvidenceSource, setAutoEvidenceSource] = useState('');
    const [autoKey, setAutoKey] = useState('');
    const [savingAutomation, setSavingAutomation] = useState(false);

    const fetchControl = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl(`/controls/${controlId}`));
            if (!res.ok) throw new Error('Control not found');
            setControl(await res.json());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [apiUrl, controlId]);

    useEffect(() => { fetchControl(); }, [fetchControl]);

    // Fetch frameworks when mapping tab opens
    useEffect(() => {
        if (tab !== 'mappings') return;
        fetch(apiUrl('/controls/frameworks')).then(r => r.ok ? r.json() : []).then(setFrameworks).catch(() => { });
    }, [tab, apiUrl]);

    // Fetch requirements when framework selected
    useEffect(() => {
        if (!selectedFramework) { setRequirements([]); return; }
        fetch(apiUrl(`/controls/frameworks/${selectedFramework}/requirements`))
            .then(r => r.ok ? r.json() : []).then(setRequirements).catch(() => { });
    }, [selectedFramework, apiUrl]);

    // Fetch activity when activity tab opens
    useEffect(() => {
        if (tab !== 'activity') return;
        setActivityLoading(true);
        fetch(apiUrl(`/controls/${controlId}/activity`)).then(r => r.ok ? r.json() : []).then(setActivity).catch(() => { }).finally(() => setActivityLoading(false));
    }, [tab, apiUrl, controlId]);

    const handleMarkTestCompleted = async () => {
        setMarkingTest(true);
        await fetch(apiUrl(`/controls/${controlId}/test-completed`), { method: 'POST' });
        await fetchControl();
        setMarkingTest(false);
    };

    const saveAutomation = async () => {
        setSavingAutomation(true);
        await fetch(apiUrl(`/controls/${controlId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evidenceSource: autoEvidenceSource || null, automationKey: autoKey || null }),
        });
        await fetchControl();
        setSavingAutomation(false);
        setEditingAutomation(false);
    };

    const changeStatus = async (status: string) => {
        setChangingStatus(true);
        await fetch(apiUrl(`/controls/${controlId}/status`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await fetchControl();
        setChangingStatus(false);
    };

    const saveApplicability = async () => {
        if (appChoice === 'NOT_APPLICABLE' && !appJustification.trim()) return;
        setSavingApp(true);
        await fetch(apiUrl(`/controls/${controlId}/applicability`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicability: appChoice, justification: appChoice === 'NOT_APPLICABLE' ? appJustification : null }),
        });
        await fetchControl();
        setSavingApp(false);
        setShowApplicability(false);
    };

    const createTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingTask(true);
        await fetch(apiUrl(`/controls/${controlId}/tasks`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: taskTitle, description: taskDesc || undefined, dueAt: taskDue || undefined }),
        });
        setTaskTitle(''); setTaskDesc(''); setTaskDue('');
        setShowTaskForm(false);
        await fetchControl();
        setSavingTask(false);
    };

    const updateTaskStatus = async (taskId: string, status: string) => {
        await fetch(apiUrl(`/controls/tasks/${taskId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await fetchControl();
    };

    const linkEvidence = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingEvidence(true);
        await fetch(apiUrl(`/controls/${controlId}/evidence`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'LINK', url: evidenceUrl, note: evidenceNote || undefined }),
        });
        setEvidenceUrl(''); setEvidenceNote('');
        setShowEvidenceForm(false);
        await fetchControl();
        setSavingEvidence(false);
    };

    const unlinkEvidence = async (linkId: string) => {
        await fetch(apiUrl(`/controls/${controlId}/evidence/${linkId}`), { method: 'DELETE' });
        await fetchControl();
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileToUpload) return;
        setFileUploading(true);
        setFileUploadError('');
        try {
            const formData = new FormData();
            formData.append('file', fileToUpload);
            if (fileUploadTitle) formData.append('title', fileUploadTitle);
            formData.append('controlId', controlId);
            const res = await fetch(apiUrl('/evidence/uploads'), { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Upload failed' }));
                throw new Error(err.error || err.message || 'Upload failed');
            }
            setFileToUpload(null);
            setFileUploadTitle('');
            setShowFileUpload(false);
            if (fileUploadRef.current) fileUploadRef.current.value = '';
            await fetchControl();
        } catch (err: unknown) {
            setFileUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setFileUploading(false);
        }
    };

    const mapRequirement = async () => {
        if (!selectedReq) return;
        setSavingMap(true);
        await fetch(apiUrl(`/controls/${controlId}/requirements`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: selectedReq }),
        });
        setSelectedReq('');
        setShowMapForm(false);
        await fetchControl();
        setSavingMap(false);
    };

    const unmapRequirement = async (reqId: string) => {
        await fetch(apiUrl(`/controls/${controlId}/requirements`), {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: reqId }),
        });
        await fetchControl();
    };

    if (loading) return <div className="p-12 text-center text-slate-500 animate-pulse">Loading...</div>;
    if (error) return <div className="p-12 text-center text-red-400">{error}</div>;
    if (!control) return <div className="p-12 text-center text-slate-500">Control not found.</div>;

    const doneTasks = control.controlTasks?.filter((t: ControlTaskDTO) => t.status === 'DONE').length ?? 0;
    const totalTasks = control.controlTasks?.length ?? 0;
    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'overview', label: '📋 Overview' },
        { key: 'tasks', label: '✅ Tasks', count: totalTasks },
        { key: 'evidence', label: '📎 Evidence', count: control.evidenceLinks?.length ?? 0 },
        { key: 'mappings', label: '🗺️ Mappings', count: control.frameworkMappings?.length ?? 0 },
        { key: 'traceability', label: '🔗 Traceability' },
        { key: 'activity', label: '📜 Activity' },
        { key: 'tests', label: '🧪 Tests' },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Link href={tenantHref('/controls')} className="text-slate-400 text-xs hover:text-white transition">← Controls</Link>
                    <h1 className="text-2xl font-bold mt-1" id="control-title">{control.name}</h1>
                    <div className="flex gap-2 mt-1 flex-wrap items-center">
                        {control.code && <span className="text-xs font-mono text-slate-500">{control.code}</span>}
                        <span className={`badge ${STATUS_BADGE[control.status] || 'badge-neutral'}`} id="control-status">
                            {STATUS_LABELS[control.status] || control.status}
                        </span>
                        <span className={`badge ${control.applicability === 'NOT_APPLICABLE' ? 'badge-warning' : 'badge-success'}`} id="control-applicability">
                            {control.applicability === 'NOT_APPLICABLE' ? 'Not Applicable' : 'Applicable'}
                        </span>
                    </div>
                </div>
                {permissions.canWrite && (
                    <div className="flex gap-2">
                        <select
                            className="input w-40 text-sm"
                            value={control.status}
                            onChange={e => changeStatus(e.target.value)}
                            disabled={changingStatus}
                            id="control-status-select"
                        >
                            {Object.entries(STATUS_LABELS).map(([val, lbl]) => (
                                <option key={val} value={val}>{lbl}</option>
                            ))}
                        </select>
                        <button className="btn btn-secondary text-sm" onClick={() => { setAppChoice(control.applicability); setAppJustification(control.applicabilityJustification || ''); setShowApplicability(!showApplicability); }} id="toggle-applicability-btn">
                            ⚙️ Applicability
                        </button>
                        {control.applicability !== 'NOT_APPLICABLE' && (
                            <button className="btn btn-primary text-sm" onClick={handleMarkTestCompleted} disabled={markingTest} id="mark-test-completed-btn">
                                {markingTest ? '⏳...' : '✓ Mark Test Completed'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Applicability modal */}
            {showApplicability && permissions.canWrite && (
                <div className="glass-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold">Set Applicability</h3>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="radio" value="APPLICABLE" checked={appChoice === 'APPLICABLE'} onChange={() => setAppChoice('APPLICABLE')} />
                            Applicable
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="radio" value="NOT_APPLICABLE" checked={appChoice === 'NOT_APPLICABLE'} onChange={() => setAppChoice('NOT_APPLICABLE')} />
                            Not Applicable
                        </label>
                    </div>
                    {appChoice === 'NOT_APPLICABLE' && (
                        <textarea className="input w-full" rows={2} placeholder="Justification required..." value={appJustification} onChange={e => setAppJustification(e.target.value)} id="applicability-justification" />
                    )}
                    <button onClick={saveApplicability} disabled={savingApp || (appChoice === 'NOT_APPLICABLE' && !appJustification.trim())} className="btn btn-primary text-sm" id="save-applicability-btn">
                        {savingApp ? 'Saving...' : 'Save'}
                    </button>
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

            {/* Tab content */}
            {tab === 'overview' && (
                <div className="glass-card p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Description</span>
                            <p className="text-sm text-slate-300 mt-1">{control.description || 'No description.'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Intent</span>
                            <p className="text-sm text-slate-300 mt-1">{control.intent || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Category</span>
                            <p className="text-sm text-slate-300 mt-1">{control.category || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Frequency</span>
                            <p className="text-sm text-slate-300 mt-1">{control.frequency ? FREQ_LABELS[control.frequency] || control.frequency : '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Owner</span>
                            <p className="text-sm text-slate-300 mt-1">{control.owner?.name || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Tasks Progress</span>
                            <p className="text-sm text-slate-300 mt-1">{doneTasks}/{totalTasks} completed</p>
                        </div>
                        {control.applicability === 'NOT_APPLICABLE' && control.applicabilityJustification && (
                            <div className="col-span-2">
                                <span className="text-xs text-slate-500 uppercase">N/A Justification</span>
                                <p className="text-sm text-yellow-400 mt-1">{control.applicabilityJustification}</p>
                            </div>
                        )}
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Contributors</span>
                            <div className="text-sm text-slate-300 mt-1">
                                {(control.contributors?.length ?? 0) > 0 ? control.contributors?.map((c: ContributorDTO) => (
                                    <span key={c.user.id} className="badge badge-neutral text-xs mr-1">{c.user.name ?? '—'}</span>
                                )) : '—'}
                            </div>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Last Tested</span>
                            <p className="text-sm text-slate-300 mt-1">{control.lastTested ? new Date(control.lastTested).toLocaleDateString() : '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500 uppercase">Next Due</span>
                            <p className="text-sm text-slate-300 mt-1">{control.nextDueAt ? new Date(control.nextDueAt).toLocaleDateString() : '—'}</p>
                        </div>
                    </div>
                    {/* Automation Section */}
                    <div className="border-t border-slate-700 pt-4 mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-slate-300">🔌 Automation</h3>
                            {permissions.canWrite && (
                                <button className="text-xs text-brand-400 hover:underline" onClick={() => { setAutoEvidenceSource(control.evidenceSource || ''); setAutoKey(control.automationKey || ''); setEditingAutomation(!editingAutomation); }} id="edit-automation-btn">
                                    {editingAutomation ? 'Cancel' : 'Edit'}
                                </button>
                            )}
                        </div>
                        {editingAutomation && permissions.canWrite ? (
                            <div className="space-y-2">
                                <select className="input w-full" value={autoEvidenceSource} onChange={e => setAutoEvidenceSource(e.target.value)} id="evidence-source-select">
                                    <option value="">No source</option>
                                    <option value="MANUAL">Manual</option>
                                    <option value="INTEGRATION">Integration</option>
                                </select>
                                {autoEvidenceSource === 'INTEGRATION' && (
                                    <input type="text" className="input w-full" placeholder="Automation key (e.g. aws-cis-1.2)" value={autoKey} onChange={e => setAutoKey(e.target.value)} id="automation-key-input" />
                                )}
                                <button onClick={saveAutomation} disabled={savingAutomation} className="btn btn-primary text-sm" id="save-automation-btn">
                                    {savingAutomation ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-slate-500">Evidence Source</span>
                                    <p className="text-sm text-slate-300 mt-1">{control.evidenceSource || '—'}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500">Automation Key</span>
                                    <p className="text-sm text-slate-300 mt-1 font-mono">{control.automationKey || '—'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'tasks' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary text-sm" onClick={() => setShowTaskForm(!showTaskForm)} id="create-task-btn">
                                + Create Task
                            </button>
                        </div>
                    )}
                    {showTaskForm && permissions.canWrite && (
                        <form onSubmit={createTask} className="glass-card p-4 space-y-3">
                            <input type="text" className="input w-full" placeholder="Task title *" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required id="task-title-input" />
                            <textarea className="input w-full" rows={2} placeholder="Description (optional)" value={taskDesc} onChange={e => setTaskDesc(e.target.value)} id="task-desc-input" />
                            <input type="date" className="input" value={taskDue} onChange={e => setTaskDue(e.target.value)} id="task-due-input" />
                            <button type="submit" disabled={savingTask} className="btn btn-primary text-sm" id="submit-task-btn">
                                {savingTask ? 'Creating...' : 'Create'}
                            </button>
                        </form>
                    )}
                    <div className="glass-card overflow-hidden">
                        {(control.controlTasks?.length ?? 0) === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">No tasks yet</div>
                        ) : (
                            <table className="data-table" id="tasks-table">
                                <thead>
                                    <tr><th>Title</th><th>Status</th><th>Assignee</th><th>Due</th>{permissions.canWrite && <th>Actions</th>}</tr>
                                </thead>
                                <tbody>
                                    {control.controlTasks?.map((t: ControlTaskDTO) => (
                                        <tr key={t.id}>
                                            <td className="text-sm text-white">{t.title}</td>
                                            <td><span className={`badge ${TASK_STATUS_BADGE[t.status] || 'badge-neutral'}`}>{t.status}</span></td>
                                            <td className="text-xs text-slate-400">{t.assignee?.name || '—'}</td>
                                            <td className="text-xs text-slate-400">{t.dueAt ? new Date(t.dueAt).toLocaleDateString() : '—'}</td>
                                            {permissions.canWrite && (
                                                <td>
                                                    {t.status !== 'DONE' && (
                                                        <button className="btn btn-sm btn-secondary" onClick={() => updateTaskStatus(t.id, 'DONE')} id={`mark-done-${t.id}`}>
                                                            ✓ Done
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {/* Linked Work Items (via TaskLink) */}
                    <div className="glass-card p-4 mt-4" id="linked-work-items-section">
                        <h3 className="text-sm font-semibold mb-3 text-slate-300">🔗 Linked Work Items (Tasks)</h3>
                        <LinkedTasksPanel
                            apiBase={apiUrl('')}
                            entityType="CONTROL"
                            entityId={controlId}
                            tenantHref={tenantHref}
                        />
                    </div>
                </div>
            )}

            {tab === 'evidence' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end gap-2">
                            <button className="btn btn-primary text-sm" onClick={() => { setShowFileUpload(!showFileUpload); setShowEvidenceForm(false); }} id="upload-evidence-btn">
                                📤 Upload Evidence
                            </button>
                            <button className="btn btn-secondary text-sm" onClick={() => { setShowEvidenceForm(!showEvidenceForm); setShowFileUpload(false); }} id="link-evidence-btn">
                                + Link Evidence
                            </button>
                        </div>
                    )}
                    {/* File upload form for this control */}
                    {showFileUpload && permissions.canWrite && (
                        <form onSubmit={handleFileUpload} className="glass-card p-4 space-y-3" id="control-upload-form">
                            <h4 className="text-sm font-semibold text-white">📤 Upload Evidence for {control.name}</h4>
                            <input
                                ref={fileUploadRef}
                                type="file"
                                className="input w-full file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-500 file:text-white hover:file:bg-brand-400"
                                onChange={e => setFileToUpload(e.target.files?.[0] || null)}
                                required
                                id="control-file-input"
                                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.doc,.docx,.xlsx,.xls,.json,.zip"
                            />
                            {fileToUpload && (
                                <p className="text-xs text-slate-400">📎 {fileToUpload.name} ({fileToUpload.size < 1048576 ? `${(fileToUpload.size / 1024).toFixed(1)} KB` : `${(fileToUpload.size / 1048576).toFixed(1)} MB`})</p>
                            )}
                            <input
                                type="text"
                                className="input w-full"
                                placeholder="Title (defaults to filename)"
                                value={fileUploadTitle}
                                onChange={e => setFileUploadTitle(e.target.value)}
                                id="control-upload-title"
                            />
                            {fileUploadError && (
                                <div className="text-red-400 text-sm bg-red-900/20 rounded px-3 py-2">❌ {fileUploadError}</div>
                            )}
                            {fileUploading && (
                                <div className="w-full bg-slate-700 rounded-full h-2">
                                    <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: '60%' }} />
                                </div>
                            )}
                            <button type="submit" disabled={fileUploading || !fileToUpload} className="btn btn-primary text-sm" id="submit-control-upload">
                                {fileUploading ? '⏳ Uploading...' : '📤 Upload'}
                            </button>
                        </form>
                    )}
                    {showEvidenceForm && permissions.canWrite && (
                        <form onSubmit={linkEvidence} className="glass-card p-4 space-y-3">
                            <input type="url" className="input w-full" placeholder="Evidence URL *" value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} required id="evidence-url-input" />
                            <textarea className="input w-full" rows={2} placeholder="Note (optional)" value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} id="evidence-note-input" />
                            <button type="submit" disabled={savingEvidence} className="btn btn-primary text-sm" id="submit-evidence-btn">
                                {savingEvidence ? 'Linking...' : 'Link Evidence'}
                            </button>
                        </form>
                    )}
                    <div className="glass-card overflow-hidden">
                        {(control.evidenceLinks?.length ?? 0) === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm" id="no-evidence">No evidence linked</div>
                        ) : (
                            <table className="data-table" id="evidence-table">
                                <thead>
                                    <tr><th>Type</th><th>URL / Note</th><th>Added By</th><th>Date</th>{permissions.canWrite && <th>Actions</th>}</tr>
                                </thead>
                                <tbody>
                                    {control.evidenceLinks?.map((el: EvidenceLinkDTO) => (
                                        <tr key={el.id}>
                                            <td><span className={`badge ${el.kind === 'FILE' ? 'badge-success' : 'badge-info'} text-xs`}>{el.kind === 'FILE' ? '📎 FILE' : el.kind}</span></td>
                                            <td className="text-sm">
                                                {el.url ? <a href={el.url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{el.url}</a> : (el.note || '—')}
                                            </td>
                                            <td className="text-xs text-slate-400">{el.createdBy?.name || '—'}</td>
                                            <td className="text-xs text-slate-400">{el.createdAt ? new Date(el.createdAt).toLocaleDateString() : '—'}</td>
                                            {permissions.canWrite && (
                                                <td>
                                                    <button className="text-red-400 text-xs hover:text-red-300" onClick={() => unlinkEvidence(el.id)} id={`unlink-${el.id}`}>
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

            {tab === 'mappings' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary text-sm" onClick={() => setShowMapForm(!showMapForm)} id="map-requirement-btn">
                                + Map Requirement
                            </button>
                        </div>
                    )}
                    {showMapForm && permissions.canWrite && (
                        <div className="glass-card p-4 space-y-3">
                            <select className="input w-full" value={selectedFramework} onChange={e => setSelectedFramework(e.target.value)} id="framework-select">
                                <option value="">Select Framework...</option>
                                {frameworks.map((f: FrameworkDTO) => (
                                    <option key={f.key || f.id} value={f.key || f.id}>{f.name}</option>
                                ))}
                            </select>
                            {requirements.length > 0 && (
                                <>
                                    <select className="input w-full" value={selectedReq} onChange={e => setSelectedReq(e.target.value)} id="requirement-select">
                                        <option value="">Select Requirement...</option>
                                        {requirements.map((r: RequirementDTO) => (
                                            <option key={r.id} value={r.id}>{r.code ? `${r.code} — ` : ''}{r.title || r.description}</option>
                                        ))}
                                    </select>
                                    <button onClick={mapRequirement} disabled={!selectedReq || savingMap} className="btn btn-primary text-sm" id="submit-mapping-btn">
                                        {savingMap ? 'Mapping...' : 'Map'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    <div className="glass-card overflow-hidden">
                        {(control.frameworkMappings?.length ?? 0) === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">No framework mappings</div>
                        ) : (
                            <table className="data-table" id="mappings-table">
                                <thead>
                                    <tr><th>Framework</th><th>Requirement</th>{permissions.canWrite && <th>Actions</th>}</tr>
                                </thead>
                                <tbody>
                                    {control.frameworkMappings?.map((m: FrameworkMappingDTO) => (
                                        <tr key={m.id}>
                                            <td className="text-sm text-white">{m.fromRequirement?.framework?.name || '—'}</td>
                                            <td className="text-sm text-slate-300">
                                                {m.fromRequirement?.code && <span className="font-mono text-xs text-slate-500 mr-2">{m.fromRequirement.code}</span>}
                                                {m.fromRequirement?.title || m.fromRequirement?.description || '—'}
                                            </td>
                                            {permissions.canWrite && (
                                                <td>
                                                    <button className="text-red-400 text-xs hover:text-red-300" onClick={() => unmapRequirement(m.fromRequirement?.id || m.fromRequirementId || '')} id={`unmap-${m.id}`}>
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

            {tab === 'traceability' && (
                <TraceabilityPanel
                    apiBase={apiUrl('')}
                    entityType="control"
                    entityId={controlId}
                    canWrite={permissions.canWrite}
                    tenantHref={tenantHref}
                />
            )}

            {tab === 'activity' && (
                <div className="glass-card overflow-hidden">
                    {activityLoading ? (
                        <div className="p-8 text-center text-slate-500 animate-pulse">Loading activity...</div>
                    ) : activity.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">No activity recorded</div>
                    ) : (
                        <div className="divide-y divide-slate-700/50" id="activity-feed">
                            {activity.map((ev: AuditLogEntry) => (
                                <div key={ev.id} className="px-5 py-3 flex items-start gap-3">
                                    <div className="mt-0.5">
                                        <span className="badge badge-info text-xs">{EVENT_LABELS[ev.action] || ev.action}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-300">{ev.details}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {ev.user?.name || 'System'} · {new Date(ev.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'tests' && (
                <div className="glass-card p-4">
                    <TestPlansPanel controlId={controlId} />
                </div>
            )}
        </div>
    );
}
