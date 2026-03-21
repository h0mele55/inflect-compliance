'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Search, X, FilterX, Link2, FileText, AlertTriangle,
    CheckCircle2, XCircle, HelpCircle, ChevronDown, Check,
    Download, Plus, MessageSquare,
} from 'lucide-react';
import type { SoAReportDTO, SoAEntryDTO } from '@/lib/dto/soa';
import { PdfExportButton } from '@/components/PdfExportButton';
import { RequirePermission } from '@/components/require-permission';

// ─── Types ───

interface ControlOption {
    id: string;
    code: string | null;
    name: string;
    status: string;
}

interface SoAClientProps {
    report: SoAReportDTO;
    controls: ControlOption[];
    tenantSlug: string;
    canEdit: boolean;
}

// ─── Badge helpers ───

function ApplicabilityBadge({ value }: { value: boolean | null }) {
    if (value === true)  return <span className="badge badge-success">Applicable</span>;
    if (value === false) return <span className="badge badge-neutral">Not Applicable</span>;
    return <span className="badge badge-danger">Unmapped</span>;
}

function StatusBadge({ value }: { value: string | null }) {
    if (!value) return <span className="text-slate-500 text-xs">—</span>;
    const cls: Record<string, string> = {
        IMPLEMENTED: 'badge-success',
        IN_PROGRESS: 'badge-info',
        NEEDS_REVIEW: 'badge-warning',
        NOT_STARTED: 'badge-neutral',
    };
    return <span className={`badge ${cls[value] || 'badge-neutral'}`}>{value.replace(/_/g, ' ')}</span>;
}

function GapBadges({ entry }: { entry: SoAEntryDTO }) {
    const gaps: JSX.Element[] = [];
    if (entry.applicable === null) {
        gaps.push(
            <span key="unmapped" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                <AlertTriangle className="w-3 h-3" /> Unmapped
            </span>
        );
    }
    if (entry.applicable === false) {
        const hasMissing = entry.mappedControls.some(c => c.applicability === 'NOT_APPLICABLE' && !c.justification);
        if (hasMissing) {
            gaps.push(
                <span key="justification" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <MessageSquare className="w-3 h-3" /> Justification missing
                </span>
            );
        }
    }
    return gaps.length > 0 ? <div className="flex flex-wrap gap-1">{gaps}</div> : null;
}

// ─── Main Component ───

