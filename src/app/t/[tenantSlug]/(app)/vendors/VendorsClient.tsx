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
import { vendorsFilterConfig } from '@/components/filters/configs';
import { StatusBadge } from '@/components/ui/status-badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@dub/utils';
import { DataTable, createColumns } from '@/components/ui/table';

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
    ACTIVE: 'success', ONBOARDING: 'info',
    OFFBOARDING: 'warning', OFFBOARDED: 'neutral',
};
const CRIT_VARIANT: Record<string, 'neutral' | 'warning' | 'error'> = {
    LOW: 'neutral', MEDIUM: 'warning', HIGH: 'error', CRITICAL: 'error',
};

function fmtDate(d: string | null) {
    if (!d) return '—';
    return formatDate(d);
}

function isOverdue(d: string | null) {
    if (!d) return false;
    return new Date(d) < new Date();
}

interface VendorsClientProps {
    initialVendors: any[];
    initialFilters: Record<string, string>;
    tenantSlug: string;
    permissions: {
        canCreate: boolean;
    };
}

/**
 * Client island for vendors — handles filter interactions and table navigation.
 * Data is pre-fetched server-side and passed via props.
 */
export function VendorsClient({ initialVendors, initialFilters, tenantSlug, permissions }: VendorsClientProps) {
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const router = useRouter();

    // URL-driven filter state
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'status', 'criticality', 'reviewDue']);

    const hasFilters = !!(filters.q || filters.status || filters.criticality || filters.reviewDue);
    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = serverHadFilters
        ? JSON.stringify(filters) === JSON.stringify(initialFilters)
        : !hasFilters;

    const vendorsQuery = useQuery({
        queryKey: queryKeys.vendors.list(tenantSlug, filters),
        queryFn: async () => {
            const params = new URLSearchParams(filters);
            const qs = params.toString();
            const res = await fetch(apiUrl(`/vendors${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch vendors');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialVendors : undefined,
    });

    const vendors = vendorsQuery.data ?? [];

    const vendorColumns = useMemo(() => createColumns<any>([
        {
            accessorKey: 'name',
            header: 'Name',
            cell: ({ row }: any) => (
                <div className="font-medium">
                    <Link href={tenantHref(`/vendors/${row.original.id}`)} className="text-brand-400 hover:underline" id={`vendor-link-${row.original.id}`} onClick={(e) => e.stopPropagation()}>
                        {row.original.name}
                    </Link>
                    {row.original.isSubprocessor && <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">Sub-processor</span>}
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }: any) => (
                <StatusBadge variant={STATUS_VARIANT[row.original.status] || 'neutral'} icon={null}>{row.original.status}</StatusBadge>
            ),
        },
        {
            accessorKey: 'criticality',
            header: 'Criticality',
            cell: ({ row }: any) => (
                <StatusBadge variant={CRIT_VARIANT[row.original.criticality] || 'neutral'} icon={null}>{row.original.criticality}</StatusBadge>
            ),
        },
        {
            id: 'risk',
            header: 'Risk',
            accessorFn: (v: any) => v.inherentRisk || '',
            cell: ({ row }: any) => {
                const v = row.original;
                return v.inherentRisk
                    ? <StatusBadge variant={CRIT_VARIANT[v.inherentRisk] || 'neutral'} icon={null}>{v.inherentRisk}</StatusBadge>
                    : <span>—</span>;
            },
        },
        {
            id: 'nextReviewAt',
            header: 'Next Review',
            cell: ({ row }: any) => (
                <span>
                    {fmtDate(row.original.nextReviewAt)}
                    {isOverdue(row.original.nextReviewAt) && <span className="ml-1 text-xs text-content-error font-semibold">Overdue</span>}
                </span>
            ),
        },
        {
            id: 'contractRenewalAt',
            header: 'Contract Renewal',
            cell: ({ row }: any) => (
                <span>
                    {fmtDate(row.original.contractRenewalAt)}
                    {isOverdue(row.original.contractRenewalAt) && <span className="ml-1 text-xs text-content-warning font-semibold">Due</span>}
                </span>
            ),
        },
        {
            id: 'owner',
            header: 'Owner',
            accessorFn: (v: any) => v.owner?.name || '—',
            cell: ({ getValue }: any) => <span className="text-content-muted">{getValue()}</span>,
        },
    ]), [tenantHref]);

    return (
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-content-emphasis">Vendor Register</h1>
                    <p className="text-content-muted text-sm">{vendors.length} vendors</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/vendors/dashboard')} className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))} id="vendor-dashboard-btn">
                        Dashboard
                    </Link>
                    {permissions.canCreate && (
                        <Link href={tenantHref('/vendors/new')} className={cn(buttonVariants({ variant: 'primary', size: 'md' }))} id="new-vendor-btn">
                            + New Vendor
                        </Link>
                    )}
                </div>
            </div>

            {/* Filters */}
            <CompactFilterBar config={vendorsFilterConfig} filters={filters} setFilter={setFilter} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} idPrefix="vendor" />

            {/* Table */}
            <DataTable
                data={vendors}
                columns={vendorColumns}
                getRowId={(v: any) => v.id}
                onRowClick={(row) => router.push(tenantHref(`/vendors/${row.original.id}`))}
                emptyState={hasActiveFilters ? 'No vendors match your filters' : 'No vendors found. Add your first vendor to get started.'}
                resourceName={(p) => p ? 'vendors' : 'vendor'}
                data-testid="vendors-table"
            />
        </>
    );
}
