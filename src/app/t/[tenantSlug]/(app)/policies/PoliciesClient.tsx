'use client';
import { formatDate } from '@/lib/format-date';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { SkeletonTableRow } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { CompactFilterBar } from '@/components/filters/CompactFilterBar';
import { policiesFilterConfig } from '@/components/filters/configs';

const STATUS_BADGE: Record<string, string> = {
    DRAFT: 'badge-neutral',
    PUBLISHED: 'badge-success',
    ARCHIVED: 'badge-warning',
};

interface PoliciesClientProps {
    initialPolicies: any[];
    initialFilters?: Record<string, string>;
    tenantSlug: string;
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };
    translations: {
        title: string;
    };
}

/**
 * Client island for policies — handles filters, search, and interactive list.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 */
export function PoliciesClient({
    initialPolicies,
    initialFilters,
    tenantSlug,
    permissions,
    translations: t,
}: PoliciesClientProps) {
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    // URL-driven filter state
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'status', 'category'], initialFilters);

    // React Query with server-hydrated initial data
    const hasFilters = !!(filters.q || filters.status || filters.category);
    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = serverHadFilters
        ? JSON.stringify(filters) === JSON.stringify(initialFilters)
        : !hasFilters;
    const policiesQuery = useQuery<any[]>({
        queryKey: queryKeys.policies.list(tenantSlug, filters),
        queryFn: async () => {
            const params = new URLSearchParams(filters);
            const qs = params.toString();
            const res = await fetch(apiUrl(`/policies${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch policies');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialPolicies : undefined,
        initialDataUpdatedAt: 0,
    });

    const policies = policiesQuery.data ?? [];
    const loading = policiesQuery.isLoading && !policiesQuery.data;

    const statusLabel = (s: string) => {
        const map: Record<string, string> = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' };
        return map[s] || s;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t.title}</h1>
                    <p className="text-slate-400 text-sm">{policies.length} policies</p>
                </div>
                {permissions.canWrite && (
                    <div className="flex gap-2">
                        <Link href={tenantHref('/policies/templates')} className="btn btn-secondary" id="policy-from-template-btn">
                            From Template
                        </Link>
                        <Link href={tenantHref('/policies/new')} className="btn btn-primary" id="new-policy-btn">
                            + New Policy
                        </Link>
                    </div>
                )}
            </div>

            {/* Filters */}
            <CompactFilterBar config={policiesFilterConfig} filters={filters} setFilter={setFilter} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} idPrefix="policy" />

            {/* Table */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <table className="data-table">
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
                            {Array.from({ length: 8 }).map((_, i) => (
                                <SkeletonTableRow key={i} cols={6} />
                            ))}
                        </tbody>
                    </table>
                ) : policies.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <p className="text-lg mb-2">{hasActiveFilters ? 'No policies match your filters' : 'No policies found'}</p>
                        <p className="text-sm">{hasActiveFilters ? 'Try adjusting your search or filters.' : 'Create your first policy to get started.'}</p>
                        {hasActiveFilters && (
                            <button type="button" className="btn btn-sm btn-secondary mt-3" onClick={clearFilters}>Clear filters</button>
                        )}
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
                            {policies.map((p: any) => (
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
                                                {formatDate(p.nextReviewAt)}
                                                {new Date(p.nextReviewAt) < new Date() && p.status !== 'ARCHIVED' && (
                                                    <span className="badge badge-danger text-xs">Overdue</span>
                                                )}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className="text-xs text-slate-500">
                                        {formatDate(p.updatedAt)}
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
