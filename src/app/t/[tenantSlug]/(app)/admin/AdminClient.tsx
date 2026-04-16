'use client';
import { useState } from 'react';
import Link from 'next/link';

interface AdminClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auditLog: any[];
    tenantSlug: string;
    translations: {
        title: string;
        auditLog: string;
        policyTemplates: string;
        time: string;
        user: string;
        action: string;
        entity: string;
        details: string;
        noEntries: string;
        templateDescription: string;
        clickToUse: string;
        templateLabels: Record<string, string>;
    };
}

/**
 * Client island for admin page — handles tab state switching.
 * Audit log data and navigation links are pre-rendered server-side.
 */
export function AdminClient({ auditLog, tenantSlug, translations: t }: AdminClientProps) {
    const [tab, setTab] = useState<'log' | 'templates'>('log');
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    const templateKeys = [
        'infoSecurity', 'accessControl', 'incidentResponse', 'acceptableUse',
        'supplierSecurity', 'backup', 'changeManagement', 'cryptography', 'logging',
    ] as const;

    return (
        <>
            <div className="flex gap-2">
                <button onClick={() => setTab('log')} className={`btn ${tab === 'log' ? 'btn-primary' : 'btn-secondary'}`}>{t.auditLog}</button>
                <button onClick={() => setTab('templates')} className={`btn ${tab === 'templates' ? 'btn-primary' : 'btn-secondary'}`}>{t.policyTemplates}</button>
            </div>

            {tab === 'log' ? (
                <div className="glass-card overflow-hidden">
                    <table className="data-table">
                        <thead><tr><th>{t.time}</th><th>{t.user}</th><th>{t.action}</th><th>{t.entity}</th><th>{t.details}</th></tr></thead>
                        <tbody>
                            {auditLog.map(e => (
                                <tr key={e.id}>
                                    <td className="text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                                    <td className="text-xs">{e.user?.name || '—'}</td>
                                    <td><span className="badge badge-info">{e.action}</span></td>
                                    <td className="text-xs">{e.entity}</td>
                                    <td className="text-xs text-slate-400 max-w-xs truncate">{e.details}</td>
                                </tr>
                            ))}
                            {auditLog.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-8">{t.noEntries}</td></tr>}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="glass-card p-6">
                    <p className="text-sm text-slate-400 mb-4">{t.templateDescription}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {templateKeys.map(key => (
                            <div key={key} className="p-4 border border-slate-700 rounded-lg hover:border-brand-500 transition cursor-pointer">
                                <span className="text-sm font-medium text-white">{t.templateLabels[key]}</span>
                                <p className="text-xs text-slate-500 mt-1">{t.clickToUse}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
