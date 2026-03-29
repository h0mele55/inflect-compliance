'use client';
import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useParams } from 'next/navigation';
import Link from 'next/link';
// Inline pencil icon to avoid lucide-react barrel import issue with Next.js 14
const PencilIcon = ({ size = 14 }: { size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
);
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { extractMutationError } from '@/lib/mutations';
import dynamic from 'next/dynamic';
import LinkedTasksPanel from '@/components/LinkedTasksPanel';

const TraceabilityPanel = dynamic(() => import('@/components/TraceabilityPanel'), {
    loading: () => <div className="glass-card p-6 animate-pulse h-48" aria-busy="true" />,
    ssr: false,
});
const TestPlansPanel = dynamic(() => import('@/components/TestPlansPanel'), {
    loading: () => <div className="glass-card p-6 animate-pulse h-48" aria-busy="true" />,
    ssr: false,
});
import type {
    ControlDetailDTO, ControlTaskDTO, EvidenceLinkDTO,
    FrameworkMappingDTO, ContributorDTO, AuditLogEntry,
} from '@/lib/dto';
import type { FrameworkDTO, RequirementDTO } from '@/lib/dto';

const STATUS_BADGE: Record<string, string> = {
    NOT_STARTED: 'badge-neutral', IN_PROGRESS: 'badge-info', IMPLEMENTED: 'badge-success',
    NEEDS_REVIEW: 'badge-warning',
};
const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', IMPLEMENTED: 'Implemented',
    NEEDS_REVIEW: 'Needs Review',
};
const TASK_STATUS_BADGE: Record<string, string> = {
    OPEN: 'badge-neutral', IN_PROGRESS: 'badge-info', DONE: 'badge-success', BLOCKED: 'badge-danger',
};
const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};
const FREQ_OPTIONS = ['', 'AD_HOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'];
const CATEGORY_OPTIONS = ['', 'ORGANIZATIONAL', 'PEOPLE', 'PHYSICAL', 'TECHNOLOGICAL'];
const CATEGORY_LABELS: Record<string, string> = {
    ORGANIZATIONAL: 'Organizational', PEOPLE: 'People', PHYSICAL: 'Physical', TECHNOLOGICAL: 'Technological',
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
    const { permissions, tenantSlug } = useTenantContext();
    const controlId = params?.controlId as string;
    const queryClient = useQueryClient();

    // ─── Query: control detail ───
    const controlQuery = useQuery<ControlDetailDTO>({
        queryKey: queryKeys.controls.detail(tenantSlug, controlId),
        queryFn: async () => {
            const res = await fetch(apiUrl(`/controls/${controlId}`));
            if (!res.ok) throw new Error('Control not found');
            return res.json();
        },
        enabled: !!controlId,
    });
    const control = controlQuery.data ?? null;
    const loading = controlQuery.isLoading;
    const error = controlQuery.error?.message ?? '';
    const refetch = controlQuery.refetch;
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

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', intent: '', category: '', frequency: '', owner: '' });
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState('');
    const [editSuccess, setEditSuccess] = useState(false);

    // (fetchControl replaced by useQuery above — use refetch() below)

    // ─── Edit modal handlers ───

    const openEditModal = () => {
        if (!control) return;
        setEditForm({
            name: control.name || '',
            description: control.description || '',
            intent: control.intent || '',
            category: control.category || '',
            frequency: control.frequency || '',
            owner: control.ownerUserId || '',
        });
        setEditError('');
        setEditSuccess(false);
        setShowEditModal(true);
    };


    // ─── Mutation: edit control ───
    const editMutation = useMutation({
        mutationFn: async (form: typeof editForm) => {
            const res = await fetch(apiUrl(`/controls/${controlId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    intent: form.intent.trim() || null,
                    category: form.category.trim() || null,
                    frequency: form.frequency || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Update failed' }));
                throw new Error(extractMutationError(err, 'Update failed'));
            }
            // If owner changed, call the separate owner endpoint
            const originalOwner = control?.ownerUserId || '';
            if (form.owner.trim() !== originalOwner) {
                const ownerRes = await fetch(apiUrl(`/controls/${controlId}/owner`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerUserId: form.owner.trim() || null }),
                });
                if (!ownerRes.ok) {
                    const ownerErr = await ownerRes.json().catch(() => ({ error: 'Owner update failed' }));
                    throw new Error(extractMutationError(ownerErr, 'Owner update failed'));
                }
            }
            return form;
        },
        onMutate: async (form) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.controls.detail(tenantSlug, controlId) });
            const previous = queryClient.getQueryData<ControlDetailDTO>(queryKeys.controls.detail(tenantSlug, controlId));
            if (previous) {
                queryClient.setQueryData<ControlDetailDTO>(queryKeys.controls.detail(tenantSlug, controlId), {
                    ...previous,
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    intent: form.intent.trim() || null,
                    category: form.category.trim() || null,
                    frequency: form.frequency || null,
                });
            }
            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) {
                queryClient.setQueryData(queryKeys.controls.detail(tenantSlug, controlId), context.previous);
            }
        },
        onSuccess: () => {
            setShowEditModal(false);
            setEditSuccess(true);
            setTimeout(() => setEditSuccess(false), 3000);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.controls.all(tenantSlug) });
            setSavingEdit(false);
        },
    });

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.name || editForm.name.trim().length < 3) {
            setEditError('Title must be at least 3 characters.');
            return;
        }
        setSavingEdit(true);
        setEditError('');
        editMutation.mutate(editForm, {
            onError: (err) => {
                setEditError(err instanceof Error ? err.message : 'Update failed');
            },
        });
    };

    const handleEditCancel = () => {
        setShowEditModal(false);
        setEditError('');
    };

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
        await refetch();
        setMarkingTest(false);
    };

    const saveAutomation = async () => {
        setSavingAutomation(true);
        await fetch(apiUrl(`/controls/${controlId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evidenceSource: autoEvidenceSource || null, automationKey: autoKey || null }),
        });
        await refetch();
        setSavingAutomation(false);
        setEditingAutomation(false);
    };

    const changeStatus = async (status: string) => {
        setChangingStatus(true);
        await fetch(apiUrl(`/controls/${controlId}/status`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await refetch();
        queryClient.invalidateQueries({ queryKey: queryKeys.controls.list(tenantSlug) });
        setChangingStatus(false);
    };

    const saveApplicability = async () => {
        if (appChoice === 'NOT_APPLICABLE' && !appJustification.trim()) return;
        setSavingApp(true);
        await fetch(apiUrl(`/controls/${controlId}/applicability`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicability: appChoice, justification: appChoice === 'NOT_APPLICABLE' ? appJustification : null }),
        });
        await refetch();
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
        await refetch();
        setSavingTask(false);
    };

    const updateTaskStatus = async (taskId: string, status: string) => {
        await fetch(apiUrl(`/controls/tasks/${taskId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await refetch();
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
        await refetch();
        setSavingEvidence(false);
    };

    const unlinkEvidence = async (linkId: string) => {
        await fetch(apiUrl(`/controls/${controlId}/evidence/${linkId}`), { method: 'DELETE' });
        await refetch();
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
            await refetch();
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
        await refetch();
        setSavingMap(false);
    };

    const unmapRequirement = async (reqId: string) => {
        await fetch(apiUrl(`/controls/${controlId}/requirements`), {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: reqId }),
        });
        await refetch();
    };

    if (loading) return (
        <div className="space-y-6 animate-fadeIn" aria-busy="true">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="animate-pulse rounded bg-slate-700/60 h-4 w-24" />
                    <div className="animate-pulse rounded bg-slate-700/60 h-7 w-64" />
                </div>
            </div>
            <div className="flex gap-1 border-b border-slate-700">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="animate-pulse rounded bg-slate-700/60 h-8 w-20 mx-1" />
                ))}
            </div>
            <div className="glass-card p-6 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="space-y-1">
                            <div className="animate-pulse rounded bg-slate-700/60 h-3 w-16" />
                            <div className="animate-pulse rounded bg-slate-700/60 h-4 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
    if (error) return <div className="p-12 text-center text-red-400">{error}</div>;
    if (!control) return <div className="p-12 text-center text-slate-500">Control not found.</div>;

    const doneTasks = control.controlTasks?.filter((t: ControlTaskDTO) => t.status === 'DONE').length ?? 0;
    const totalTasks = control.controlTasks?.length ?? 0;
    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'overview', label: 'Overview' },
        { key: 'tasks', label: 'Tasks', count: totalTasks },
        { key: 'evidence', label: 'Evidence', count: control.evidenceLinks?.length ?? 0 },
        { key: 'mappings', label: 'Mappings', count: control.frameworkMappings?.length ?? 0 },
        { key: 'traceability', label: 'Traceability' },
        { key: 'activity', label: 'Activity' },
        { key: 'tests', label: 'Tests' },
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
                        <button className="btn btn-secondary" onClick={() => { setAppChoice(control.applicability); setAppJustification(control.applicabilityJustification || ''); setShowApplicability(!showApplicability); }} id="toggle-applicability-btn">
                            Applicability
                        </button>
                        {control.applicability !== 'NOT_APPLICABLE' && (
                            <button className="btn btn-primary" onClick={handleMarkTestCompleted} disabled={markingTest} id="mark-test-completed-btn">
                                {markingTest ? '...' : 'Mark Test Completed'}
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
                    <button onClick={saveApplicability} disabled={savingApp || (appChoice === 'NOT_APPLICABLE' && !appJustification.trim())} className="btn btn-primary" id="save-applicability-btn">
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
                    {/* Overview header with Edit button */}
                    {permissions.canWrite && (
                        <div className="flex justify-end -mt-1 -mb-2">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={openEditModal}
                                data-testid="control-edit-button"
                                id="control-edit-button"
                            >
                                <PencilIcon size={14} />
                                Edit
                            </button>
                        </div>
                    )}
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
                            <h3 className="text-sm font-semibold text-slate-300">Automation</h3>
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
                                <button onClick={saveAutomation} disabled={savingAutomation} className="btn btn-primary" id="save-automation-btn">
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

            {/* Edit Control Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={handleEditCancel} data-testid="control-edit-dialog" id="control-edit-dialog">
                    <form onSubmit={handleEditSave} className="glass-card p-6 w-full max-w-lg space-y-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-white">Edit Control</h3>

                        {editError && (
                            <div className="text-red-400 text-sm bg-red-900/20 rounded px-3 py-2">{editError}</div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label htmlFor="edit-name" className="text-xs text-slate-400 uppercase block mb-1">Title *</label>
                                <input
                                    id="edit-name"
                                    type="text"
                                    className="input w-full"
                                    value={editForm.name}
                                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                    required
                                    minLength={3}
                                    data-testid="edit-name-input"
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-description" className="text-xs text-slate-400 uppercase block mb-1">Description</label>
                                <textarea
                                    id="edit-description"
                                    className="input w-full"
                                    rows={3}
                                    value={editForm.description}
                                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                                    data-testid="edit-description-input"
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-intent" className="text-xs text-slate-400 uppercase block mb-1">Intent</label>
                                <textarea
                                    id="edit-intent"
                                    className="input w-full"
                                    rows={2}
                                    value={editForm.intent}
                                    onChange={e => setEditForm(f => ({ ...f, intent: e.target.value }))}
                                    data-testid="edit-intent-input"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="edit-category" className="text-xs text-slate-400 uppercase block mb-1">Category</label>
                                    <select
                                        id="edit-category"
                                        className="input w-full"
                                        value={editForm.category}
                                        onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                        data-testid="edit-category-input"
                                    >
                                        {CATEGORY_OPTIONS.map(c => (
                                            <option key={c} value={c}>{c ? CATEGORY_LABELS[c] || c : '— None —'}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="edit-frequency" className="text-xs text-slate-400 uppercase block mb-1">Frequency</label>
                                    <select
                                        id="edit-frequency"
                                        className="input w-full"
                                        value={editForm.frequency}
                                        onChange={e => setEditForm(f => ({ ...f, frequency: e.target.value }))}
                                        data-testid="edit-frequency-select"
                                    >
                                        {FREQ_OPTIONS.map(f => (
                                            <option key={f} value={f}>{f ? FREQ_LABELS[f] || f : '— None —'}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="edit-owner" className="text-xs text-slate-400 uppercase block mb-1">Owner</label>
                                <input
                                    id="edit-owner"
                                    type="text"
                                    className="input w-full"
                                    placeholder="User ID (leave empty to clear)"
                                    value={editForm.owner}
                                    onChange={e => setEditForm(f => ({ ...f, owner: e.target.value }))}
                                    data-testid="edit-owner-input"
                                />
                                {control?.owner?.name && (
                                    <p className="text-xs text-slate-500 mt-1">Current: {control.owner.name}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" className="btn btn-secondary" onClick={handleEditCancel} data-testid="edit-cancel-button">
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={savingEdit || editForm.name.trim().length < 3} data-testid="edit-save-button">
                                {savingEdit ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Success toast */}
            {editSuccess && (
                <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg animate-fadeIn text-sm" id="edit-success-toast">
                    Control updated
                </div>
            )}

            {tab === 'tasks' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary" onClick={() => setShowTaskForm(!showTaskForm)} id="create-task-btn">
                                + Create Task
                            </button>
                        </div>
                    )}
                    {showTaskForm && permissions.canWrite && (
                        <form onSubmit={createTask} className="glass-card p-4 space-y-3">
                            <input type="text" className="input w-full" placeholder="Task title *" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required id="task-title-input" />
                            <textarea className="input w-full" rows={2} placeholder="Description (optional)" value={taskDesc} onChange={e => setTaskDesc(e.target.value)} id="task-desc-input" />
                            <input type="date" className="input" value={taskDue} onChange={e => setTaskDue(e.target.value)} id="task-due-input" />
                            <button type="submit" disabled={savingTask} className="btn btn-primary" id="submit-task-btn">
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
                                                            Done
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
                        <h3 className="text-sm font-semibold mb-3 text-slate-300">Linked Work Items (Tasks)</h3>
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
                            <button className="btn btn-primary" onClick={() => { setShowFileUpload(!showFileUpload); setShowEvidenceForm(false); }} id="upload-evidence-btn">
                                Upload Evidence
                            </button>
                            <button className="btn btn-secondary" onClick={() => { setShowEvidenceForm(!showEvidenceForm); setShowFileUpload(false); }} id="link-evidence-btn">
                                + Link Evidence
                            </button>
                        </div>
                    )}
                    {/* File upload form for this control */}
                    {showFileUpload && permissions.canWrite && (
                        <form onSubmit={handleFileUpload} className="glass-card p-4 space-y-3" id="control-upload-form">
                            <h4 className="text-sm font-semibold text-white">Upload Evidence for {control.name}</h4>
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
                                <p className="text-xs text-slate-400">{fileToUpload.name} ({fileToUpload.size < 1048576 ? `${(fileToUpload.size / 1024).toFixed(1)} KB` : `${(fileToUpload.size / 1048576).toFixed(1)} MB`})</p>
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
                                <div className="text-red-400 text-sm bg-red-900/20 rounded px-3 py-2">{fileUploadError}</div>
                            )}
                            {fileUploading && (
                                <div className="w-full bg-slate-700 rounded-full h-2">
                                    <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: '60%' }} />
                                </div>
                            )}
                            <button type="submit" disabled={fileUploading || !fileToUpload} className="btn btn-primary" id="submit-control-upload">
                                {fileUploading ? 'Uploading...' : 'Upload'}
                            </button>
                        </form>
                    )}
                    {showEvidenceForm && permissions.canWrite && (
                        <form onSubmit={linkEvidence} className="glass-card p-4 space-y-3">
                            <input type="url" className="input w-full" placeholder="Evidence URL *" value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} required id="evidence-url-input" />
                            <textarea className="input w-full" rows={2} placeholder="Note (optional)" value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} id="evidence-note-input" />
                            <button type="submit" disabled={savingEvidence} className="btn btn-primary" id="submit-evidence-btn">
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
                                            <td><span className={`badge ${el.kind === 'FILE' ? 'badge-success' : 'badge-info'} text-xs`}>{el.kind === 'FILE' ? 'FILE' : el.kind}</span></td>
                                            <td className="text-sm">
                                                {el.url ? <a href={el.url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{el.url}</a> : (el.note || '—')}
                                            </td>
                                            <td className="text-xs text-slate-400">{el.createdBy?.name || '—'}</td>
                                            <td className="text-xs text-slate-400">{el.createdAt ? new Date(el.createdAt).toLocaleDateString() : '—'}</td>
                                            {permissions.canWrite && (
                                                <td>
                                                    <button className="text-red-400 text-xs hover:text-red-300" onClick={() => unlinkEvidence(el.id)} id={`unlink-${el.id}`}>
                                                        × Remove
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
                            <button className="btn btn-primary" onClick={() => setShowMapForm(!showMapForm)} id="map-requirement-btn">
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
                                    <button onClick={mapRequirement} disabled={!selectedReq || savingMap} className="btn btn-primary" id="submit-mapping-btn">
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
                                                        × Remove
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
