'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { CompactFilterBar } from '@/components/filters/CompactFilterBar';
import { vendorsFilterConfig } from '@/components/filters/configs';

const STATUS_BADGE: Record<string, string> = {
    ACTIVE: 'badge-success', ONBOARDING: 'badge-info',
    OFFBOARDING: 'badge-warning', OFFBOARDED: 'badge-neutral',
};
const CRIT_BADGE: Record<string, string> = {
    LOW: 'badge-neutral', MEDIUM: 'badge-warning', HIGH: 'badge-danger', CRITICAL: 'badge-danger',
};

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
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

    // URL-driven filter state
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'status', 'criticality', 'reviewDue']);

    const vendors = initialVendors;

    return (
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Vendor Register</h1>
                    <p className="text-slate-400 text-sm">{vendors.length} vendors</p>
                </div>
                <div className="flex gap-2">
                    <Link href={tenantHref('/vendors/dashboard')} className="btn btn-secondary" id="vendor-dashboard-btn">
                        Dashboard
                    </Link>
                    {permissions.canCreate && (
                        <Link href={tenantHref('/vendors/new')} className="btn btn-primary" id="new-vendor-btn">
                            + New Vendor
                        </Link>
                    )}
                </div>
            </div>

            {/* Filters */}
            <CompactFilterBar config={vendorsFilterConfig} filters={filters} setFilter={setFilter} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} idPrefix="vendor" />

            {/* Table */}
            <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-700 text-left text-xs uppercase text-slate-400">
                            <th className="p-3">Name</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Criticality</th>
                            <th className="p-3">Risk</th>
                            <th className="p-3">Next Review</th>
                            <th className="p-3">Contract Renewal</th>
                            <th className="p-3">Owner</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vendors.map((v: any) => (
                            <tr key={v.id} className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                                onClick={() => window.location.href = tenantHref(`/vendors/${v.id}`)}>
                                <td className="p-3 font-medium">
                                    <Link href={tenantHref(`/vendors/${v.id}`)} className="text-blue-400 hover:underline" id={`vendor-link-${v.id}`}>
                                        {v.name}
                                    </Link>
                                    {v.isSubprocessor && <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">Sub-processor</span>}
                                </td>
                                <td className="p-3"><span className={`badge ${STATUS_BADGE[v.status] || 'badge-neutral'}`}>{v.status}</span></td>
                                <td className="p-3"><span className={`badge ${CRIT_BADGE[v.criticality] || 'badge-neutral'}`}>{v.criticality}</span></td>
                                <td className="p-3">
                                    {v.inherentRisk ? <span className={`badge ${CRIT_BADGE[v.inherentRisk]}`}>{v.inherentRisk}</span> : '—'}
                                </td>
                                <td className="p-3">
                                    {fmtDate(v.nextReviewAt)}
                                    {isOverdue(v.nextReviewAt) && <span className="ml-1 text-xs text-red-400 font-semibold">Overdue</span>}
                                </td>
                                <td className="p-3">
                                    {fmtDate(v.contractRenewalAt)}
                                    {isOverdue(v.contractRenewalAt) && <span className="ml-1 text-xs text-orange-400 font-semibold">Due</span>}
                                </td>
                                <td className="p-3 text-slate-400">{v.owner?.name || '—'}</td>
                            </tr>
                        ))}
                        {vendors.length === 0 && (
                            <tr><td colSpan={7} className="text-center text-slate-500 py-8">
                                {hasActiveFilters ? 'No vendors match your filters' : 'No vendors found'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