export function SoAClient({ report, controls, tenantSlug, canEdit }: SoAClientProps) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [gapsOnly, setGapsOnly] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Modal state
    const [mapModal, setMapModal] = useState<{ requirementId: string; requirementCode: string } | null>(null);
    const [justModal, setJustModal] = useState<{ controlId: string; controlCode: string; requirementCode: string } | null>(null);
    const [mapControlSearch, setMapControlSearch] = useState('');
    const [justText, setJustText] = useState('');
    const [saving, setSaving] = useState(false);

    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    // ─── Filtering ───

    const filteredEntries = useMemo(() => {
        let entries = report.entries;

        if (search) {
            const q = search.toLowerCase();
            entries = entries.filter(e =>
                e.requirementCode.toLowerCase().includes(q) ||
                e.requirementTitle.toLowerCase().includes(q) ||
                (e.section || '').toLowerCase().includes(q)
            );
        }

        if (gapsOnly) {
            entries = entries.filter(e => {
                if (e.applicable === null) return true; // unmapped
                if (e.applicable === false) {
                    return e.mappedControls.some(c => c.applicability === 'NOT_APPLICABLE' && !c.justification);
                }
                return false;
            });
        }

        return entries;
    }, [report.entries, search, gapsOnly]);

    // ─── Actions ───

    const handleMapControl = async (controlId: string) => {
        if (!mapModal) return;
        setSaving(true);
        try {
            const res = await fetch(apiUrl('/reports/soa/map'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requirementId: mapModal.requirementId, controlId }),
            });
            if (!res.ok) throw new Error('Failed to map');
            setMapModal(null);
            setMapControlSearch('');
            router.refresh();
        } finally {
            setSaving(false);
        }
    };

    const handleSaveJustification = async () => {
        if (!justModal) return;
        setSaving(true);
        try {
            const res = await fetch(apiUrl(`/controls/${justModal.controlId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicability: 'NOT_APPLICABLE',
                    applicabilityJustification: justText,
                }),
            });
            if (!res.ok) throw new Error('Failed to save');
            setJustModal(null);
            setJustText('');
            router.refresh();
        } finally {
            setSaving(false);
        }
    };

    // Filtered controls for map modal
    const mapFilteredControls = useMemo(() => {
        if (!mapControlSearch) return controls;
        const q = mapControlSearch.toLowerCase();
        return controls.filter(c =>
            (c.code || '').toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        );
    }, [controls, mapControlSearch]);

    const { summary } = report;

    return (
        <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold" id="soa-heading">Statement of Applicability</h1>
                    <p className="text-slate-400 text-sm">ISO 27001:2022 Annex A — {summary.total} requirements</p>
                </div>
                <RequirePermission resource="reports" action="export">
                    <div className="flex flex-wrap gap-2">
                        <a
                            href={`/api/t/${tenantSlug}/reports/soa/export.csv`}
                            className="btn btn-secondary"
                            download
                            id="export-soa-btn"
                        >
                            <Download className="w-3.5 h-3.5" /> Export CSV
                        </a>
                        <PdfExportButton
                            tenantSlug={tenantSlug}
                            reportType="AUDIT_READINESS"
                            label="Audit Readiness PDF"
                            allowSave={canEdit}
                        />
                        <PdfExportButton
                            tenantSlug={tenantSlug}
                            reportType="GAP_ANALYSIS"
                            label="Gap Analysis PDF"
                            allowSave={canEdit}
                        />
                    </div>
                </RequirePermission>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <SummaryCard label="Total" value={summary.total} icon={<FileText className="w-4 h-4 text-slate-400" />} />
                <SummaryCard label="Applicable" value={summary.applicable} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
                <SummaryCard label="Not Applicable" value={summary.notApplicable} icon={<XCircle className="w-4 h-4 text-slate-400" />} />
                <SummaryCard label="Unmapped" value={summary.unmapped} icon={<HelpCircle className="w-4 h-4 text-red-400" />} accent={summary.unmapped > 0 ? 'danger' : undefined} />
                <SummaryCard label="Implemented" value={summary.implemented} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
                <SummaryCard label="Missing Justification" value={summary.missingJustification} icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} accent={summary.missingJustification > 0 ? 'warning' : undefined} />
            </div>

            {/* Readiness banner */}
            {(summary.unmapped > 0 || summary.missingJustification > 0) && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-center justify-between" id="soa-readiness-banner">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <div className="text-xs text-red-200">
                            <span className="font-semibold">SoA not audit-ready:</span>
                            {summary.unmapped > 0 && <span className="ml-1">{summary.unmapped} unmapped requirement{summary.unmapped > 1 ? 's' : ''}</span>}
                            {summary.unmapped > 0 && summary.missingJustification > 0 && <span>, </span>}
                            {summary.missingJustification > 0 && <span>{summary.missingJustification} missing justification{summary.missingJustification > 1 ? 's' : ''}</span>}
                        </div>
                    </div>
                    <button
                        className="btn btn-xs btn-danger"
                        onClick={() => setGapsOnly(true)}
                    >
                        Fix now
                    </button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px] max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                        type="text"
                        className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-800/60 border border-slate-600/50 rounded-full text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all"
                        placeholder="Search by code or title…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        id="soa-search"
                    />
                    {search && (
                        <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            onClick={() => setSearch('')}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    className={`btn ${gapsOnly ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={() => setGapsOnly(!gapsOnly)}
                    id="soa-gaps-only"
                >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {gapsOnly ? 'Showing gaps only' : 'Show gaps only'}
                </button>

                {(search || gapsOnly) && (
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => { setSearch(''); setGapsOnly(false); }}
                    >
                        <FilterX className="w-3.5 h-3.5" /> Clear
                    </button>
                )}

                <span className="text-xs text-slate-500 ml-auto">
                    {filteredEntries.length} of {report.entries.length} requirements
                </span>
            </div>

            {/* Table */}
            <div className="glass-card overflow-auto">
                <table className="data-table" id="soa-table">
                    <thead>
                        <tr>
                            <th className="w-24">Code</th>
                            <th>Requirement</th>
                            <th>Applicability</th>
                            <th>Status</th>
                            <th>Controls</th>
                            <th>Gaps</th>
                            {canEdit && <th className="w-20">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEntries.map(entry => (
                            <SoARow
                                key={entry.requirementId}
                                entry={entry}
                                expanded={expandedRow === entry.requirementId}
                                onToggle={() => setExpandedRow(expandedRow === entry.requirementId ? null : entry.requirementId)}
                                canEdit={canEdit}
                                onMap={() => setMapModal({ requirementId: entry.requirementId, requirementCode: entry.requirementCode })}
                                onJustify={(controlId, controlCode) => {
                                    setJustModal({ controlId, controlCode, requirementCode: entry.requirementCode });
                                    setJustText('');
                                }}
                                tenantSlug={tenantSlug}
                            />
                        ))}
                        {filteredEntries.length === 0 && (
                            <tr>
                                <td colSpan={canEdit ? 7 : 6} className="text-center text-slate-500 py-8">
                                    {gapsOnly ? 'No gaps found — all requirements are mapped with justifications!' : 'No matching requirements'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Map Control Modal */}
            {mapModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMapModal(null)}>
                    <div className="bg-slate-800 border border-slate-600/50 rounded-xl p-6 w-full max-w-md shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-white mb-1">Map Control to {mapModal.requirementCode}</h3>
                        <p className="text-xs text-slate-400 mb-4">Select a tenant control to map to this Annex A requirement.</p>

                        <input
                            type="text"
                            className="input w-full mb-3"
                            placeholder="Search controls…"
                            value={mapControlSearch}
                            onChange={e => setMapControlSearch(e.target.value)}
                            autoFocus
                        />

                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {mapFilteredControls.map(c => (
                                <button
                                    key={c.id}
                                    className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-700/60 transition-colors flex items-center justify-between"
                                    onClick={() => handleMapControl(c.id)}
                                    disabled={saving}
                                >
                                    <div>
                                        <span className="font-mono text-brand-400">{c.code || '—'}</span>
                                        <span className="ml-2 text-slate-200">{c.name}</span>
                                    </div>
                                    <span className={`badge ${c.status === 'IMPLEMENTED' ? 'badge-success' : 'badge-neutral'}`}>{c.status}</span>
                                </button>
                            ))}
                            {mapFilteredControls.length === 0 && (
                                <p className="text-xs text-slate-500 text-center py-4">No controls found</p>
                            )}
                        </div>

                        <div className="flex justify-end mt-4">
                            <button className="btn btn-ghost" onClick={() => setMapModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Justification Modal */}
            {justModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setJustModal(null)}>
                    <div className="bg-slate-800 border border-slate-600/50 rounded-xl p-6 w-full max-w-md shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-white mb-1">Add Justification</h3>
                        <p className="text-xs text-slate-400 mb-4">
                            Justify why control <span className="font-mono text-brand-400">{justModal.controlCode}</span> is not applicable for requirement {justModal.requirementCode}.
                        </p>

                        <textarea
                            className="input w-full min-h-[100px]"
                            placeholder="e.g. Fully remote company — no physical premises to secure."
                            value={justText}
                            onChange={e => setJustText(e.target.value)}
                            autoFocus
                        />

                        <div className="flex justify-end gap-2 mt-4">
                            <button className="btn btn-ghost" onClick={() => setJustModal(null)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveJustification}
                                disabled={saving || !justText.trim()}
                            >
                                {saving ? 'Saving…' : 'Save Justification'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Row Component ───

function SoARow({
    entry, expanded, onToggle, canEdit, onMap, onJustify, tenantSlug,
}: {
    entry: SoAEntryDTO;
    expanded: boolean;
    onToggle: () => void;
    canEdit: boolean;
    onMap: () => void;
    onJustify: (controlId: string, controlCode: string) => void;
    tenantSlug: string;
}) {
    const hasGap = entry.applicable === null || (
        entry.applicable === false &&
        entry.mappedControls.some(c => c.applicability === 'NOT_APPLICABLE' && !c.justification)
    );

    return (
        <>
            <tr className={`${hasGap ? 'bg-red-500/5' : ''} cursor-pointer hover:bg-slate-700/30`} onClick={onToggle}>
                <td className="text-xs font-mono text-brand-400">{entry.requirementCode}</td>
                <td className="text-sm text-white">
                    <div>{entry.requirementTitle}</div>
                    {entry.section && <div className="text-[10px] text-slate-500">{entry.section}</div>}
                </td>
                <td><ApplicabilityBadge value={entry.applicable} /></td>
                <td><StatusBadge value={entry.implementationStatus} /></td>
                <td className="text-xs text-slate-400">
                    {entry.mappedControls.length > 0 ? (
                        <span className="inline-flex items-center gap-1">
                            <Link2 className="w-3 h-3" /> {entry.mappedControls.length}
                        </span>
                    ) : '—'}
                </td>
                <td><GapBadges entry={entry} /></td>
                {canEdit && (
                    <td>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {entry.applicable === null && (
                                <button className="btn btn-xs btn-primary" onClick={onMap} title="Map control">
                                    <Plus className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </td>
                )}
            </tr>
            {expanded && entry.mappedControls.length > 0 && (
                <tr className="bg-slate-800/40">
                    <td colSpan={canEdit ? 7 : 6} className="p-0">
                        <div className="px-6 py-3 space-y-2">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Mapped Controls</div>
                            {entry.mappedControls.map(c => (
                                <div key={c.controlId} className="flex items-center justify-between text-xs bg-slate-900/40 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <a
                                            href={`/t/${tenantSlug}/controls/${c.controlId}`}
                                            className="font-mono text-brand-400 hover:underline"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {c.code || c.controlId.slice(0, 8)}
                                        </a>
                                        <span className="text-slate-200">{c.title}</span>
                                        <span className={`badge ${c.applicability === 'APPLICABLE' ? 'badge-success' : 'badge-neutral'}`}>
                                            {c.applicability}
                                        </span>
                                        <StatusBadge value={c.status} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {c.justification && (
                                            <span className="text-slate-400 max-w-[200px] truncate" title={c.justification}>
                                                {c.justification}
                                            </span>
                                        )}
                                        {c.applicability === 'NOT_APPLICABLE' && !c.justification && canEdit && (
                                            <button
                                                className="btn btn-xs btn-danger"
                                                onClick={(e) => { e.stopPropagation(); onJustify(c.controlId, c.code || c.controlId.slice(0, 8)); }}
                                                title="Add justification"
                                            >
                                                <MessageSquare className="w-3 h-3" /> Justify
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {entry.evidenceCount > 0 && (
                                <div className="text-[10px] text-slate-500">Evidence: {entry.evidenceCount} items</div>
                            )}
                            {entry.openTaskCount > 0 && (
                                <div className="text-[10px] text-amber-400">Open tasks: {entry.openTaskCount}</div>
                            )}
                            {entry.lastTestResult && (
                                <div className="text-[10px] text-slate-500">
                                    Last test: <span className={entry.lastTestResult === 'PASS' ? 'text-emerald-400' : 'text-red-400'}>{entry.lastTestResult}</span>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ─── Summary Card ───

function SummaryCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: 'danger' | 'warning' }) {
    const border = accent === 'danger' ? 'border-red-500/30' : accent === 'warning' ? 'border-amber-500/30' : 'border-slate-700/50';
    return (
        <div className={`glass-card px-4 py-3 border ${border}`}>
            <div className="flex items-center justify-between">
                {icon}
                <span className="text-xl font-bold text-white">{value}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">{label}</div>
        </div>
    );
}
