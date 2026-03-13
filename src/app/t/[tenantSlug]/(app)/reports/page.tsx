'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

export default function ReportsPage() {
    const apiUrl = useTenantApiUrl();
    const t = useTranslations('reports');
    const tc = useTranslations('common');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [tab, setTab] = useState<'soa' | 'risk'>('soa');

    useEffect(() => { fetch(apiUrl('/reports')).then(r => r.json()).then(setData); }, [apiUrl]);

    if (!data) return <div className="animate-pulse text-slate-400 p-8">{t('loading')}</div>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadCSV = (rows: any[], filename: string) => {
        if (!rows.length) return;
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold" id="reports-heading">{t('title')}</h1><p className="text-slate-400 text-sm">{t('subtitle')}</p></div>
                <div className="flex gap-2">
                    <button onClick={() => downloadCSV(data.soa, 'soa-report.csv')} className="btn btn-secondary" id="export-soa-btn">{t('exportSoa')}</button>
                    <button onClick={() => downloadCSV(data.riskRegister, 'risk-register.csv')} className="btn btn-secondary" id="export-risks-btn">{t('exportRisks')}</button>
                </div>
            </div>

            <div className="flex gap-2">
                <button onClick={() => setTab('soa')} className={`btn ${tab === 'soa' ? 'btn-primary' : 'btn-secondary'}`} id="soa-tab-btn">{t('soa')}</button>
                <button onClick={() => setTab('risk')} className={`btn ${tab === 'risk' ? 'btn-primary' : 'btn-secondary'}`} id="risk-tab-btn">{t('riskRegister')}</button>
            </div>

            {tab === 'soa' ? (
                <div className="glass-card overflow-auto">
                    <table className="data-table" id="soa-table">
                        <thead><tr><th>{t('control')}</th><th>{t('name')}</th><th>{t('applicable')}</th><th>{t('status')}</th><th>{t('evidence')}</th><th>{t('overdue')}</th></tr></thead>
                        <tbody>
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {data.soa.map((c: any) => (
                                <tr key={c.controlId}>
                                    <td className="text-xs font-mono text-brand-400">{c.controlId}</td>
                                    <td className="text-sm">{c.name}</td>
                                    <td>{c.applicable ? <span className="badge badge-success">{tc('yes')}</span> : <span className="badge badge-neutral">{tc('no')}</span>}</td>
                                    <td><span className={`badge ${c.status === 'IMPLEMENTED' ? 'badge-success' : c.status === 'IMPLEMENTING' ? 'badge-info' : 'badge-neutral'}`}>{c.status}</span></td>
                                    <td className="text-xs">{c.approvedEvidence}/{c.evidenceCount}</td>
                                    <td>{c.hasOverdue ? <span className="badge badge-danger">⚠️</span> : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="glass-card overflow-auto">
                    <table className="data-table" id="risk-table">
                        <thead><tr><th>{t('risk')}</th><th>{t('asset')}</th><th>{t('threat')}</th><th>L×I</th><th>{t('score')}</th><th>{t('treatment')}</th><th>{t('owner')}</th><th>{t('controls')}</th></tr></thead>
                        <tbody>
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {data.riskRegister.map((r: any) => (
                                <tr key={r.id}>
                                    <td className="font-medium text-sm text-white">{r.title}</td>
                                    <td className="text-xs">{r.asset}</td>
                                    <td className="text-xs text-slate-400">{r.threat}</td>
                                    <td className="text-xs">{r.likelihood}×{r.impact}</td>
                                    <td className="font-bold">{r.score}</td>
                                    <td className="text-xs">{r.treatment}</td>
                                    <td className="text-xs">{r.owner}</td>
                                    <td className="text-xs text-slate-400">{r.controls || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
