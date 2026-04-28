'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- Client component receiving server-rendered domain data; tanstack column callbacks; or library-boundary callbacks. Per-site narrowing requires generated DTOs / per-cell CellContext imports — out of scope for the lint cleanup PR. */
import { formatDate } from '@/lib/format-date';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';
// Both evidence modals were previously lazy-loaded via next/dynamic,
// but the JIT race in `next dev` made the modals occasionally fail to
// mount in serial-mode E2E runs (Playwright clicked the trigger before
// the chunk finished compiling). Static imports — the bundle cost is
// acceptable and the E2E suite becomes deterministic.
import { UploadEvidenceModal } from './UploadEvidenceModal';
import { NewEvidenceTextModal } from './NewEvidenceTextModal';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import {
    parseYMD,
    startOfUtcDay,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import {
    ColumnsDropdown,
    DataTable,
    createColumns,
    getDefaultVisibility,
} from '@/components/ui/table';
import { useColumnVisibility } from '@/components/ui/hooks';
import { Tooltip } from '@/components/ui/tooltip';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
    type FilterType,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import {
    buildEvidenceFilters,
    EVIDENCE_FILTER_KEYS,
} from './filter-defs';

interface Permissions {
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
    canAudit: boolean;
    canExport: boolean;
}

const STATUS_BADGE: Record<string, string> = {
    DRAFT: 'badge-neutral', SUBMITTED: 'badge-info', APPROVED: 'badge-success', REJECTED: 'badge-danger',
    PENDING_UPLOAD: 'badge-info',
};

type RetentionFilter = 'active' | 'expiring' | 'archived';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRetentionStatus(ev: any, now: Date | null): { label: string; badge: string; icon: string } {
    if (ev.isArchived) return { label: 'Archived', badge: 'badge-neutral', icon: '' };
    if (ev.expiredAt) return { label: 'Expired', badge: 'badge-danger', icon: '' };
    if (ev.retentionUntil) {
        if (!now) return { label: 'Active', badge: 'badge-success', icon: '' };
        const until = new Date(ev.retentionUntil);
        const daysLeft = Math.ceil((until.getTime() - now.getTime()) / 86_400_000);
        if (daysLeft <= 0) return { label: 'Expired', badge: 'badge-danger', icon: '' };
        if (daysLeft <= 30) return { label: `Expiring (${daysLeft}d)`, badge: 'badge-warning', icon: '' };
        return { label: 'Active', badge: 'badge-success', icon: '' };
    }
    return { label: 'No policy', badge: 'badge-neutral', icon: '—' };
}

interface EvidenceClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialEvidence: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialControls: any[];
    tenantSlug: string;
    permissions: Permissions;
    translations: Record<string, string>;
}

/**
 * Client island for evidence — handles all interactive features.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 *
 * Filter architecture (Epic 53):
 *   - `q`, `type`, `status`, `controlId` flow through `useFilterContext`
 *     (URL-synced via the shared context).
 *   - `tab` (retention view: active | expiring | archived) stays on
 *     `useUrlFilters` since it's a view selector, not a filter.
 */
export function EvidenceClient(props: EvidenceClientProps) {
    const filterCtx = useFilterContext([], EVIDENCE_FILTER_KEYS, {});
    return (
        <FilterProvider value={filterCtx}>
            <EvidencePageInner {...props} />
        </FilterProvider>
    );
}

