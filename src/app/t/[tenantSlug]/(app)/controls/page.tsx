'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

const STATUS_BADGE: Record<string, string> = {
    NOT_STARTED: 'badge-neutral', IN_PROGRESS: 'badge-info', IMPLEMENTED: 'badge-success',
    NEEDS_REVIEW: 'badge-warning', PLANNED: 'badge-neutral', IMPLEMENTING: 'badge-info',
};
const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', IMPLEMENTED: 'Implemented',
    NEEDS_REVIEW: 'Needs Review', PLANNED: 'Planned', IMPLEMENTING: 'Implementing',
};
const STATUS_OPTIONS = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NEEDS_REVIEW'];
const APPLICABILITY_OPTIONS = ['', 'APPLICABLE', 'NOT_APPLICABLE'];
const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};

export default function ControlsPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();

    const [controls, setControls] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [applicabilityFilter, setApplicabilityFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchControls = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (applicabilityFilter) params.set('applicability', applicabilityFilter);
        if (searchQuery) params.set('q', searchQuery);
        const qs = params.toString();
        const res = await fetch(apiUrl(`/controls${qs ? `?${qs}` : ''}`));
        if (res.ok) setControls(await res.json());
        setLoading(false);
    }, [apiUrl, statusFilter, applicabilityFilter, searchQuery]);

    useEffect(() => { fetchControls(); }, [fetchControls]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskStats = (c: any) => {
        const total = c._count?.controlTasks ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const done = c.controlTasks?.filter((t: any) => t.status === 'DONE').length ?? 0;
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
            <div className="glass-card p-4">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="text"
                            className="input w-full"
                            placeholder="Search controls..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            id="control-search"
                        />
                    </div>
                    <select
                        className="input w-40"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        id="control-status-filter"
                    >
                        <option value="">All Status</option>
                        {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                    </select>
                    <select
                        className="input w-48"
                        value={applicabilityFilter}
                        onChange={e => setApplicabilityFilter(e.target.value)}
                        id="control-applicability-filter"
                    >
                        <option value="">All Applicability</option>
                        <option value="APPLICABLE">Applicable</option>
                        <option value="NOT_APPLICABLE">Not Applicable</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500 animate-pulse">Loading controls...</div>
                ) : controls.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <p className="text-lg mb-2">No controls found</p>
                        <p className="text-sm">Install from templates or create a new control.</p>
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
                                return (
                                    <tr key={c.id} className="cursor-pointer hover:bg-slate-700/30 transition">
                                        <td className="text-xs text-slate-400 font-mono">{c.code || c.annexId || '—'}</td>
                                        <td>
                                            <Link href={tenantHref(`/controls/${c.id}`)} className="font-medium text-white hover:text-brand-400 transition" id={`control-link-${c.id}`}>
                                                {c.name}
                                            </Link>
                                            {c.description && (
                                                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{c.description}</p>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge ${STATUS_BADGE[c.status] || 'badge-neutral'}`}>
                                                {STATUS_LABELS[c.status] || c.status}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${c.applicability === 'NOT_APPLICABLE' ? 'badge-warning' : 'badge-success'}`}>
                                                {c.applicability === 'NOT_APPLICABLE' ? 'N/A' : 'Yes'}
                                            </span>
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
        </div>
    );
}
