'use client';
import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantContext } from '@/lib/tenant-context-provider';

const STATUS_BADGE: Record<string, string> = {
    DRAFT: 'badge-neutral', SUBMITTED: 'badge-info', APPROVED: 'badge-success', REJECTED: 'badge-danger',
};

function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

type RetentionFilter = 'active' | 'expiring' | 'archived';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRetentionStatus(ev: any): { label: string; badge: string; icon: string } {
    if (ev.isArchived) return { label: 'Archived', badge: 'badge-neutral', icon: '📦' };
    if (ev.expiredAt) return { label: 'Expired', badge: 'badge-danger', icon: '⏰' };
    if (ev.retentionUntil) {
        const until = new Date(ev.retentionUntil);
        const daysLeft = Math.ceil((until.getTime() - Date.now()) / 86_400_000);
        if (daysLeft <= 0) return { label: 'Expired', badge: 'badge-danger', icon: '⏰' };
        if (daysLeft <= 30) return { label: `Expiring (${daysLeft}d)`, badge: 'badge-warning', icon: '⚠️' };
        return { label: 'Active', badge: 'badge-success', icon: '✅' };
    }
    return { label: 'No policy', badge: 'badge-neutral', icon: '—' };
}

export default function EvidencePage() {
    const apiUrl = useTenantApiUrl();
    const { permissions } = useTenantContext();
    const t = useTranslations('evidence');
    const tc = useTranslations('common');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [evidence, setEvidence] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [controls, setControls] = useState<any[]>([]);
    const [controlFilter, setControlFilter] = useState('');
    const [retentionFilter, setRetentionFilter] = useState<RetentionFilter>('active');
    const [showUpload, setShowUpload] = useState(false);
    const [showTextForm, setShowTextForm] = useState(false);
    const [textForm, setTextForm] = useState({ title: '', content: '', controlId: '', category: '', owner: '' });

    // Upload state
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadControlId, setUploadControlId] = useState('');
    const [uploadControlSearch, setUploadControlSearch] = useState('');
    const [uploadRetentionUntil, setUploadRetentionUntil] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Retention edit state
    const [editingRetention, setEditingRetention] = useState<string | null>(null);
    const [editRetentionDate, setEditRetentionDate] = useState('');

    const fetchEvidence = () => {
        fetch(apiUrl('/evidence')).then(r => r.json()).then(setEvidence);
    };

    useEffect(() => {
        fetchEvidence();
        fetch(apiUrl('/controls')).then(r => r.json()).then(setControls);
    }, [apiUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── File Upload ───

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) return;

        setUploading(true);
        setUploadError('');
        setUploadProgress(10);

        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            if (uploadTitle) formData.append('title', uploadTitle);
            if (uploadControlId) formData.append('controlId', uploadControlId);
            if (uploadRetentionUntil) formData.append('retentionUntil', new Date(uploadRetentionUntil).toISOString());

            setUploadProgress(30);

            const res = await fetch(apiUrl('/evidence/uploads'), {
                method: 'POST',
                body: formData,
            });

            setUploadProgress(80);

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Upload failed' }));
                throw new Error(err.error || err.message || 'Upload failed');
            }

            // If retentionUntil was set, update retention after upload
            const uploaded = await res.json();
            if (uploadRetentionUntil && uploaded?.id) {
                await fetch(apiUrl(`/evidence/${uploaded.id}/retention`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        retentionUntil: new Date(uploadRetentionUntil).toISOString(),
                        retentionPolicy: 'FIXED_DATE',
                    }),
                });
            }

            setUploadProgress(100);
            setUploadFile(null);
            setUploadTitle('');
            setUploadControlId('');
            setUploadControlSearch('');
            setUploadRetentionUntil('');
            setShowUpload(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            fetchEvidence();
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    // ─── Text/Link Evidence ───

    const createTextEvidence = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch(apiUrl('/evidence'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...textForm, type: 'TEXT' }),
        });
        if (res.ok) {
            setTextForm({ title: '', content: '', controlId: '', category: '', owner: '' });
            setShowTextForm(false);
            fetchEvidence();
        }
    };

    // ─── Review workflow ───

    const submitReview = async (id: string, action: string, comment: string = '') => {
        await fetch(apiUrl(`/evidence/${id}/review`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, comment }),
        });
        setEvidence(prev => prev.map(e => e.id === id ? { ...e, status: action === 'SUBMITTED' ? 'SUBMITTED' : action === 'APPROVED' ? 'APPROVED' : 'REJECTED' } : e));
    };

    // ─── Retention actions ───

    const archiveEvidence = async (id: string) => {
        await fetch(apiUrl(`/evidence/${id}/archive`), { method: 'POST' });
        fetchEvidence();
    };

    const unarchiveEvidence = async (id: string) => {
        await fetch(apiUrl(`/evidence/${id}/unarchive`), { method: 'POST' });
        fetchEvidence();
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
        fetchEvidence();
    };

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { DRAFT: t('draft'), SUBMITTED: t('submitted'), APPROVED: t('approved'), REJECTED: t('rejected') };
        return map[status] || status;
    };

    // ─── Control search filter ───
    const filteredControls = controls.filter(c => {
        const q = uploadControlSearch.toLowerCase();
        if (!q) return true;
        return (c.name || '').toLowerCase().includes(q)
            || (c.annexId || '').toLowerCase().includes(q)
            || (c.code || '').toLowerCase().includes(q);
    });

    // ─── Retention filter counts ───
    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 86_400_000);

    const activeEvidence = evidence.filter(ev => !ev.isArchived && !ev.expiredAt && !ev.deletedAt);
    const expiringEvidence = evidence.filter(ev => {
        if (ev.isArchived || ev.deletedAt) return false;
        if (!ev.retentionUntil) return false;
        const until = new Date(ev.retentionUntil);
        return until <= in30Days && until > now;
    });
    const archivedEvidence = evidence.filter(ev => ev.isArchived || ev.expiredAt);

    // ─── Filtered evidence list ───
    let displayEvidence = evidence.filter(ev => !ev.deletedAt);
    if (retentionFilter === 'active') {
        displayEvidence = activeEvidence;
    } else if (retentionFilter === 'expiring') {
        displayEvidence = expiringEvidence;
    } else if (retentionFilter === 'archived') {
        displayEvidence = archivedEvidence;
    }
    if (controlFilter) {
        displayEvidence = displayEvidence.filter(ev => ev.controlId === controlFilter);
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-slate-400 text-sm">{t('evidenceItems', { count: evidence.length })}</p>
                </div>
                {permissions.canWrite && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setShowUpload(!showUpload); setShowTextForm(false); }}
                            className="btn btn-primary"
                            id="upload-evidence-btn"
                        >
                            📤 Upload File
                        </button>
                        <button
                            onClick={() => { setShowTextForm(!showTextForm); setShowUpload(false); }}
                            className="btn btn-secondary"
                            id="add-text-evidence-btn"
                        >
                            {t('addEvidence')}
                        </button>
                    </div>
                )}
            </div>

            {/* File Upload Form */}
            {showUpload && permissions.canWrite && (
                <form onSubmit={handleUpload} className="glass-card p-6 space-y-4 animate-fadeIn" id="upload-form">
                    <h3 className="text-sm font-semibold text-white">📤 Upload Evidence File</h3>

                    {/* File picker */}
                    <div>
                        <label className="input-label">File *</label>
                        <div className="relative">
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="input w-full file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-500 file:text-white hover:file:bg-brand-400"
                                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                                required
                                id="file-input"
                                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.doc,.docx,.xlsx,.xls,.json,.zip"
                            />
                            {uploadFile && (
                                <p className="text-xs text-slate-400 mt-1">
                                    📎 {uploadFile.name} ({formatBytes(uploadFile.size)})
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {/* Title */}
                        <div>
                            <label className="input-label">Title</label>
                            <input
                                className="input w-full"
                                placeholder="Defaults to filename"
                                value={uploadTitle}
                                onChange={e => setUploadTitle(e.target.value)}
                                id="upload-title-input"
                            />
                        </div>

                        {/* Control selector with search */}
                        <div>
                            <label className="input-label">Link to Control</label>
                            <input
                                className="input w-full mb-1"
                                placeholder="Search controls..."
                                value={uploadControlSearch}
                                onChange={e => setUploadControlSearch(e.target.value)}
                                id="control-search-input"
                            />
                            <select
                                className="input w-full"
                                value={uploadControlId}
                                onChange={e => setUploadControlId(e.target.value)}
                                id="control-select"
                            >
                                <option value="">{tc('none')} — No control link</option>
                                {filteredControls.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.annexId || c.code || 'Custom'}: {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Retention date */}
                        <div>
                            <label className="input-label">📅 Retain until</label>
                            <input
                                type="date"
                                className="input w-full"
                                value={uploadRetentionUntil}
                                onChange={e => setUploadRetentionUntil(e.target.value)}
                                id="retention-date-input"
                                min={new Date().toISOString().split('T')[0]}
                            />
                            <p className="text-xs text-slate-500 mt-1">Optional — when should this evidence expire?</p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    {uploading && (
                        <div className="w-full bg-slate-700 rounded-full h-2">
                            <div
                                className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    )}

                    {/* Error */}
                    {uploadError && (
                        <div className="text-red-400 text-sm bg-red-900/20 rounded px-3 py-2" id="upload-error">
                            ❌ {uploadError}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={uploading || !uploadFile}
                            className="btn btn-primary"
                            id="submit-upload-btn"
                        >
                            {uploading ? '⏳ Uploading...' : '📤 Upload'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowUpload(false)}
                            className="btn btn-secondary"
                        >
                            {tc('cancel')}
                        </button>
                    </div>
                </form>
            )}

            {/* Text/Link Evidence Form (legacy) */}
            {showTextForm && permissions.canWrite && (
                <form onSubmit={createTextEvidence} className="glass-card p-6 space-y-4 animate-fadeIn" id="text-evidence-form">
                    <h3 className="text-sm font-semibold text-white">📝 Add Text/Link Evidence</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="input-label">{t('evidenceTitle')} *</label><input className="input w-full" required value={textForm.title} onChange={e => setTextForm(f => ({ ...f, title: e.target.value }))} /></div>
                        <div><label className="input-label">{t('control')}</label><select className="input w-full" value={textForm.controlId} onChange={e => setTextForm(f => ({ ...f, controlId: e.target.value }))}><option value="">{tc('none')}</option>{controls.map(c => <option key={c.id} value={c.id}>{c.annexId || 'Custom'}: {c.name}</option>)}</select></div>
                        <div><label className="input-label">{t('ownerLabel')}</label><input className="input w-full" value={textForm.owner} onChange={e => setTextForm(f => ({ ...f, owner: e.target.value }))} /></div>
                        <div><label className="input-label">Category</label><input className="input w-full" value={textForm.category} onChange={e => setTextForm(f => ({ ...f, category: e.target.value }))} /></div>
                        <div className="col-span-2"><label className="input-label">{t('content')}</label><textarea className="input w-full" value={textForm.content} onChange={e => setTextForm(f => ({ ...f, content: e.target.value }))} placeholder={t('contentPlaceholder')} /></div>
                    </div>
                    <div className="flex gap-2"><button type="submit" className="btn btn-primary">{t('createEvidence')}</button><button type="button" onClick={() => setShowTextForm(false)} className="btn btn-secondary">{tc('cancel')}</button></div>
                </form>
            )}

            {/* Retention filter tabs + Control filter */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-1" id="retention-tabs">
                    <button
                        onClick={() => setRetentionFilter('active')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${retentionFilter === 'active' ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        id="tab-active"
                    >
                        ✅ Active ({activeEvidence.length})
                    </button>
                    <button
                        onClick={() => setRetentionFilter('expiring')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${retentionFilter === 'expiring' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        id="tab-expiring"
                    >
                        ⚠️ Expiring ({expiringEvidence.length})
                    </button>
                    <button
                        onClick={() => setRetentionFilter('archived')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${retentionFilter === 'archived' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        id="tab-archived"
                    >
                        📦 Archived ({archivedEvidence.length})
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-500">Filter by control:</label>
                    <select
                        className="input w-48 text-sm"
                        value={controlFilter}
                        onChange={e => setControlFilter(e.target.value)}
                        id="evidence-control-filter"
                    >
                        <option value="">All</option>
                        {controls.map(c => (
                            <option key={c.id} value={c.id}>{c.annexId || c.code || 'Custom'}: {c.name}</option>
                        ))}
                    </select>
                    {controlFilter && (
                        <button className="text-xs text-brand-400 hover:underline" onClick={() => setControlFilter('')}>Clear</button>
                    )}
                </div>
            </div>

            {/* Archived warning */}
            {retentionFilter === 'archived' && archivedEvidence.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-3 text-sm text-amber-300 flex items-start gap-2">
                    <span className="text-lg">⚠️</span>
                    <div>
                        <strong>Archived evidence</strong> should not be used in active audit packs or compliance assessments.
                        Unarchive if you need to reuse this evidence.
                    </div>
                </div>
            )}

            {/* Evidence table */}
            <div className="glass-card overflow-hidden">
                <table className="data-table" id="evidence-table">
                    <thead>
                        <tr>
                            <th>{t('evidenceTitle')}</th>
                            <th>{t('type')}</th>
                            <th>{t('control')}</th>
                            <th>Retention</th>
                            <th>{t('status')}</th>
                            <th>{t('ownerLabel')}</th>
                            <th>{tc('actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayEvidence.map(ev => {
                            const rs = getRetentionStatus(ev);
                            return (
                            <tr key={ev.id} className={ev.isArchived ? 'opacity-60' : ''}>
                                <td className="font-medium text-white text-sm">
                                    <div>{ev.title}</div>
                                    {ev.fileName && ev.fileName !== ev.title && (
                                        <div className="text-xs text-slate-500">{ev.fileName}</div>
                                    )}
                                </td>
                                <td>
                                    <span className={`badge ${ev.type === 'FILE' ? 'badge-success' : 'badge-info'}`}>
                                        {ev.type === 'FILE' ? '📎 FILE' : ev.type}
                                    </span>
                                </td>
                                <td className="text-xs text-slate-400">
                                    {ev.control ? `${ev.control.annexId || ''} ${ev.control.name}` : '—'}
                                </td>
                                <td className="text-xs">
                                    <div className="flex items-center gap-1.5">
                                        <span className={`badge ${rs.badge}`} id={`retention-status-${ev.id}`}>
                                            {rs.icon} {rs.label}
                                        </span>
                                    </div>
                                    {ev.retentionUntil && !ev.isArchived && (
                                        <div className="text-slate-500 mt-0.5">{formatDate(ev.retentionUntil)}</div>
                                    )}
                                    {/* Inline retention editor */}
                                    {editingRetention === ev.id && (
                                        <div className="mt-2 flex gap-1 items-center">
                                            <input
                                                type="date"
                                                className="input text-xs py-0.5 px-1 w-32"
                                                value={editRetentionDate}
                                                onChange={e => setEditRetentionDate(e.target.value)}
                                                id={`retention-edit-${ev.id}`}
                                            />
                                            <button onClick={() => saveRetention(ev.id)} className="btn btn-sm btn-primary text-xs py-0.5 px-1.5">✓</button>
                                            <button onClick={() => setEditingRetention(null)} className="btn btn-sm btn-secondary text-xs py-0.5 px-1.5">✕</button>
                                        </div>
                                    )}
                                </td>
                                <td><span className={`badge ${STATUS_BADGE[ev.status]}`}>{statusLabel(ev.status)}</span></td>
                                <td className="text-xs">{ev.owner || '—'}</td>
                                <td>
                                    <div className="flex gap-1 flex-wrap">
                                        {/* Download */}
                                        {ev.type === 'FILE' && ev.fileRecordId && (
                                            <a
                                                href={apiUrl(`/evidence/files/${ev.fileRecordId}/download`)}
                                                className="btn btn-sm btn-secondary"
                                                download
                                                id={`download-${ev.id}`}
                                            >
                                                ⬇
                                            </a>
                                        )}
                                        {/* Retention actions — ADMIN/EDITOR only */}
                                        {permissions.canWrite && !ev.isArchived && (
                                            <button
                                                onClick={() => { setEditingRetention(ev.id); setEditRetentionDate(ev.retentionUntil ? ev.retentionUntil.split('T')[0] : ''); }}
                                                className="btn btn-sm btn-secondary"
                                                title="Edit retention date"
                                                id={`edit-retention-${ev.id}`}
                                            >
                                                📅
                                            </button>
                                        )}
                                        {permissions.canWrite && !ev.isArchived && (
                                            <button
                                                onClick={() => archiveEvidence(ev.id)}
                                                className="btn btn-sm btn-secondary"
                                                title="Archive this evidence"
                                                id={`archive-${ev.id}`}
                                            >
                                                📦
                                            </button>
                                        )}
                                        {permissions.canWrite && ev.isArchived && (
                                            <button
                                                onClick={() => unarchiveEvidence(ev.id)}
                                                className="btn btn-sm btn-primary"
                                                title="Unarchive this evidence"
                                                id={`unarchive-${ev.id}`}
                                            >
                                                📤 Unarchive
                                            </button>
                                        )}
                                        {/* Review actions */}
                                        {permissions.canWrite && ev.status === 'DRAFT' && (
                                            <button onClick={() => submitReview(ev.id, 'SUBMITTED')} className="btn btn-sm btn-secondary">{t('submitForReview')}</button>
                                        )}
                                        {permissions.canWrite && ev.status === 'SUBMITTED' && (
                                            <>
                                                <button onClick={() => submitReview(ev.id, 'APPROVED')} className="btn btn-sm btn-success">{t('approveEvidence')}</button>
                                                <button onClick={() => submitReview(ev.id, 'REJECTED', 'Needs improvement')} className="btn btn-sm btn-danger">{t('rejectEvidence')}</button>
                                            </>
                                        )}
                                        {permissions.canWrite && ev.status === 'REJECTED' && (
                                            <button onClick={() => submitReview(ev.id, 'SUBMITTED')} className="btn btn-sm btn-secondary">{t('submitForReview')}</button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                        {displayEvidence.length === 0 && (
                            <tr><td colSpan={7} className="text-center text-slate-500 py-8">
                                {retentionFilter === 'archived' ? 'No archived evidence' : retentionFilter === 'expiring' ? 'No evidence expiring soon' : t('noEvidence')}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
