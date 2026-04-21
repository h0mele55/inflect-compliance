'use client';
import { formatDate } from '@/lib/format-date';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { DataTable, createColumns } from '@/components/ui/table';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import { buildPolicyFilters, POLICY_FILTER_KEYS } from './filter-defs';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';

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
export function PoliciesClient(props: PoliciesClientProps) {
    const filterCtx = useFilterContext([], POLICY_FILTER_KEYS, {
        serverFilters: props.initialFilters,
    });
    return (
        <FilterProvider value={filterCtx}>
            <PoliciesPageInner {...props} />
        </FilterProvider>
    );
}

function PoliciesPageInner({
    initialPolicies,
    initialFilters,
    tenantSlug,
    permissions,
    translations: t,
}: PoliciesClientProps) {
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const router = useRouter();
    // Null on SSR + first client render so the "Overdue" badge doesn't
    // flip between server- and client-side `new Date()` values.
    const hydratedNow = useHydratedNow();

    const { state, search, hasActive } = useFilters();
    const fetchParams = useMemo(
        () => toApiSearchParams(state, { search }),
        [state, search],
    );
    const queryKeyFilters = useMemo(() => {
        const obj: Record<string, string> = {};
        for (const [k, v] of fetchParams) obj[k] = v;
        return obj;
    }, [fetchParams]);

    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = useMemo(() => {
        if (!serverHadFilters) return !hasActive;
        const keys = new Set([...Object.keys(queryKeyFilters), ...Object.keys(initialFilters!)]);
        for (const k of keys) {
            if ((queryKeyFilters[k] ?? '') !== (initialFilters![k] ?? '')) return false;
        }
        return true;
    }, [queryKeyFilters, initialFilters, serverHadFilters, hasActive]);

    const policiesQuery = useQuery<any[]>({
        queryKey: queryKeys.policies.list(tenantSlug, queryKeyFilters),
        queryFn: async () => {
            const qs = fetchParams.toString();
            const res = await fetch(apiUrl(`/policies${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch policies');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialPolicies : undefined,
        initialDataUpdatedAt: 0,
    });

    const policies = policiesQuery.data ?? [];
    const loading = policiesQuery.isLoading && !policiesQuery.data;

    const liveFilters = useMemo(() => buildPolicyFilters(policies), [policies]);

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
                    <Link href={tenantHref(`/policies/${row.original.id}`)} className="font-medium text-content-emphasis hover:text-[var(--brand-default)] transition" onClick={(e) => e.stopPropagation()}>
                        {row.original.title}
                    </Link>
                    {row.original.description && (
                        <p className="text-xs text-content-subtle mt-0.5 truncate max-w-xs">{row.original.description}</p>
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
            cell: ({ getValue }: any) => <span className="text-xs text-content-muted">{getValue()}</span>,
        },
        {
            id: 'owner',
            header: 'Owner',
            accessorFn: (p: any) => p.owner?.name || '—',
            cell: ({ getValue }: any) => <span className="text-xs text-content-muted">{getValue()}</span>,
        },
        {
            id: 'nextReviewAt',
            header: 'Next Review',
            cell: ({ row }: any) => {
                const p = row.original;
                if (!p.nextReviewAt) return <span className="text-xs text-content-muted">—</span>;
                return (
                    <span className="flex items-center gap-1 text-xs text-content-muted">
                        {formatDate(p.nextReviewAt)}
                        {hydratedNow && new Date(p.nextReviewAt) < hydratedNow && p.status !== 'ARCHIVED' && (
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
            cell: ({ getValue }: any) => <span className="text-xs text-content-subtle">{formatDate(getValue())}</span>,
        },
    ]), [tenantHref, hydratedNow]);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t.title}</h1>
                    <p className="text-content-muted text-sm">{policies.length} policies</p>
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
            <FilterToolbar
                filters={liveFilters}
                searchId="policy-search"
                searchPlaceholder="Search policies… (Enter)"
            />

            {/* Table */}
            <DataTable
                data={policies}
                columns={policyColumns}
                loading={loading}
                getRowId={(p: any) => p.id}
                onRowClick={(row) => router.push(tenantHref(`/policies/${row.original.id}`))}
                emptyState={hasActive ? 'No policies match your filters' : 'No policies found. Create your first policy to get started.'}
                resourceName={(p) => p ? 'policies' : 'policy'}
                data-testid="policies-table"
            />
        </div>
    );
}
