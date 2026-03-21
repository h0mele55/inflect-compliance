'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MappingPage() {
    const apiUrl = useTenantApiUrl();
    const t = useTranslations('mapping');
    const [data, setData] = useState<any>(null);
    const [tab, setTab] = useState<'soc2' | 'nis2'>('soc2');

    useEffect(() => { fetch(apiUrl('/mapping')).then(r => r.json()).then(setData); }, [apiUrl]);

    if (!data) return <div className="animate-pulse text-slate-400 p-8">{t('loading')}</div>;

    const items = tab === 'soc2' ? data.soc2 : data.nis2;

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h1 className="text-2xl font-bold">{t('title')}</h1>
                <p className="text-slate-400 text-sm">{t('subtitle')}</p>
            </div>

            <div className="flex gap-2">
                <button onClick={() => setTab('soc2')} className={`btn ${tab === 'soc2' ? 'btn-primary' : 'btn-secondary'}`}>{t('soc2')}</button>
                <button onClick={() => setTab('nis2')} className={`btn ${tab === 'nis2' ? 'btn-primary' : 'btn-secondary'}`}>{t('nis2')}</button>
            </div>

            <div className="space-y-3">
                {items.map((item: any) => (
                    <div key={item.code} className="glass-card p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <span className="text-xs font-mono text-brand-400 mr-2">{item.code}</span>
                                <span className="font-medium text-sm">{item.name}</span>
                            </div>
                            <span className="text-sm font-bold" style={{ color: item.coverage >= 80 ? '#22c55e' : item.coverage >= 50 ? '#f59e0b' : '#ef4444' }}>
                                {item.coverage}%
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-3">{item.description}</p>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-brand-500 to-emerald-500 rounded-full transition-all" style={{ width: `${item.coverage}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{t('controls', { implemented: item.implementedCount, total: item.controlCount })}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
