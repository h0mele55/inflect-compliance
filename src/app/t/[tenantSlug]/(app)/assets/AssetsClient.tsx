'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { CompactFilterBar } from '@/components/filters/CompactFilterBar';
import { assetsFilterConfig } from '@/components/filters/configs';

const ASSET_TYPES = ['INFORMATION', 'APPLICATION', 'SYSTEM', 'SERVICE', 'DATA_STORE', 'INFRASTRUCTURE', 'VENDOR', 'PROCESS', 'PEOPLE_PROCESS', 'OTHER'];

interface AssetsClientProps {
    initialAssets: any[];
    initialFilters: Record<string, string>;
    tenantSlug: string;
    permissions: { canWrite: boolean };
    translations: {
        title: string;
        addAsset: string;
        createAsset: string;
        name: string;
        type: string;
        classification: string;
        classificationPlaceholder: string;
        owner: string;
        location: string;
        dataResidency: string;
        residencyPlaceholder: string;
        confidentiality: string;
        integrity: string;
        availability: string;
        cia: string;
        controlsCol: string;
        noAssets: string;
        cancel: string;
        assetsRegistered: string;
    };
}

/**
 * Client island for assets — handles create form, filter interactions, and table navigation.
 * Data is pre-fetched server-side and passed via props.
 */
export function AssetsClient({ initialAssets, initialFilters, tenantSlug, permissions, translations: t }: AssetsClientProps) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', type: 'SYSTEM', classification: '', owner: '', location: '', confidentiality: 3, integrity: 3, availability: 3, dataResidency: '', retention: '' });

    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const router = useRouter();
    const queryClient = useQueryClient();

    // URL-driven filter state
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'type', 'status']);
    const hasFilters = !!(filters.q || filters.type || filters.status);
    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = serverHadFilters
        ? JSON.stringify(filters) === JSON.stringify(initialFilters)
        : !hasFilters;

    const assetsQuery = useQuery({
        queryKey: queryKeys.assets.list(tenantSlug, filters),
        queryFn: async () => {
            const params = new URLSearchParams(filters);
            const qs = params.toString();
            const res = await fetch(apiUrl(`/assets${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch assets');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialAssets : undefined,
    });
    const assets = assetsQuery.data ?? [];

    const createMutation = useMutation({
        mutationFn: async (newAsset: any) => {
            const res = await fetch(apiUrl('/assets'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newAsset) });
            if (!res.ok) throw new Error('Failed to create asset');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(tenantSlug) });
            setShowForm(false);
            setForm({ name: '', type: 'SYSTEM', classification: '', owner: '', location: '', confidentiality: 3, integrity: 3, availability: 3, dataResidency: '', retention: '' });
        }
    });

    const createAsset = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(form);
    };

    return (
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t.title}</h1>
                    <p className="text-slate-400 text-sm">{assets.length} assets</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/coverage')} className="btn btn-secondary">Coverage</Link>
                    <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">{t.addAsset}</button>
                </div>
            </div>

            {/* Filters */}
            <CompactFilterBar config={assetsFilterConfig} filters={filters} setFilter={setFilter} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} />

            {showForm && (
                <form onSubmit={createAsset} className="glass-card p-6 space-y-4 animate-fadeIn">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div><label className="input-label">{t.name} *</label><input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                        <div><label className="input-label">{t.type}</label><select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{ASSET_TYPES.map(tp => <option key={tp} value={tp}>{tp.replace(/_/g, ' ')}</option>)}</select></div>
                        <div><label className="input-label">{t.classification}</label><input className="input" value={form.classification} onChange={e => setForm(f => ({ ...f, classification: e.target.value }))} placeholder={t.classificationPlaceholder} /></div>
                        <div><label className="input-label">{t.owner}</label><input className="input" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} /></div>
                        <div><label className="input-label">{t.location}</label><input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
                        <div><label className="input-label">{t.dataResidency}</label><input className="input" value={form.dataResidency} onChange={e => setForm(f => ({ ...f, dataResidency: e.target.value }))} placeholder={t.residencyPlaceholder} /></div>
                        <div><label className="input-label">{t.confidentiality}</label><input type="number" min="1" max="5" className="input" value={form.confidentiality} onChange={e => setForm(f => ({ ...f, confidentiality: +e.target.value }))} /></div>
                        <div><label className="input-label">{t.integrity}</label><input type="number" min="1" max="5" className="input" value={form.integrity} onChange={e => setForm(f => ({ ...f, integrity: +e.target.value }))} /></div>
                        <div><label className="input-label">{t.availability}</label><input type="number" min="1" max="5" className="input" value={form.availability} onChange={e => setForm(f => ({ ...f, availability: +e.target.value }))} /></div>
                    </div>
                    <div className="flex gap-2"><button type="submit" className="btn btn-primary">{t.createAsset}</button><button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">{t.cancel}</button></div>
                </form>
            )}

            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead><tr><th>{t.name}</th><th>{t.type}</th><th>{t.classification}</th><th>{t.owner}</th><th>{t.cia}</th><th>{t.controlsCol}</th></tr></thead>
                    <tbody>
                        {assets.map((a: any) => (
                            <tr key={a.id} className="cursor-pointer hover:bg-slate-700/30" onClick={() => router.push(tenantHref(`/assets/${a.id}`))}>
                                <td className="font-medium text-white">{a.name}</td>
                                <td><span className="badge badge-info">{a.type.replace(/_/g, ' ')}</span></td>
                                <td>{a.classification || '—'}</td>
                                <td>{a.owner || '—'}</td>
                                <td className="text-xs">{a.confidentiality}/{a.integrity}/{a.availability}</td>
                                <td className="text-xs">{a._count?.controls || 0}</td>
                            </tr>
                        ))}
                        {assets.length === 0 && (
                            <tr><td colSpan={6} className="text-center text-slate-500 py-8">
                                {hasActiveFilters ? 'No assets match your filters' : t.noAssets}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
