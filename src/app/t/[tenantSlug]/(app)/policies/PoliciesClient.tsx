'use client';
import { formatDate } from '@/lib/format-date';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { CompactFilterBar } from '@/components/filters/CompactFilterBar';
import { policiesFilterConfig } from '@/components/filters/configs';
import { DataTable, createColumns } from '@/components/ui/table';

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
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const router = useRouter();

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

    const policyColumns = useMemo(() => createColumns<any>([
        {
            accessorKey: 'title',
            header: 'Title',
            cell: ({ row }: any) => (
                <div>
                    <Link href={tenantHref(`/policies/${row.original.id}`)} className="font-medium text-white hover:text-brand-400 transition" onClick={(e) => e.stopPropagation()}>
                        {row.original.title}
                    </Link>
                    {row.original.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{row.original.description}</p>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }: any) => (
                <span className={`badge ${STATUS_BADGE[row.original.status] || 'badge-neutral'}`}>{statusLabel(row.original.status)}</span>
            ),
        },
        {
            id: 'category',
            header: 'Category',
            accessorFn: (p: any) => p.category || '—',
            cell: ({ getValue }: any) => <span className="text-xs text-slate-400">{getValue()}</span>,
        },
        {
            id: 'owner',
            header: 'Owner',
            accessorFn: (p: any) => p.owner?.name || '—',
            cell: ({ getValue }: any) => <span className="text-xs text-slate-400">{getValue()}</span>,
        },
        {
            id: 'nextReviewAt',
            header: 'Next Review',
            cell: ({ row }: any) => {
                const p = row.original;
                if (!p.nextReviewAt) return <span className="text-xs text-slate-400">—</span>;
                return (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                        {formatDate(p.nextReviewAt)}
                        {new Date(p.nextReviewAt) < new Date() && p.status !== 'ARCHIVED' && (
                            <span className="badge badge-danger text-xs">Overdue</span>
                        )}
                    </span>
                );
            },
        },
        {
            id: 'updatedAt',
            header: 'Updated',
            accessorFn: (p: any) => p.updatedAt,
            cell: ({ getValue }: any) => <span className="text-xs text-slate-500">{formatDate(getValue())}</span>,
        },
    ]), [tenantHref]);

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
            <DataTable
                data={policies}
                columns={policyColumns}
                loading={loading}
                getRowId={(p: any) => p.id}
                onRowClick={(row) => router.push(tenantHref(`/policies/${row.original.id}`))}
                emptyState={hasActiveFilters ? 'No policies match your filters' : 'No policies found. Create your first policy to get started.'}
                resourceName={(p) => p ? 'policies' : 'policy'}
                data-testid="policies-table"
            />
        </div>
    );
}
