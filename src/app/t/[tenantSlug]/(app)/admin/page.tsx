'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { RequirePermission } from '@/components/require-permission';
import { Shield, CreditCard } from 'lucide-react';
import Link from 'next/link';

export default function AdminPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const t = useTranslations('admin');
    const tc = useTranslations('common');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [auditLog, setAuditLog] = useState<any[]>([]);
    const [tab, setTab] = useState<'log' | 'templates'>('log');

    useEffect(() => { fetch(apiUrl('/audit-log')).then(r => r.json()).then(setAuditLog); }, [apiUrl]);

    const templateKeys = [
        'infoSecurity', 'accessControl', 'incidentResponse', 'acceptableUse',
        'supplierSecurity', 'backup', 'changeManagement', 'cryptography', 'logging',
    ] as const;

    return (
        <div className="space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold">{t('title')}</h1>

            <div className="flex gap-2">
                <button onClick={() => setTab('log')} className={`btn ${tab === 'log' ? 'btn-primary' : 'btn-secondary'}`}>{t('auditLog')}</button>
                <button onClick={() => setTab('templates')} className={`btn ${tab === 'templates' ? 'btn-primary' : 'btn-secondary'}`}>{t('policyTemplates')}</button>
                <RequirePermission resource="admin" action="manage">
                    <Link
                        href={tenantHref('/admin/rbac')}
                        className="btn btn-secondary"
                        id="rbac-pill-btn"
                    >
                        <Shield className="w-3.5 h-3.5" />
                        Roles &amp; Access
                    </Link>
                    <Link
                        href={tenantHref('/admin/billing')}
                        className="btn btn-secondary"
                        id="billing-pill-btn"
                    >
                        <CreditCard className="w-3.5 h-3.5" />
                        Billing
                    </Link>
                </RequirePermission>
            </div>

            {tab === 'log' ? (
                <div className="glass-card overflow-hidden">
                    <table className="data-table">
                        <thead><tr><th>{t('time')}</th><th>{t('user')}</th><th>{t('action')}</th><th>{t('entity')}</th><th>{t('details')}</th></tr></thead>
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
                            {auditLog.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-8">{t('noEntries')}</td></tr>}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="glass-card p-6">
                    <p className="text-sm text-slate-400 mb-4">{t('templateDescription')}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {templateKeys.map(key => (
                            <div key={key} className="p-4 border border-slate-700 rounded-lg hover:border-brand-500 transition cursor-pointer">
                                <span className="text-sm font-medium text-white">{t(`templates.${key}`)}</span>
                                <p className="text-xs text-slate-500 mt-1">{t('clickToUse')}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