function EvidencePageInner({ initialEvidence, initialControls, tenantSlug, permissions, translations: t }: EvidenceClientProps) {
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const queryClient = useQueryClient();

    // Retention-tab view selector — deliberately kept separate from filter state.
    const { filters, setFilter } = useUrlFilters(['tab']);
    const filterCtx = useFilters();
    const { state, search, hasActive } = filterCtx;

    // ─── Build the API query string from filter state + retention tab ───
    const fetchParams = useMemo(() => {
        const params = toApiSearchParams(state, { search });
        if (filters.tab === 'archived') params.set('archived', 'true');
        else if (filters.tab === 'expiring') params.set('expiring', 'true');
        return params;
    }, [state, search, filters.tab]);

    const queryKeyFilters = useMemo(() => {
        const obj: Record<string, string> = {};
        for (const [k, v] of fetchParams) obj[k] = v;
        return obj;
    }, [fetchParams]);

    // ─── Query: evidence list (hydrated with server data) ───
    const anyFilterActive = hasActive || !!filters.tab;
    const evidenceQuery = useQuery({
        queryKey: queryKeys.evidence.list(tenantSlug, queryKeyFilters),
        queryFn: async () => {
            const qs = fetchParams.toString();
            const res = await fetch(apiUrl(`/evidence${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch evidence');
            return res.json();
        },
        initialData: anyFilterActive ? undefined : initialEvidence,
        initialDataUpdatedAt: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidence: any[] = evidenceQuery.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [controls] = useState<any[]>(initialControls);
    const retentionFilter = (filters.tab || 'active') as RetentionFilter;
    const [showUpload, setShowUpload] = useState(false);
    const [showTextForm, setShowTextForm] = useState(false);

    // Retention edit state
    const [editingRetention, setEditingRetention] = useState<string | null>(null);
    const [editRetentionDate, setEditRetentionDate] = useState('');

    const invalidateEvidence = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all(tenantSlug) });
    };

    // ─── Mutation: review workflow ───

    const reviewMutation = useMutation({
        mutationFn: async ({ id, action, comment }: { id: string; action: string; comment: string }) => {
            const res = await fetch(apiUrl(`/evidence/${id}/review`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, comment }),
            });
            if (!res.ok) throw new Error('Review action failed');
            return { id, action };
        },
        onMutate: async ({ id, action }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.evidence.all(tenantSlug) });
            const listKey = queryKeys.evidence.list(tenantSlug);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const previousList = queryClient.getQueryData<any[]>(listKey);
            const newStatus = action === 'SUBMITTED' ? 'SUBMITTED' : action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
            if (previousList) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                queryClient.setQueryData<any[]>(listKey, old =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    old?.map((ev: any) => ev.id === id ? { ...ev, status: newStatus } : ev)
                );
            }
            return { previousList, listKey };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousList) {
                queryClient.setQueryData(context.listKey, context.previousList);
            }
        },
        onSettled: () => invalidateEvidence(),
    });

    const submitReview = (id: string, action: string, comment = '') => {
        reviewMutation.mutate({ id, action, comment });
    };

    // ─── Retention actions ───

    const archiveEvidence = async (id: string) => {
        const res = await fetch(apiUrl(`/evidence/${id}/archive`), { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            alert(err?.error?.message || 'Failed to archive evidence');
            return;
        }
        invalidateEvidence();
    };

    const unarchiveEvidence = async (id: string) => {
        const res = await fetch(apiUrl(`/evidence/${id}/unarchive`), { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            alert(err?.error?.message || 'Failed to unarchive evidence');
            return;
        }
        invalidateEvidence();
    };

    const saveRetention = async (id: string) => {
        await fetch(apiUrl(`/evidence/${id}/retention`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                retentionUntil: editRetentionDate ? new Date(editRetentionDate).toISOString() : null,
                retentionPolicy: editRetentionDate ? 'FIXED_DATE' : 'NONE',
            }),
        });
        setEditingRetention(null);
        setEditRetentionDate('');
        invalidateEvidence();
    };

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { DRAFT: t.draft, SUBMITTED: t.submitted, APPROVED: t.approved, REJECTED: t.rejected, PENDING_UPLOAD: 'Uploading...' };
        return map[status] || status;
    };

    // ─── Retention filter counts ───
    // Null on SSR + first client render so the "Expiring" count matches
    // exactly across hydration (avoids React #418/#422).
    const hydratedNow = useHydratedNow();

    const activeEvidence = evidence.filter(ev => !ev.isArchived && !ev.expiredAt && !ev.deletedAt);
    const expiringEvidence = hydratedNow ? evidence.filter(ev => {
        if (ev.isArchived || ev.deletedAt) return false;
        if (!ev.retentionUntil) return false;
        const until = new Date(ev.retentionUntil);
        const in30Days = new Date(hydratedNow.getTime() + 30 * 86_400_000);
        return until <= in30Days && until > hydratedNow;
    }) : [];
    const archivedEvidence = evidence.filter(ev => ev.isArchived || ev.expiredAt);

    // ─── Filtered evidence list (respects the active retention tab) ───
    const displayEvidence = retentionFilter === 'archived'
        ? archivedEvidence
        : retentionFilter === 'expiring'
            ? expiringEvidence
            : activeEvidence;

    // ─── Column visibility (Epic 52) ───
    // Pagination removed — internal scroll inside the table card
    // (ListPageShell.Body + DataTable fillBody) shows all rows.
    const evidenceColumnConfig = useMemo(
        () => ({
            all: ['title', 'type', 'control', 'retention', 'status', 'owner', 'actions'],
            defaultVisible: ['title', 'type', 'control', 'retention', 'status', 'owner', 'actions'],
            fixed: ['actions'],
        }),
        [],
    );
    const { columnVisibility, setColumnVisibility } = useColumnVisibility(
        'inflect:col-vis:evidence',
        evidenceColumnConfig,
    );
    const defaultEvidenceVisibility = useMemo(
        () => getDefaultVisibility(evidenceColumnConfig),
        [evidenceColumnConfig],
    );
    const evidenceColumnDropdown = useMemo(
        () => [
            { id: 'title', label: 'Title' },
            { id: 'type', label: 'Type' },
            { id: 'control', label: 'Control' },
            { id: 'retention', label: 'Retention' },
            { id: 'status', label: 'Status' },
            { id: 'owner', label: 'Owner' },
            { id: 'actions', label: 'Actions', alwaysVisible: true },
        ],
        [],
    );

    // ── Evidence Column Definitions ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidenceColumns = useMemo(() => createColumns<any>([
        {
            accessorKey: 'title',
            header: t.evidenceTitle,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: { row: any }) => {
                const ev = row.original;
                return (
                    <div>
                        <div className="font-medium text-content-emphasis text-sm">{ev.title}</div>
                        {ev.fileName && ev.fileName !== ev.title && (
                            <div className="text-xs text-content-subtle">{ev.fileName}</div>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'type',
            header: t.type,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: { row: any }) => {
                const ev = row.original;
                return (
                    <span className={`badge ${ev.type === 'FILE' ? 'badge-success' : 'badge-info'}`}>
                        {ev.type === 'FILE' ? 'FILE' : ev.type}
                    </span>
                );
            },
        },
        {
            id: 'control',
            header: t.control,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accessorFn: (ev: any) => ev.control ? `${ev.control.annexId || ''} ${ev.control.name}` : '\u2014',
            cell: ({ getValue }: { getValue: () => string }) => (
                <span className="text-xs text-content-muted">{getValue()}</span>
            ),
        },
        {
            id: 'retention',
            header: 'Retention',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: { row: any }) => {
                const ev = row.original;
                const rs = getRetentionStatus(ev, hydratedNow);
                return (
                    <div className="text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className={`badge ${rs.badge}`} id={`retention-status-${ev.id}`}>
                                {rs.icon} {rs.label}
                            </span>
                        </div>
                        {ev.retentionUntil && !ev.isArchived && (
                            <div className="text-content-subtle mt-0.5">{formatDate(ev.retentionUntil)}</div>
                        )}
                        {editingRetention === ev.id && (
                            <div className="mt-2 flex gap-1 items-center">
                                {/*
                                  Epic 58 — inline retention edit now
                                  uses the shared DatePicker. The
                                  surrounding YMD-string state stays
                                  unchanged so `saveRetention()` keeps
                                  the existing retention API contract.
                                */}
                                <DatePicker
                                    id={`retention-edit-${ev.id}`}
                                    className="w-36 text-xs"
                                    placeholder="Pick date"
                                    clearable
                                    align="start"
                                    value={parseYMD(editRetentionDate)}
                                    onChange={(next) => {
                                        setEditRetentionDate(
                                            toYMD(next) ?? '',
                                        );
                                    }}
                                    disabledDays={{
                                        before: startOfUtcDay(new Date()),
                                    }}
                                    aria-label="Retention date"
                                />
                                <button onClick={() => saveRetention(ev.id)} className="btn btn-sm btn-primary text-xs py-0.5 px-1.5">Save</button>
                                <Tooltip content="Cancel edit" shortcut="Esc">
                                    <button onClick={() => setEditingRetention(null)} className="btn btn-sm btn-secondary text-xs py-0.5 px-1.5" aria-label="Cancel">×</button>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                );
            },
            meta: { disableTruncate: true },
        },
        {
            accessorKey: 'status',
            header: t.status,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: { row: any }) => {
                const ev = row.original;
                return <span className={`badge ${STATUS_BADGE[ev.status]}`}>{statusLabel(ev.status)}</span>;
            },
        },
        {
            id: 'owner',
            header: t.ownerLabel,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accessorFn: (ev: any) => ev.owner || '\u2014',
            cell: ({ getValue }: { getValue: () => string }) => (
                <span className="text-xs">{getValue()}</span>
            ),
        },
        {
            id: 'actions',
            header: t.actions,
            enableHiding: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: { row: any }) => {
                const ev = row.original;
                const isPending = ev.id?.startsWith('temp:');
                if (isPending) return <span className="text-xs text-content-subtle">Uploading...</span>;
                return (
                    <div className="flex gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                        {ev.type === 'FILE' && ev.fileRecordId && (
                            <a href={apiUrl(`/evidence/files/${ev.fileRecordId}/download`)} className="btn btn-sm btn-secondary" download id={`download-${ev.id}`}>⬇</a>
                        )}
                        {permissions.canWrite && !ev.isArchived && (
                            <Tooltip content="Edit retention date">
                                <button
                                    onClick={() => { setEditingRetention(ev.id); setEditRetentionDate(ev.retentionUntil ? ev.retentionUntil.split('T')[0] : ''); }}
                                    className="btn btn-sm btn-secondary"
                                    id={`edit-retention-${ev.id}`}
                                >
                                    Edit
                                </button>
                            </Tooltip>
                        )}
                        {permissions.canWrite && !ev.isArchived && (
                            <button onClick={() => archiveEvidence(ev.id)} className="btn btn-sm btn-secondary" id={`archive-${ev.id}`}>Archive</button>
                        )}
                        {permissions.canWrite && ev.isArchived && (
                            <button onClick={() => unarchiveEvidence(ev.id)} className="btn btn-sm btn-primary" id={`unarchive-${ev.id}`}>Unarchive</button>
                        )}
                        {permissions.canWrite && ev.status === 'DRAFT' && (
                            <button onClick={() => submitReview(ev.id, 'SUBMITTED')} className="btn btn-sm btn-secondary">{t.submitForReview}</button>
                        )}
                        {permissions.canWrite && ev.status === 'SUBMITTED' && (
                            <>
                                <button onClick={() => submitReview(ev.id, 'APPROVED')} className="btn btn-sm btn-success">{t.approveEvidence}</button>
                                <button onClick={() => submitReview(ev.id, 'REJECTED', 'Needs improvement')} className="btn btn-sm btn-danger">{t.rejectEvidence}</button>
                            </>
                        )}
                        {permissions.canWrite && ev.status === 'REJECTED' && (
                            <button onClick={() => submitReview(ev.id, 'SUBMITTED')} className="btn btn-sm btn-secondary">{t.submitForReview}</button>
                        )}
                    </div>
                );
            },
            meta: { disableTruncate: true },
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ]), [t, permissions, editingRetention, editRetentionDate, apiUrl]);

    return (
        <ListPageShell className="animate-fadeIn gap-6">
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">{t.title}</h1>
                        <p className="text-content-muted text-sm">{evidence.length} evidence items</p>
                    </div>
                    {permissions.canWrite && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowUpload(true)}
                                className="btn btn-primary"
                                id="upload-evidence-btn"
                            >
                                Upload File
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowTextForm(true)}
                                className="btn btn-secondary"
                                id="add-text-evidence-btn"
                            >
                                {t.addEvidence}
                            </button>
                        </div>
                    )}
                </div>
            </ListPageShell.Header>

            {permissions.canWrite && (
                <>
                    <UploadEvidenceModal
                        open={showUpload}
                        setOpen={setShowUpload}
                        tenantSlug={tenantSlug}
                        apiUrl={apiUrl}
                        controls={controls}
                    />
                    <NewEvidenceTextModal
                        open={showTextForm}
                        setOpen={setShowTextForm}
                        tenantSlug={tenantSlug}
                        apiUrl={apiUrl}
                        controls={controls}
                    />
                </>
            )}

            <ListPageShell.Filters className="space-y-3">
                {/* Retention filter tabs + Control filter */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-1" id="retention-tabs">
                        <button
                            onClick={() => setFilter('tab', 'active')}
                            className={`btn ${retentionFilter === 'active' ? 'btn-primary' : 'btn-ghost'}`}
                            id="tab-active"
                        >
                            Active ({activeEvidence.length})
                        </button>
                        <button
                            onClick={() => setFilter('tab', 'expiring')}
                            className={`btn ${retentionFilter === 'expiring' ? 'btn-danger' : 'btn-ghost'}`}
                            id="tab-expiring"
                        >
                            Expiring ({expiringEvidence.length})
                        </button>
                        <button
                            onClick={() => setFilter('tab', 'archived')}
                            className={`btn ${retentionFilter === 'archived' ? 'btn-secondary' : 'btn-ghost'}`}
                            id="tab-archived"
                        >
                            Archived ({archivedEvidence.length})
                        </button>
                    </div>

                    <EvidenceFilterToolbar
                        controls={controls}
                        columnsDropdown={
                            <ColumnsDropdown
                                columns={evidenceColumnDropdown}
                                visibility={columnVisibility}
                                onChange={(v) => setColumnVisibility(v)}
                                defaultVisibility={defaultEvidenceVisibility}
                            />
                        }
                    />
                </div>

                {/* Archived warning */}
                {retentionFilter === 'archived' && archivedEvidence.length > 0 && (
                    <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-3 text-sm text-amber-300 flex items-start gap-2">
                        <span className="text-lg">!</span>
                        <div>
                            <strong>Archived evidence</strong> should not be used in active audit packs or compliance assessments.
                            Unarchive if you need to reuse this evidence.
                        </div>
                    </div>
                )}
            </ListPageShell.Filters>

            <ListPageShell.Body>
                <DataTable
                    fillBody
                    data={displayEvidence}
                    columns={evidenceColumns}
                    getRowId={(ev: any) => ev.id}
                    emptyState={
                        retentionFilter === 'archived'
                            ? 'No archived evidence'
                            : retentionFilter === 'expiring'
                                ? 'No evidence expiring soon'
                                : t.noEvidence
                    }
                    resourceName={(p) => p ? 'evidence items' : 'evidence item'}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    data-testid="evidence-table"
                    className="hover:bg-bg-muted"
                />
            </ListPageShell.Body>
        </ListPageShell>
    );
}

// ─── Evidence filter toolbar ─────────────────────────────────────────

function EvidenceFilterToolbar({
    controls,
    columnsDropdown,
}: {
    controls: unknown[];
    columnsDropdown?: React.ReactNode;
}) {
    const filters: FilterType[] = useMemo(
        () => buildEvidenceFilters(controls as Parameters<typeof buildEvidenceFilters>[0]),
        [controls],
    );
    return (
        <FilterToolbar
            filters={filters}
            searchId="evidence-search"
            searchPlaceholder="Search evidence… (Enter)"
            actions={columnsDropdown}
        />
    );
}
