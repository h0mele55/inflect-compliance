'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { queryKeys } from '@/lib/queryKeys';
import { SkeletonTableRow } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { CompactFilterBar } from '@/components/filters/CompactFilterBar';
import { controlsFilterConfig } from '@/components/filters/configs';

// ─── Constants ───

const STATUS_CYCLE = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NEEDS_REVIEW'] as const;
type ControlStatusType = typeof STATUS_CYCLE[number];

const STATUS_BADGE: Record<string, string> = {
    NOT_STARTED: 'badge-neutral', IN_PROGRESS: 'badge-info', IMPLEMENTED: 'badge-success',
    NEEDS_REVIEW: 'badge-warning',
};
const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', IMPLEMENTED: 'Implemented',
    NEEDS_REVIEW: 'Needs Review',
};
const STATUS_OPTIONS = STATUS_CYCLE as unknown as string[];
const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};

function nextStatus(current: string): ControlStatusType {
    const idx = STATUS_CYCLE.indexOf(current as ControlStatusType);
    return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// ─── Types ───

interface ControlListItem {
    id: string;
    code: string | null;
    annexId: string | null;
    name: string;
    description: string | null;
    status: string;
    applicability: string;
    frequency: string | null;
    owner: { name: string } | null;
    _count?: { controlTasks?: number; evidenceLinks?: number };
    controlTasks?: Array<{ status: string }>;
}

export default function ControlsPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions, tenantSlug } = useTenantContext();
    const queryClient = useQueryClient();

    // URL-driven filter state
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'status', 'applicability']);

    // Justification modal state
    const [justificationModal, setJustificationModal] = useState<{ controlId: string; code: string } | null>(null);
    const [justification, setJustification] = useState('');
    const justificationRef = useRef<HTMLTextAreaElement>(null);

    // ─── Query: controls list ───

    const controlsQuery = useQuery<ControlListItem[]>({
        queryKey: queryKeys.controls.list(tenantSlug, filters),
        queryFn: async () => {
            const params = new URLSearchParams(filters);
            const qs = params.toString();
            const res = await fetch(apiUrl(`/controls${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch controls');
            return res.json();
        },
    });

    const controls = controlsQuery.data ?? [];
    const loading = controlsQuery.isLoading;

    // Focus justification textarea when modal opens
    useEffect(() => {
        if (justificationModal && justificationRef.current) {
            justificationRef.current.focus();
        }
    }, [justificationModal]);

    // ─── Mutation: status cycle ───

    const statusMutation = useMutation({
        mutationFn: async ({ controlId, newStatus }: { controlId: string; newStatus: string }) => {
            const res = await fetch(apiUrl(`/controls/${controlId}/status`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error('Status update failed');
            return res.json();
        },
        onMutate: async ({ controlId, newStatus }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.controls.all(tenantSlug) });

            // Snapshot all matching list queries
            const listKey = queryKeys.controls.list(tenantSlug, filters);
            const previousList = queryClient.getQueryData<ControlListItem[]>(listKey);

            // Optimistically update list
            if (previousList) {
                queryClient.setQueryData<ControlListItem[]>(listKey, (old) =>
                    old?.map(c => c.id === controlId ? { ...c, status: newStatus } : c)
                );
            }

            return { previousList, listKey };
        },
        onError: (_err, _vars, context) => {
            // Rollback
            if (context?.previousList) {
                queryClient.setQueryData(context.listKey, context.previousList);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.controls.all(tenantSlug) });
        },
    });

    // ─── Mutation: applicability toggle ───

    const applicabilityMutation = useMutation({
        mutationFn: async ({ controlId, applicability, justificationText }: {
            controlId: string;
            applicability: string;
            justificationText: string | null;
        }) => {
            const res = await fetch(apiUrl(`/controls/${controlId}/applicability`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicability,
                    justification: applicability === 'NOT_APPLICABLE' ? justificationText : null,
                }),
            });
            if (!res.ok) throw new Error('Applicability update failed');
            return res.json();
        },
        onMutate: async ({ controlId, applicability }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.controls.all(tenantSlug) });

            const listKey = queryKeys.controls.list(tenantSlug, filters);
            const previousList = queryClient.getQueryData<ControlListItem[]>(listKey);

            if (previousList) {
                queryClient.setQueryData<ControlListItem[]>(listKey, (old) =>
                    old?.map(c => c.id === controlId ? { ...c, applicability } : c)
                );
            }

            return { previousList, listKey };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousList) {
                queryClient.setQueryData(context.listKey, context.previousList);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.controls.all(tenantSlug) });
        },
    });

    // ─── Handlers ───

    const handleStatusClick = (controlId: string) => {
        const control = controls.find(c => c.id === controlId);
        if (!control || statusMutation.isPending) return;
        statusMutation.mutate({ controlId, newStatus: nextStatus(control.status) });
    };

    const handleApplicabilityClick = (controlId: string, code: string) => {
        const control = controls.find(c => c.id === controlId);
        if (!control || applicabilityMutation.isPending) return;

        if (control.applicability === 'NOT_APPLICABLE') {
            applicabilityMutation.mutate({ controlId, applicability: 'APPLICABLE', justificationText: null });
        } else {
            setJustificationModal({ controlId, code: code || controlId.slice(0, 8) });
            setJustification('');
        }
    };

    const handleJustificationSave = () => {
        if (!justificationModal || !justification.trim()) return;
        applicabilityMutation.mutate({
            controlId: justificationModal.controlId,
            applicability: 'NOT_APPLICABLE',
            justificationText: justification.trim(),
        });
        setJustificationModal(null);
        setJustification('');
    };

    const handleJustificationCancel = () => {
        setJustificationModal(null);
        setJustification('');
    };

    // ─── Helpers ───

    const taskStats = (c: ControlListItem) => {
        const total = c._count?.controlTasks ?? 0;
        const done = c.controlTasks?.filter(t => t.status === 'DONE').length ?? 0;
        return { total, done };
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">🛡️ Controls</h1>
                    <p className="text-slate-400 text-sm">{controls.length} controls in register</p>
                </div>
                {permissions.canWrite && (
                    <div className="flex gap-2">
                        <Link href={tenantHref('/controls/dashboard')} className="btn btn-secondary" id="controls-dashboard-btn">
                            📊 Dashboard
                        </Link>
                        <Link href={tenantHref('/frameworks')} className="btn btn-secondary" id="frameworks-btn">
                            🗺️ Frameworks
                        </Link>
                        <Link href={tenantHref('/controls/templates')} className="btn btn-secondary" id="install-templates-btn">
                            📋 Install from Templates
                        </Link>
                        <Link href={tenantHref('/controls/new')} className="btn btn-primary" id="new-control-btn">
                            + New Control
                        </Link>
                    </div>
                )}
            </div>

            {/* Filters */}
            <CompactFilterBar config={controlsFilterConfig} filters={filters} setFilter={setFilter} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} />

            {/* Table */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Title</th>
                                <th>Status</th>
                                <th>Applicability</th>
                                <th>Owner</th>
                                <th>Frequency</th>
                                <th>Tasks</th>
                                <th>Evidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: 10 }).map((_, i) => (
                                <SkeletonTableRow key={i} cols={8} />
                            ))}
                        </tbody>
                    </table>
                ) : controls.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <p className="text-lg mb-2">{hasActiveFilters ? 'No controls match your filters' : 'No controls found'}</p>
                        <p className="text-sm">{hasActiveFilters ? 'Try adjusting your search or filters.' : 'Install from templates or create a new control.'}</p>
                        {hasActiveFilters && (
                            <button type="button" className="btn btn-sm btn-secondary mt-3" onClick={clearFilters}>Clear filters</button>
                        )}
                    </div>
                ) : (
                    <table className="data-table" id="controls-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Title</th>
                                <th>Status</th>
                                <th>Applicability</th>
                                <th>Owner</th>
                                <th>Frequency</th>
                                <th>Tasks</th>
                                <th>Evidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {controls.map(c => {
                                const ts = taskStats(c);
                                const code = c.code || c.annexId || '';
                                return (
                                    <tr key={c.id} className="hover:bg-slate-700/30 transition">
                                        <td className="text-xs text-slate-400 font-mono">{code || '—'}</td>
                                        <td>
                                            <Link href={tenantHref(`/controls/${c.id}`)} className="font-medium text-white hover:text-brand-400 transition" id={`control-link-${c.id}`}>
                                                {c.name}
                                            </Link>
                                            {c.description && (
                                                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{c.description}</p>
                                            )}
                                        </td>
                                        {/* Status pill */}
                                        <td>
                                            {permissions.canWrite ? (
                                                <button
                                                    type="button"
                                                    className={`badge ${STATUS_BADGE[c.status] || 'badge-neutral'} cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1`}
                                                    onClick={(e) => { e.stopPropagation(); handleStatusClick(c.id); }}
                                                    title="Click to advance status"
                                                    aria-label={`Advance status for control ${code || c.name}`}
                                                    id={`status-pill-${c.id}`}
                                                >
                                                    {STATUS_LABELS[c.status] || c.status}
                                                </button>
                                            ) : (
                                                <span className={`badge ${STATUS_BADGE[c.status] || 'badge-neutral'}`}>
                                                    {STATUS_LABELS[c.status] || c.status}
                                                </span>
                                            )}
                                        </td>
                                        {/* Applicability pill */}
                                        <td>
                                            {permissions.canWrite ? (
                                                <button
                                                    type="button"
                                                    className={`badge ${c.applicability === 'NOT_APPLICABLE' ? 'badge-warning' : 'badge-success'} cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1`}
                                                    onClick={(e) => { e.stopPropagation(); handleApplicabilityClick(c.id, code); }}
                                                    title={c.applicability === 'NOT_APPLICABLE' ? 'Click to mark applicable' : 'Click to mark not applicable'}
                                                    aria-label={`Toggle applicability for control ${code || c.name}`}
                                                    id={`applicability-pill-${c.id}`}
                                                >
                                                    {c.applicability === 'NOT_APPLICABLE' ? 'N/A' : 'Yes'}
                                                </button>
                                            ) : (
                                                <span className={`badge ${c.applicability === 'NOT_APPLICABLE' ? 'badge-warning' : 'badge-success'}`}>
                                                    {c.applicability === 'NOT_APPLICABLE' ? 'N/A' : 'Yes'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-xs text-slate-400">{c.owner?.name || '—'}</td>
                                        <td className="text-xs text-slate-400">{c.frequency ? FREQ_LABELS[c.frequency] || c.frequency : '—'}</td>
                                        <td className="text-xs">
                                            <span className={ts.total > 0 && ts.done === ts.total ? 'text-emerald-400' : 'text-slate-400'}>
                                                {ts.done}/{ts.total}
                                            </span>
                                        </td>
                                        <td className="text-xs text-slate-400">{c._count?.evidenceLinks ?? 0}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Justification Modal */}
            {justificationModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" id="justification-modal-backdrop" onClick={handleJustificationCancel}>
                    <div className="glass-card p-6 w-full max-w-md space-y-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-white">Mark as Not Applicable</h3>
                        <p className="text-sm text-slate-400">
                            Provide justification for marking control <span className="font-mono text-white">{justificationModal.code}</span> as not applicable.
                        </p>
                        <textarea
                            ref={justificationRef}
                            className="input w-full"
                            rows={3}
                            placeholder="Justification is required..."
                            value={justification}
                            onChange={e => setJustification(e.target.value)}
                            id="justification-input"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="btn btn-secondary text-sm"
                                onClick={handleJustificationCancel}
                                id="justification-cancel-btn"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary text-sm"
                                onClick={handleJustificationSave}
                                disabled={!justification.trim()}
                                id="justification-save-btn"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
