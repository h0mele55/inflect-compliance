'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { UserCombobox } from '@/components/ui/user-combobox';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';

const TYPE_OPTIONS: ComboboxOption[] = [
    { value: 'TASK', label: 'Task' },
    { value: 'AUDIT_FINDING', label: 'Audit Finding' },
    { value: 'CONTROL_GAP', label: 'Control Gap' },
    { value: 'INCIDENT', label: 'Incident' },
    { value: 'IMPROVEMENT', label: 'Improvement' },
];
const SEVERITY_OPTIONS: ComboboxOption[] = [
    { value: 'INFO', label: 'Info' },
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' },
];
const PRIORITY_OPTIONS: ComboboxOption[] = [
    { value: 'P0', label: 'P0 — Critical' },
    { value: 'P1', label: 'P1 — High' },
    { value: 'P2', label: 'P2 — Medium' },
    { value: 'P3', label: 'P3 — Low' },
];

const LINK_ENTITY_OPTIONS = [
    { value: 'CONTROL', label: 'Control' },
    { value: 'FRAMEWORK_REQUIREMENT', label: 'Framework Requirement' },
    { value: 'ASSET', label: 'Asset' },
    { value: 'RISK', label: 'Risk' },
    { value: 'EVIDENCE', label: 'Evidence' },
];

const FINDING_OPTIONS = [
    { value: '', label: '— Select source —' },
    { value: 'INTERNAL', label: 'Internal' },
    { value: 'EXTERNAL_AUDITOR', label: 'External Auditor' },
    { value: 'PEN_TEST', label: 'Pen Test' },
    { value: 'INCIDENT', label: 'Incident' },
];
const GAP_TYPE_OPTIONS = [
    { value: '', label: '— Select type —' },
    { value: 'DESIGN', label: 'Design' },
    { value: 'OPERATING_EFFECTIVENESS', label: 'Operating Effectiveness' },
    { value: 'DOCUMENTATION', label: 'Documentation' },
];

type PendingLink = { entityType: string; entityId: string };

