'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppIcon } from '@/components/icons/AppIcon';
import { useTenantContext, useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import dynamic from 'next/dynamic';
import LinkedTasksPanel from '@/components/LinkedTasksPanel';

const TraceabilityPanel = dynamic(() => import('@/components/TraceabilityPanel'), {
    loading: () => <div className="animate-pulse h-48" aria-busy="true" />,
    ssr: false,
});

type Risk = {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    threat: string | null;
    vulnerability: string | null;
    status: string;
    treatment: string | null;
    treatmentOwner: string | null;
    treatmentNotes: string | null;
    ownerUserId: string | null;
    likelihood: number;
    impact: number;
    score: number;
    inherentScore: number;
    nextReviewAt: string | null;
    targetDate: string | null;
    createdAt: string;
    updatedAt: string;
};

const STATUS_OPTIONS = ['OPEN', 'MITIGATING', 'ACCEPTED', 'CLOSED'] as const;
const CATEGORIES = [
    'Technical', 'Operational', 'Compliance', 'Strategic',
    'Financial', 'Reputational', 'Physical', 'Human Resources',
];

function isOverdue(nextReviewAt: string | null): boolean {
    if (!nextReviewAt) return false;
    return new Date(nextReviewAt) < new Date();
}

function getRiskBadge(score: number) {
    if (score <= 5) return { label: 'Low', cls: 'badge-success' };
    if (score <= 12) return { label: 'Medium', cls: 'badge-warning' };
    if (score <= 18) return { label: 'High', cls: 'badge-danger' };
    return { label: 'Critical', cls: 'badge-danger' };
}

export default function RiskDetailPage() {
    const { riskId } = useParams<{ riskId: string }>();
    const tenant = useTenantContext();
    const apiUrl = useTenantApiUrl();
    const href = useTenantHref();
    const canWrite = tenant.permissions.canWrite;

    const [risk, setRisk] = useState<Risk | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Risk>>({});

    const fetchRisk = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(apiUrl(`/risks/${riskId}`));
            if (!res.ok) throw new Error(`Failed to load risk (${res.status})`);
            const data = await res.json();
            setRisk(data);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, riskId]);

    useEffect(() => { fetchRisk(); }, [fetchRisk]);

    const startEditing = () => {
        if (!risk) return;
        setEditForm({
            title: risk.title,
            description: risk.description ?? '',
            category: risk.category ?? '',
            likelihood: risk.likelihood,
            impact: risk.impact,
            treatmentOwner: risk.treatmentOwner ?? '',
            treatment: risk.treatment ?? '',
            treatmentNotes: risk.treatmentNotes ?? '',
            nextReviewAt: risk.nextReviewAt ? risk.nextReviewAt.split('T')[0] : '',
        });
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: Record<string, any> = {
                title: editForm.title,
                description: editForm.description || null,
                category: editForm.category || null,
                likelihood: editForm.likelihood,
                impact: editForm.impact,
                treatmentOwner: editForm.treatmentOwner || null,
                treatment: editForm.treatment || null,
                treatmentNotes: editForm.treatmentNotes || null,
            };
            if (editForm.nextReviewAt) {
                payload.nextReviewAt = new Date(editForm.nextReviewAt as string).toISOString();
            } else {
                payload.nextReviewAt = null;
            }

            const res = await fetch(apiUrl(`/risks/${riskId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || `Failed to save (${res.status})`);
            }
            const { risk: updated } = await res.json();
            setRisk(updated);
            setEditing(false);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        setError(null);
        try {
            const res = await fetch(apiUrl(`/risks/${riskId}/status`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || `Failed to change status (${res.status})`);
            }
            const updated = await res.json();
            setRisk(updated);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        }
    };

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setEditForm(f => ({ ...f, [field]: e.target.value }));
    const setNum = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setEditForm(f => ({ ...f, [field]: Number(e.target.value) }));

    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="glass-card p-12 text-center text-slate-500 animate-pulse">Loading risk…</div>
            </div>
        );
    }

    if (error && !risk) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="glass-card p-8 text-center text-red-400">
                    {error}
                    <div className="mt-4"><Link href={href('/risks')} className="btn btn-secondary">← Back to Risks</Link></div>
                </div>
            </div>
        );
    }

    if (!risk) return null;

    const badge = getRiskBadge(risk.inherentScore);
    const overdue = isOverdue(risk.nextReviewAt);

    return (
        <div className="space-y-6 animate-fadeIn max-w-4xl">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <Link href={href('/risks')} className="text-slate-400 hover:text-white transition text-lg">←</Link>
                    <div>
                        <h1 className="text-2xl font-bold" id="risk-title-heading">{risk.title}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`badge ${risk.status === 'OPEN' ? 'badge-warning' : risk.status === 'CLOSED' ? 'badge-success' : 'badge-info'}`}>
                                {risk.status}
                            </span>
                            <span className={`badge ${badge.cls}`}>{risk.inherentScore} · {badge.label}</span>
                            {overdue && <span className="badge badge-danger">Overdue Review</span>}
                        </div>
                    </div>
                </div>
                {canWrite && !editing && (
                    <div className="flex gap-2">
                        <button onClick={startEditing} className="btn btn-secondary" id="edit-risk-btn">Edit</button>
                        <select
                            className="input w-36 text-sm"
                            value={risk.status}
                            onChange={e => handleStatusChange(e.target.value)}
                            id="risk-status-select"
                        >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {error && (
                <div className="glass-card p-4 border-red-500/50 text-red-400 text-sm">{error}</div>
            )}

            {/* Detail / Edit Card */}
            <div className="glass-card p-6 space-y-5" id="risk-detail">
                {editing ? (
                    /* ─── Edit Mode ─── */
                    <>
                        <div>
                            <label className="input-label">Title *</label>
                            <input className="input" value={editForm.title ?? ''} onChange={set('title')} />
                        </div>
                        <div>
                            <label className="input-label">Description</label>
                            <textarea className="input min-h-[100px]" value={editForm.description ?? ''} onChange={set('description')} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="input-label">Category</label>
                                <select className="input" value={editForm.category ?? ''} onChange={set('category')}>
                                    <option value="">— Select —</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="input-label">Treatment Owner</label>
                                <input className="input" value={editForm.treatmentOwner ?? ''} onChange={set('treatmentOwner')} />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="input-label">Likelihood</label>
                                <input type="number" min={1} max={5} className="input" value={editForm.likelihood ?? 3} onChange={setNum('likelihood')} />
                            </div>
                            <div>
                                <label className="input-label">Impact</label>
                                <input type="number" min={1} max={5} className="input" value={editForm.impact ?? 3} onChange={setNum('impact')} />
                            </div>
                            <div>
                                <label className="input-label">Score</label>
                                <div className="input bg-slate-800/50 flex items-center text-lg font-bold">
                                    {(editForm.likelihood ?? 3) * (editForm.impact ?? 3)}
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="input-label">Treatment</label>
                                <select className="input" value={editForm.treatment ?? ''} onChange={set('treatment')}>
                                    <option value="">—</option>
                                    <option value="TREAT">Treat</option>
                                    <option value="TRANSFER">Transfer</option>
                                    <option value="TOLERATE">Tolerate</option>
                                    <option value="AVOID">Avoid</option>
                                </select>
                            </div>
                            <div>
                                <label className="input-label">Next Review</label>
                                <input type="date" className="input" value={editForm.nextReviewAt ?? ''} onChange={set('nextReviewAt')} />
                            </div>
                        </div>
                        <div>
                            <label className="input-label">Treatment Notes</label>
                            <textarea className="input min-h-[80px]" value={editForm.treatmentNotes ?? ''} onChange={set('treatmentNotes')} />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={handleSave} disabled={saving} className="btn btn-primary" id="save-risk-btn">
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setEditing(false)} className="btn btn-secondary">Cancel</button>
                        </div>
                    </>
                ) : (
                    /* ─── Read Mode ─── */
                    <>
                        {risk.description && (
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</h3>
                                <p className="text-sm text-slate-300 whitespace-pre-wrap">{risk.description}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Category</h3>
                                <p className="text-sm">{risk.category || '—'}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Treatment Owner</h3>
                                <p className="text-sm">{risk.treatmentOwner || '—'}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Treatment</h3>
                                <p className="text-sm">{risk.treatment || 'Untreated'}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Target Date</h3>
                                <p className="text-sm">{risk.targetDate ? new Date(risk.targetDate).toLocaleDateString() : '—'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="glass-card p-4 text-center">
                                <p className="text-xs text-slate-400 uppercase">Likelihood</p>
                                <p className="text-2xl font-bold mt-1">{risk.likelihood}</p>
                            </div>
                            <div className="glass-card p-4 text-center">
                                <p className="text-xs text-slate-400 uppercase">Impact</p>
                                <p className="text-2xl font-bold mt-1">{risk.impact}</p>
                            </div>
                            <div className="glass-card p-4 text-center">
                                <p className="text-xs text-slate-400 uppercase">Inherent Score</p>
                                <p className={`text-2xl font-bold mt-1 ${risk.inherentScore > 12 ? 'text-red-400' : risk.inherentScore > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {risk.inherentScore}
                                </p>
                            </div>
                        </div>

                        {risk.threat && (
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Threat</h3>
                                <p className="text-sm text-slate-300">{risk.threat}</p>
                            </div>
                        )}
                        {risk.vulnerability && (
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Vulnerability</h3>
                                <p className="text-sm text-slate-300 whitespace-pre-wrap">{risk.vulnerability}</p>
                            </div>
                        )}
                        {risk.treatmentNotes && (
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Treatment Notes</h3>
                                <p className="text-sm text-slate-300 whitespace-pre-wrap">{risk.treatmentNotes}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 border-t border-slate-700/50 pt-4">
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Next Review</h3>
                                <p className={`text-sm ${overdue ? 'text-red-400 font-semibold' : ''}`}>
                                    {risk.nextReviewAt
                                        ? `${overdue ? '! ' : ''}${new Date(risk.nextReviewAt).toLocaleDateString()}`
                                        : '—'
                                    }
                                </p>
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Created</h3>
                                <p className="text-sm text-slate-400">{new Date(risk.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Linked Tasks */}
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4 inline-flex items-center gap-2"><AppIcon name="tasks" size={18} /> Linked Tasks</h2>
                <LinkedTasksPanel
                    apiBase={apiUrl('')}
                    entityType="RISK"
                    entityId={riskId}
                    tenantHref={href}
                />
            </div>

            {/* Traceability */}
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4 inline-flex items-center gap-2"><AppIcon name="link" size={18} /> Traceability</h2>
                <TraceabilityPanel
                    apiBase={apiUrl('')}
                    entityType="risk"
                    entityId={riskId}
                    canWrite={canWrite}
                    tenantHref={href}
                />
            </div>
        </div>
    );
}
