'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

const SEV_BADGE: Record<string, string> = { LOW: 'badge-info', MEDIUM: 'badge-warning', HIGH: 'badge-danger', CRITICAL: 'badge-danger' };
const STATUS_BADGE: Record<string, string> = { OPEN: 'badge-danger', IN_PROGRESS: 'badge-info', READY_FOR_VERIFICATION: 'badge-warning', CLOSED: 'badge-success' };

export default function FindingsPage() {
    const apiUrl = useTenantApiUrl();
    const t = useTranslations('findings');
    const tc = useTranslations('common');
    const [findings, setFindings] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', severity: 'MEDIUM', type: 'OBSERVATION', owner: '', dueDate: '' });

    useEffect(() => { fetch(apiUrl('/findings')).then(r => r.json()).then(setFindings); }, [apiUrl]);

    const createFinding = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch(apiUrl('/findings'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        if (res.ok) { const f = await res.json(); setFindings(prev => [f, ...prev]); setShowForm(false); }
    };

    const updateStatus = async (id: string, status: string) => {
        await fetch(apiUrl(`/findings/${id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        setFindings(prev => prev.map(f => f.id === id ? { ...f, status } : f));
    };

    const sevLabel = (sev: string) => {
        const map: Record<string, string> = { LOW: t('low'), MEDIUM: t('medium'), HIGH: t('high'), CRITICAL: t('critical') };
        return map[sev] || sev;
    };

    const typeLabel = (type: string) => {
        const map: Record<string, string> = { NONCONFORMITY: t('nonconformity'), OBSERVATION: t('observation'), OPPORTUNITY: t('opportunity') };
        return map[type] || type;
    };

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { OPEN: t('open'), IN_PROGRESS: t('inProgress'), READY_FOR_VERIFICATION: t('readyForVerification'), CLOSED: t('closed') };
        return map[status] || status;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">{t('title')}</h1><p className="text-slate-400 text-sm">{findings.filter(f => f.status !== 'CLOSED').length} {t('open').toLowerCase()}</p></div>
                <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">{t('newFinding')}</button>
            </div>

            {showForm && (
                <form onSubmit={createFinding} className="glass-card p-6 space-y-4 animate-fadeIn">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="input-label">{t('findingTitle')} *</label><input className="input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                        <div><label className="input-label">{t('severity')}</label><select className="input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}><option value="LOW">{t('low')}</option><option value="MEDIUM">{t('medium')}</option><option value="HIGH">{t('high')}</option><option value="CRITICAL">{t('critical')}</option></select></div>
                        <div><label className="input-label">{t('type')}</label><select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}><option value="NONCONFORMITY">{t('nonconformity')}</option><option value="OBSERVATION">{t('observation')}</option><option value="OPPORTUNITY">{t('opportunity')}</option></select></div>
                        <div><label className="input-label">{t('owner')}</label><input className="input" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} /></div>
                        <div className="col-span-2"><label className="input-label">{t('description')} *</label><textarea className="input" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                        <div><label className="input-label">{t('dueDate')}</label><input type="date" className="input" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                    </div>
                    <div className="flex gap-2"><button type="submit" className="btn btn-primary">{t('createFinding')}</button><button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">{tc('cancel')}</button></div>
                </form>
            )}

            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead><tr><th>{t('findingTitle')}</th><th>{t('severity')}</th><th>{t('type')}</th><th>{t('owner')}</th><th>{t('status')}</th><th>{tc('actions')}</th></tr></thead>
                    <tbody>
                        {findings.map(f => (
                            <tr key={f.id}>
                                <td className="font-medium text-white text-sm">{f.title}</td>
                                <td><span className={`badge ${SEV_BADGE[f.severity]}`}>{sevLabel(f.severity)}</span></td>
                                <td className="text-xs">{typeLabel(f.type)}</td>
                                <td className="text-xs">{f.owner || '—'}</td>
                                <td><span className={`badge ${STATUS_BADGE[f.status]}`}>{statusLabel(f.status)}</span></td>
                                <td className="flex gap-1">
                                    {f.status === 'OPEN' && <button onClick={() => updateStatus(f.id, 'IN_PROGRESS')} className="btn btn-sm btn-secondary">{t('inProgress')}</button>}
                                    {f.status === 'IN_PROGRESS' && <button onClick={() => updateStatus(f.id, 'READY_FOR_VERIFICATION')} className="btn btn-sm btn-secondary">{t('readyForVerification')}</button>}
                                    {f.status === 'READY_FOR_VERIFICATION' && <button onClick={() => updateStatus(f.id, 'CLOSED')} className="btn btn-sm btn-success">{t('closed')}</button>}
                                </td>
                            </tr>
                        ))}
                        {findings.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-8">{t('noFindings')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
