'use client';
/* eslint-disable react-hooks/exhaustive-deps -- Various useEffect/useMemo dep arrays in this file deliberately omit identity-unstable callbacks (handlers recreated each render) or use selector functions whose change-detection happens elsewhere. Adding the deps would either trigger unnecessary re-runs OR cause infinite render loops; the proper structural fix is to wrap parent-level callbacks in useCallback. Tracked as follow-up. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Server payload is loosely typed at the page boundary; per-cell TanStack column callbacks need a per-row narrowing pass to remove the `any`s, tracked as follow-up. */
import { TimestampTooltip } from '@/components/ui/timestamp-tooltip';
import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import {
    ColumnsDropdown,
    createColumns,
    getDefaultVisibility,
} from '@/components/ui/table';
import { useColumnVisibility } from '@/components/ui/hooks';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
} from '@/components/ui/filter';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import {
    buildPolicyFilters,
    POLICY_FILTER_KEYS,
    POLICY_STATUS_LABELS,
} from './filter-defs';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';

// Status badge classes — keyed off the canonical PolicyStatus enum
// values. POLICY_STATUS_LABELS in `filter-defs.ts` is the single
// source of truth for the human label; this map covers the visual
// treatment per state.
const STATUS_BADGE: Record<string, string> = {
    DRAFT: 'badge-neutral',
    IN_REVIEW: 'badge-info',
    APPROVED: 'badge-success',
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
 * Client island for policies — handles filters, search, and the
 * interactive list. Data arrives pre-fetched from the server
 * component, hydrated into React Query.
 *
 * Epic 45.1 — page sits on the unified `<EntityListPage>` shell
 * (Epic 91) so the layout chrome (header, filters, body, modals
 * passthrough) stays consistent with controls + risks.
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

    const serverHadFilters =
        initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = useMemo(() => {
        if (!serverHadFilters) return !hasActive;
        const keys = new Set([
            ...Object.keys(queryKeyFilters),
            ...Object.keys(initialFilters!),
        ]);
        for (const k of keys) {
            if ((queryKeyFilters[k] ?? '') !== (initialFilters![k] ?? '')) {
                return false;
            }
        }
        return true;
    }, [queryKeyFilters, initialFilters, serverHadFilters, hasActive]);

    // Epic 69 — read source is `useTenantSWR` against a filter-aware
    // cache key. Each filter combination becomes its own cache entry
    // (the qs-suffix on the path keeps them isolated). Server-rendered
    // `initialPolicies` lands as `fallbackData` only when the active
    // filters match the server view — otherwise the hook fires a
    // fresh request immediately, mirroring the prior React Query
    // "skip initialData when filters diverge" semantics.
    const policiesKey = useMemo(() => {
        const qs = fetchParams.toString();
        return qs
            ? `${CACHE_KEYS.policies.list()}?${qs}`
            : CACHE_KEYS.policies.list();
    }, [fetchParams]);

    const policiesQuery = useTenantSWR<any[]>(policiesKey, {
        fallbackData: filtersMatchInitial ? initialPolicies : undefined,
    });

    const policies = policiesQuery.data ?? [];
    const loading = policiesQuery.isLoading && !policiesQuery.data;

    const liveFilters = useMemo(
        () => buildPolicyFilters(policies),
        [policies],
    );

    // ─── Column visibility (Epic 52) ───
    const policyColumnConfig = useMemo(
        () => ({
            all: ['title', 'status', 'category', 'owner', 'version', 'nextReviewAt', 'updatedAt'],
            defaultVisible: ['title', 'status', 'category', 'owner', 'version', 'nextReviewAt', 'updatedAt'],
        }),
        [],
    );
    const { columnVisibility, setColumnVisibility } = useColumnVisibility(
        'inflect:col-vis:policies',
        policyColumnConfig,
    );
    const defaultPolicyVisibility = useMemo(
        () => getDefaultVisibility(policyColumnConfig),
        [policyColumnConfig],
    );
    const policyColumnDropdown = useMemo(
        () => [
            { id: 'title', label: 'Title' },
            { id: 'status', label: 'Status' },
            { id: 'category', label: 'Category' },
            { id: 'owner', label: 'Owner' },
            { id: 'version', label: 'Version' },
            { id: 'nextReviewAt', label: 'Next Review' },
            { id: 'updatedAt', label: 'Updated' },
        ],
        [],
    );

    const policyColumns = useMemo(() => createColumns<any>([
        {
            accessorKey: 'title',
            header: 'Title',
            cell: ({ row }: any) => (
                <div className="min-w-0">
                    <Link
                        href={tenantHref(`/policies/${row.original.id}`)}
                        className="font-medium text-content-emphasis hover:text-[var(--brand-default)] transition"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {row.original.title}
                    </Link>
                    {row.original.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-content-subtle">
                            {row.original.description}
                        </p>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            // Pulls labels from the canonical POLICY_STATUS_LABELS so
            // the badge copy and the filter copy cannot drift.
            cell: ({ row }: any) => {
                const status = row.original.status as string;
                const cls = STATUS_BADGE[status] ?? 'badge-neutral';
                const label =
                    (POLICY_STATUS_LABELS as Record<string, string>)[status] ??
                    status;
                return (
                    <span
                        className={`badge ${cls}`}
                        data-testid={`policy-status-${row.original.id}`}
                    >
                        {label}
                    </span>
                );
            },
        },
        {
            id: 'category',
            header: 'Category',
            accessorFn: (p: any) => p.category || '—',
            cell: ({ getValue }: any) => (
                <span className="text-xs text-content-muted">{getValue()}</span>
            ),
        },
        {
            id: 'owner',
            header: 'Owner',
            // Avatar chip — same pattern landed for controls in the
            // recent UX-polish PR. Falls back to em-dash when no
            // ownerUser is set on the policy.
            accessorFn: (p: any) =>
                p.owner?.name || p.owner?.email || '—',
            cell: ({ row }: any) => {
                const p = row.original;
                if (!p.owner) {
                    return (
                        <span className="text-xs text-content-subtle">—</span>
                    );
                }
                const display = p.owner.name ?? p.owner.email ?? '?';
                const initial = display.charAt(0).toUpperCase();
                return (
                    <span
                        className="inline-flex items-center gap-1.5"
                        data-testid={`policy-owner-${p.id}`}
                    >
                        <span
                            aria-hidden
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-[10px] font-medium text-content-emphasis"
                        >
                            {initial}
                        </span>
                        <span className="min-w-0 leading-tight">
                            <span className="block truncate text-xs text-content-emphasis">
                                {p.owner.name ?? p.owner.email}
                            </span>
                            {p.owner.name && p.owner.email && (
                                <span className="block truncate text-[10px] text-content-subtle">
                                    {p.owner.email}
                                </span>
                            )}
                        </span>
                    </span>
                );
            },
        },
        {
            id: 'version',
            header: 'Version',
            // Prefer the bound `currentVersion.versionNumber` (the
            // operator-visible counter that ratchets only on
            // publish). Falls back to `lifecycleVersion` (which
            // matches CISO-Assistant's editing_version) and finally
            // a dash for policies without any version row yet.
            accessorFn: (p: any) =>
                p.currentVersion?.versionNumber ??
                p.lifecycleVersion ??
                null,
            cell: ({ getValue, row }: any) => {
                const v = getValue();
                if (v == null) {
                    return (
                        <span className="text-xs text-content-subtle">—</span>
                    );
                }
                return (
                    <span
                        className="inline-flex items-center rounded-md bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-content-emphasis"
                        data-testid={`policy-version-${row.original.id}`}
                    >
                        v{v}
                    </span>
                );
            },
        },
        {
            id: 'nextReviewAt',
            header: 'Next Review',
            accessorFn: (p: any) => p.nextReviewAt || '',
            cell: ({ row }: any) => {
                const p = row.original;
                if (!p.nextReviewAt) {
                    return <span className="text-xs text-content-muted">—</span>;
                }
                const isOverdue =
                    !!hydratedNow &&
                    new Date(p.nextReviewAt) < hydratedNow &&
                    p.status !== 'ARCHIVED';
                return (
                    <span className="inline-flex items-center gap-1 text-xs text-content-muted">
                        <TimestampTooltip date={p.nextReviewAt} />
                        {isOverdue && (
                            <span
                                className="badge badge-danger text-xs"
                                data-testid={`policy-overdue-${p.id}`}
                            >
                                Overdue
                            </span>
                        )}
                    </span>
                );
            },
            meta: { disableTruncate: true },
        },
        {
            id: 'updatedAt',
            header: 'Updated',
            accessorFn: (p: any) => p.updatedAt,
            cell: ({ getValue }: any) => (
                <TimestampTooltip
                    date={getValue() as string | null | undefined}
                    className="text-xs text-content-subtle"
                />
            ),
        },
    ]), [tenantHref, hydratedNow]);

    return (
        <EntityListPage<any>
            className="animate-fadeIn gap-6"
            header={{
                title: t.title,
                count: `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'}`,
                actions: permissions.canWrite ? (
                    <>
                        <Link
                            href={tenantHref('/policies/templates')}
                            className="btn btn-secondary"
                            id="policy-from-template-btn"
                        >
                            From Template
                        </Link>
                        <Link
                            href={tenantHref('/policies/new')}
                            className="btn btn-primary"
                            id="new-policy-btn"
                        >
                            + New Policy
                        </Link>
                    </>
                ) : null,
            }}
            filters={{
                defs: liveFilters,
                searchId: 'policy-search',
                searchPlaceholder: 'Search policies… (Enter)',
                toolbarActions: (
                    <ColumnsDropdown
                        columns={policyColumnDropdown}
                        visibility={columnVisibility}
                        onChange={(v) => setColumnVisibility(v)}
                        defaultVisibility={defaultPolicyVisibility}
                    />
                ),
            }}
            table={{
                data: policies,
                columns: policyColumns,
                loading,
                getRowId: (p: any) => p.id,
                onRowClick: (row) =>
                    router.push(tenantHref(`/policies/${row.original.id}`)),
                emptyState: hasActive
                    ? 'No policies match your filters'
                    : 'No policies found. Create your first policy to get started.',
                resourceName: (p) => (p ? 'policies' : 'policy'),
                columnVisibility,
                onColumnVisibilityChange: setColumnVisibility,
                'data-testid': 'policies-table',
                className: 'hover:bg-bg-muted',
            }}
        />
    );
}
