'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

const STATUS_BADGE: Record<string, string> = {
    PLANNED: 'badge-neutral', IN_PROGRESS: 'badge-info', COMPLETED: 'badge-success', CANCELLED: 'badge-warning',
};
const RESULT_BADGE: Record<string, string> = {
    NOT_TESTED: 'badge-neutral', PASS: 'badge-success', FAIL: 'badge-danger',
};

export default function AuditsPage() {
    const apiUrl = useTenantApiUrl();
    const t = useTranslations('audits');
    const tc = useTranslations('common');
    const [audits, setAudits] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selected, setSelected] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: '', scope: '', auditors: '', generateChecklist: true });

    useEffect(() => { fetch(apiUrl('/audits')).then(r => r.json()).then(setAudits); }, [apiUrl]);

    const loadAudit = async (id: string) => {
        const res = await fetch(apiUrl(`/audits/${id}`));
        setSelected(await res.json());
    };

    const createAudit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch(apiUrl('/audits'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        if (res.ok) { const a = await res.json(); setAudits(prev => [a, ...prev]); setShowForm(false); loadAudit(a.id); }
    };

    const updateChecklist = async (itemId: string, result: string, notes: string = '') => {
        if (!selected) return;
        await fetch(apiUrl(`/audits/${selected.id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklistUpdates: [{ id: itemId, result, notes }] }) });
        loadAudit(selected.id);
    };

    const updateAuditStatus = async (status: string) => {
        if (!selected) return;
        await fetch(apiUrl(`/audits/${selected.id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSelected((s: any) => ({ ...s, status }));
        setAudits(prev => prev.map(a => a.id === selected.id ? { ...a, status } : a));
    };

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { PLANNED: t('planned'), IN_PROGRESS: t('inProgress'), COMPLETED: t('completed'), CANCELLED: t('cancelled') };
        return map[status] || status;
    };

    const resultLabel = (result: string) => {
        const map: Record<string, string> = { NOT_TESTED: t('notTested'), PASS: t('pass'), FAIL: t('fail') };
        return map[result] || result;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">{t('title')}</h1><p className="text-slate-400 text-sm">{t('auditsCount', { count: audits.length })}</p></div>
                <button onClick={() => setShowForm(!showForm)} className="btn btn-primary" id="new-audit-btn">{t('newAudit')}</button>
            </div>

            {showForm && (
                <form onSubmit={createAudit} className="glass-card p-6 space-y-4 animate-fadeIn" id="audit-form">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="input-label">{t('auditTitle')} *</label><input className="input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} id="audit-title-input" /></div>
                        <div><label className="input-label">{t('auditors')}</label><input className="input" value={form.auditors} onChange={e => setForm(f => ({ ...f, auditors: e.target.value }))} /></div>
                        <div className="col-span-2"><label className="input-label">{t('scope')}</label><textarea className="input" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} id="audit-scope-input" /></div>
                    </div>
                    <div className="flex gap-2"><button type="submit" className="btn btn-primary" id="create-audit-btn">{t('createAudit')}</button><button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">{tc('cancel')}</button></div>
                </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                    {audits.map(a => (
                        <button key={a.id} onClick={() => loadAudit(a.id)}
                            className={`w-full text-left glass-card p-4 hover:bg-slate-700/30 transition ${selected?.id === a.id ? 'ring-2 ring-brand-500' : ''}`}>
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{a.title}</span>
                                <span className={`badge ${STATUS_BADGE[a.status]}`}>{statusLabel(a.status)}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{a._count?.checklist || 0} items · {a._count?.findings || 0} {t('findingsTab').toLowerCase()}</p>
                        </button>
                    ))}
                </div>

                <div className="lg:col-span-2">
                    {selected ? (
                        <div className="glass-card p-6 animate-slideIn space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">{selected.title}</h2>
                                <div className="flex gap-2">
                                    {selected.status === 'PLANNED' && <button onClick={() => updateAuditStatus('IN_PROGRESS')} className="btn btn-sm btn-primary">{t('inProgress')}</button>}
                                    {selected.status === 'IN_PROGRESS' && <button onClick={() => updateAuditStatus('COMPLETED')} className="btn btn-sm btn-success">{t('completed')}</button>}
                                </div>
                            </div>
                            {selected.scope && <p className="text-sm text-slate-400">{selected.scope}</p>}

                            <div>
                                <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('checklist')} ({selected.checklist?.length || 0})</h3>
                                <div className="space-y-2">
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {selected.checklist?.map((item: any) => (
                                        <div key={item.id} className="flex items-start gap-3 p-3 border border-slate-700/50 rounded-lg">
                                            <select className={`input w-32 text-xs`} value={item.result} onChange={e => updateChecklist(item.id, e.target.value)}>
                                                <option value="NOT_TESTED">{t('notTested')}</option>
                                                <option value="PASS">{t('pass')}</option>
                                                <option value="FAIL">{t('fail')}</option>
                                            </select>
                                            <div className="flex-1">
                                                <p className="text-sm text-slate-300">{item.prompt}</p>
                                                {item.notes && <p className="text-xs text-slate-500 mt-1">{item.notes}</p>}
                                            </div>
                                            <span className={`badge ${RESULT_BADGE[item.result]}`}>{resultLabel(item.result)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selected.findings?.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-300 mb-2">{t('findingsTab')} ({selected.findings.length})</h3>
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {selected.findings.map((f: any) => (
                                        <div key={f.id} className="p-3 border border-slate-700/50 rounded-lg mb-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium">{f.title}</span>
                                                <span className={`badge ${f.severity === 'CRITICAL' ? 'badge-danger' : f.severity === 'HIGH' ? 'badge-warning' : 'badge-info'}`}>{f.severity}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="glass-card p-12 text-center text-slate-500">{t('selectAudit')}</div>
                    )}
                </div>
            </div>
        </div>
    );
}
