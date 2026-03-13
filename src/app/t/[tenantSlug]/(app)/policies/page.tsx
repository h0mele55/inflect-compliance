'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';

const STATUS_BADGE: Record<string, string> = {
    DRAFT: 'badge-neutral',
    PUBLISHED: 'badge-success',
    ARCHIVED: 'badge-warning',
};

const STATUS_OPTIONS = ['', 'DRAFT', 'PUBLISHED', 'ARCHIVED'];
const CATEGORY_OPTIONS = ['', 'Information Security', 'Access Control', 'HR', 'Physical', 'Compliance', 'Operations', 'Risk Management', 'Business Continuity', 'Supplier', 'Other'];

export default function PoliciesPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const t = useTranslations('policies');

    const [policies, setPolicies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchPolicies = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (categoryFilter) params.set('category', categoryFilter);
        if (searchQuery) params.set('q', searchQuery);
        const qs = params.toString();
        const res = await fetch(apiUrl(`/policies${qs ? `?${qs}` : ''}`));
        if (res.ok) setPolicies(await res.json());
        setLoading(false);
    }, [apiUrl, statusFilter, categoryFilter, searchQuery]);

    useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

    const statusLabel = (s: string) => {
        const map: Record<string, string> = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' };
        return map[s] || s;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-slate-400 text-sm">{policies.length} policies</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/policies/templates')} className="btn btn-secondary" id="policy-from-template-btn">
                        📋 From Template
                    </Link>
                    <Link href={tenantHref('/policies/new')} className="btn btn-primary" id="new-policy-btn">
                        + New Policy
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="text"
                            className="input w-full"
                            placeholder="Search policies..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            id="policy-search"
                        />
                    </div>
                    <select
                        className="input w-40"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        id="policy-status-filter"
                    >
                        <option value="">All Status</option>
                        {STATUS_OPTIONS.filter(Boolean).map(s => (
                            <option key={s} value={s}>{statusLabel(s)}</option>
                        ))}
                    </select>
                    <select
                        className="input w-48"
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        id="policy-category-filter"
                    >
                        <option value="">All Categories</option>
                        {CATEGORY_OPTIONS.filter(Boolean).map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500 animate-pulse">Loading...</div>
                ) : policies.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <p className="text-lg mb-2">No policies found</p>
                        <p className="text-sm">Create your first policy to get started.</p>
                    </div>
                ) : (
                    <table className="data-table" id="policies-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Status</th>
                                <th>Category</th>
                                <th>Owner</th>
                                <th>Next Review</th>
                                <th>Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {policies.map(p => (
                                <tr key={p.id} className="cursor-pointer hover:bg-slate-700/30 transition">
                                    <td>
                                        <Link href={tenantHref(`/policies/${p.id}`)} className="font-medium text-white hover:text-brand-400 transition">
                                            {p.title}
                                        </Link>
                                        {p.description && (
                                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{p.description}</p>
                                        )}
                                    </td>
                                    <td><span className={`badge ${STATUS_BADGE[p.status] || 'badge-neutral'}`}>{statusLabel(p.status)}</span></td>
                                    <td className="text-xs text-slate-400">{p.category || '—'}</td>
                                    <td className="text-xs text-slate-400">{p.owner?.name || '—'}</td>
                                    <td className="text-xs text-slate-400">
                                        {p.nextReviewAt ? (
                                            <span className="flex items-center gap-1">
                                                {new Date(p.nextReviewAt).toLocaleDateString()}
                                                {new Date(p.nextReviewAt) < new Date() && p.status !== 'ARCHIVED' && (
                                                    <span className="badge badge-danger text-xs">⚠️ Overdue</span>
                                                )}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className="text-xs text-slate-500">
                                        {new Date(p.updatedAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
