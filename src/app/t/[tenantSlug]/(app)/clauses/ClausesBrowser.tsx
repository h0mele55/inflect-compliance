'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

const STATUS_COLORS: Record<string, string> = {
    NOT_STARTED: 'badge-neutral', IN_PROGRESS: 'badge-info', READY: 'badge-success', NEEDS_REVIEW: 'badge-warning',
};

interface ClausesBrowserProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clauses: any[];
    tenantSlug: string;
}

/**
 * Client island for clause browsing — handles selection state and status updates.
 * Data is pre-fetched server-side and passed via props.
 */
export function ClausesBrowser({ clauses: initialClauses, tenantSlug }: ClausesBrowserProps) {
    const t = useTranslations('clauses');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [clauses, setClauses] = useState<any[]>(initialClauses);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selected, setSelected] = useState<any>(null);

    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;

    const updateStatus = async (clauseId: string, status: string) => {
        await fetch(apiUrl(`/clauses/${clauseId}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        setClauses(prev => prev.map(c => c.id === clauseId ? { ...c, status } : c));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (selected?.id === clauseId) setSelected((s: any) => ({ ...s, status }));
    };

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { NOT_STARTED: t('notStarted'), IN_PROGRESS: t('inProgress'), READY: t('ready'), NEEDS_REVIEW: t('needsReview') };
        return map[status] || status;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 space-y-2">
                {clauses.map(c => (
                    <button key={c.id} onClick={() => setSelected(c)}
                        className={`w-full text-left glass-card p-4 hover:bg-slate-700/30 transition ${selected?.id === c.id ? 'ring-2 ring-brand-500' : ''}`}>
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{t('clause')} {c.number}</span>
                            <span className={`badge ${STATUS_COLORS[c.status]}`}>{statusLabel(c.status)}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{c.title}</p>
                    </button>
                ))}
            </div>

            <div className="lg:col-span-2">
                {selected ? (
                    <div className="glass-card p-6 animate-slideIn">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold">{t('clause')} {selected.number}: {selected.title}</h2>
                            <select className="input w-40" value={selected.status} onChange={e => updateStatus(selected.id, e.target.value)}>
                                <option value="NOT_STARTED">{t('notStarted')}</option>
                                <option value="IN_PROGRESS">{t('inProgress')}</option>
                                <option value="READY">{t('ready')}</option>
                                <option value="NEEDS_REVIEW">{t('needsReview')}</option>
                            </select>
                        </div>
                        <p className="text-sm text-slate-300 mb-4">{selected.description}</p>
                        <div className="mb-4">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">{t('requiredArtifacts')}</h3>
                            <p className="text-sm text-slate-400">{selected.artifacts}</p>
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">{t('checklist')}</h3>
                            <div className="space-y-2">
                                {selected.checklist?.map((item: string, i: number) => (
                                    <label key={i} className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer group">
                                        <input type="checkbox" className="mt-1 accent-brand-500" />
                                        <span className="group-hover:text-white transition">{item}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="glass-card p-12 text-center text-slate-500">
                        <p>{t('selectClause')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