export default function NewTaskPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { tenantSlug } = useTenantContext();
    const router = useRouter();

    const [form, setForm] = useState({
        title: '', description: '', type: 'TASK', severity: 'MEDIUM',
        priority: 'P2', dueAt: '', assigneeUserId: '', controlId: '',
        findingSource: '', controlGapType: '',
    });
    const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
    const [linkEntityType, setLinkEntityType] = useState('CONTROL');
    const [linkEntityId, setLinkEntityId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

    const addPendingLink = () => {
        if (!linkEntityId.trim()) return;
        setPendingLinks(prev => [...prev, { entityType: linkEntityType, entityId: linkEntityId.trim() }]);
        setLinkEntityId('');
    };
    const removePendingLink = (idx: number) => {
        setPendingLinks(prev => prev.filter((_, i) => i !== idx));
    };

    // Validation: certain types require a control or link
    const needsControlOrLink = ['AUDIT_FINDING', 'CONTROL_GAP'].includes(form.type);
    const needsAssetOrControl = form.type === 'INCIDENT';
    const hasControlOrLink = !!form.controlId || pendingLinks.some(l => ['CONTROL', 'FRAMEWORK_REQUIREMENT'].includes(l.entityType));
    const hasAssetOrControl = !!form.controlId || pendingLinks.some(l => ['CONTROL', 'ASSET'].includes(l.entityType));

    const validationMessage = (() => {
        if (needsControlOrLink && !hasControlOrLink) return 'Audit Finding / Control Gap requires a control or framework requirement link.';
        if (needsAssetOrControl && !hasAssetOrControl) return 'Incident requires an asset or control link.';
        return '';
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (validationMessage) { setError(validationMessage); return; }
        setSaving(true);
        setError('');
        try {
            // Build metadata from audit-specific fields
            const metadataJson: Record<string, string> = {};
            if (form.findingSource) metadataJson.findingSource = form.findingSource;
            if (form.controlGapType) metadataJson.controlGapType = form.controlGapType;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body: any = {
                title: form.title,
                type: form.type,
                severity: form.severity,
                priority: form.priority,
                description: form.description || undefined,
                dueAt: form.dueAt || undefined,
                assigneeUserId: form.assigneeUserId || undefined,
                controlId: form.controlId || undefined,
                metadataJson: Object.keys(metadataJson).length > 0 ? metadataJson : undefined,
            };
            const res = await fetch(apiUrl('/tasks'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg = typeof data.error === 'string' ? data.error : data.message || 'Failed to create task';
                throw new Error(msg);
            }
            const task = await res.json();

            // Create pending links
            for (const link of pendingLinks) {
                await fetch(apiUrl(`/tasks/${task.id}/links`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entityType: link.entityType, entityId: link.entityId, relation: 'RELATES_TO' }),
                }).catch(() => { });
            }

            router.push(tenantHref(`/tasks/${task.id}`));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <div>
                <Link href={tenantHref('/tasks')} className="text-slate-400 text-xs hover:text-white transition">← Tasks</Link>
                <h1 className="text-2xl font-bold mt-1" id="new-task-heading">New Task</h1>
                <p className="text-slate-400 text-sm">Create a new task to track.</p>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" id="task-error">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
                <div>
                    <label className="block text-sm text-slate-300 mb-1">Title *</label>
                    <input type="text" className="input w-full" placeholder="Brief summary of the task" value={form.title} onChange={e => update('title', e.target.value)} required id="task-title-input" />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">Description</label>
                    <textarea className="input w-full" rows={3} placeholder="Detailed description (optional)" value={form.description} onChange={e => update('description', e.target.value)} id="task-description-input" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Type *</label>
                        <Combobox
                            id="task-type-select"
                            name="type"
                            options={TYPE_OPTIONS}
                            selected={TYPE_OPTIONS.find(o => o.value === form.type) ?? null}
                            setSelected={(o) => update('type', o?.value ?? '')}
                            placeholder="Select type…"
                            hideSearch
                            matchTriggerWidth
                            buttonProps={{ className: 'w-full' }}
                            caret
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Severity</label>
                        <Combobox
                            id="task-severity-select"
                            name="severity"
                            options={SEVERITY_OPTIONS}
                            selected={SEVERITY_OPTIONS.find(o => o.value === form.severity) ?? null}
                            setSelected={(o) => update('severity', o?.value ?? '')}
                            placeholder="Select severity…"
                            hideSearch
                            matchTriggerWidth
                            buttonProps={{ className: 'w-full' }}
                            caret
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Priority</label>
                        <Combobox
                            id="task-priority-select"
                            name="priority"
                            options={PRIORITY_OPTIONS}
                            selected={PRIORITY_OPTIONS.find(o => o.value === form.priority) ?? null}
                            setSelected={(o) => update('priority', o?.value ?? '')}
                            placeholder="Select priority…"
                            hideSearch
                            matchTriggerWidth
                            buttonProps={{ className: 'w-full' }}
                            caret
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Due Date</label>
                        <input type="date" className="input w-full" value={form.dueAt} onChange={e => update('dueAt', e.target.value)} id="task-due-input" />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Assignee</label>
                        <UserCombobox
                            id="task-assignee-input"
                            name="assigneeUserId"
                            tenantSlug={tenantSlug}
                            selectedId={form.assigneeUserId || null}
                            onChange={(userId) =>
                                update('assigneeUserId', userId ?? '')
                            }
                            placeholder="Unassigned"
                            forceDropdown={false}
                        />
                    </div>
                </div>

                {/* Control picker */}
                <div>
                    <label className="block text-sm text-slate-300 mb-1">Control ID (optional)</label>
                    <input type="text" className="input w-full" placeholder="Paste control ID to link" value={form.controlId} onChange={e => update('controlId', e.target.value)} id="task-control-input" />
                </div>

                {/* Audit fields — shown for AUDIT_FINDING / CONTROL_GAP */}
                {(form.type === 'AUDIT_FINDING' || form.type === 'CONTROL_GAP') && (
                    <div className="border-t border-slate-700 pt-4 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-300">Audit Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">Finding Source</label>
                                <select className="input w-full" value={form.findingSource} onChange={e => update('findingSource', e.target.value)} id="finding-source-select">
                                    {FINDING_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </div>
                            {form.type === 'CONTROL_GAP' && (
                                <div>
                                    <label className="block text-sm text-slate-300 mb-1">Control Gap Type</label>
                                    <select className="input w-full" value={form.controlGapType} onChange={e => update('controlGapType', e.target.value)} id="gap-type-select">
                                        {GAP_TYPE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Links section */}
                <div className="border-t border-slate-700 pt-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-300">Links</h3>
                    {validationMessage && (
                        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2" id="link-validation-hint">
                            {validationMessage}
                        </div>
                    )}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Entity Type</label>
                            <select className="input w-full text-sm" value={linkEntityType} onChange={e => setLinkEntityType(e.target.value)} id="link-entity-type">
                                {LINK_ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Entity ID</label>
                            <input type="text" className="input w-full text-sm" placeholder="Paste ID" value={linkEntityId} onChange={e => setLinkEntityId(e.target.value)} id="link-entity-id" />
                        </div>
                        <button type="button" className="btn btn-secondary" onClick={addPendingLink} id="add-link-btn">+ Add</button>
                    </div>
                    {pendingLinks.length > 0 && (
                        <div className="space-y-1" id="pending-links-list">
                            {pendingLinks.map((l, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 rounded px-3 py-1.5">
                                    <span className="badge badge-info text-xs">{l.entityType}</span>
                                    <span className="font-mono text-xs flex-1">{l.entityId}</span>
                                    <button type="button" className="text-red-400 text-xs hover:text-red-300" onClick={() => removePendingLink(i)} aria-label="Remove link">×</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={saving} className="btn btn-primary" id="create-task-btn">
                        {saving ? 'Creating...' : 'Create Task'}
                    </button>
                    <Link href={tenantHref('/tasks')} className="btn btn-secondary">Cancel</Link>
                </div>
            </form>
        </div>
    );
}
