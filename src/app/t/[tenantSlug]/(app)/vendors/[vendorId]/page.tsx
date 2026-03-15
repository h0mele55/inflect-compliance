'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { SkeletonDetailPage } from '@/components/ui/skeleton';

const STATUS_BADGE: Record<string, string> = {
    ACTIVE: 'badge-success', ONBOARDING: 'badge-info', OFFBOARDING: 'badge-warning', OFFBOARDED: 'badge-neutral',
};
const CRIT_BADGE: Record<string, string> = { LOW: 'badge-neutral', MEDIUM: 'badge-warning', HIGH: 'badge-danger', CRITICAL: 'badge-danger' };
const DOC_TYPE_LABELS: Record<string, string> = {
    CONTRACT: 'Contract', SOC2: 'SOC 2', ISO_CERT: 'ISO 27001', DPA: 'DPA',
    SECURITY_POLICY: 'Security Policy', PEN_TEST: 'Pen Test Report', OTHER: 'Other',
};
const DOC_TYPES = Object.keys(DOC_TYPE_LABELS);
const ASSESSMENT_STATUS_BADGE: Record<string, string> = {
    DRAFT: 'badge-neutral', IN_REVIEW: 'badge-warning', APPROVED: 'badge-success', REJECTED: 'badge-danger',
};

type Tab = 'overview' | 'documents' | 'assessments' | 'links' | 'bundles' | 'subprocessors';

export default function VendorDetailPage({ params }: { params: { tenantSlug: string; vendorId: string } }) {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions, role } = useTenantContext();
    const canWrite = permissions?.canWrite;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [vendor, setVendor] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('overview');
    const [docs, setDocs] = useState<any[]>([]);
    const [assessments, setAssessments] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [editing, setEditing] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editForm, setEditForm] = useState<any>({});

    // Doc form
    const [showDocForm, setShowDocForm] = useState(false);
    const [docForm, setDocForm] = useState({ type: 'CONTRACT', title: '', externalUrl: '', notes: '' });
    // Assessment start
    const [showStartAssessment, setShowStartAssessment] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    // Enrichment
    const [enriching, setEnriching] = useState(false);
    // Links
    const [links, setLinks] = useState<any[]>([]);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [linkForm, setLinkForm] = useState({ entityType: 'ASSET', entityId: '', relation: 'RELATED' });
    // Bundles
    const [bundles, setBundles] = useState<any[]>([]);
    const [bundleName, setBundleName] = useState('');
    // Subprocessors
    const [subs, setSubs] = useState<any[]>([]);
    const [subForm, setSubForm] = useState({ subprocessorVendorId: '', purpose: '' });

    const fetchVendor = useCallback(async () => {
        setLoading(true);
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}`));
        if (res.ok) {
            const v = await res.json();
            setVendor(v);
            setEditForm({ name: v.name, legalName: v.legalName || '', websiteUrl: v.websiteUrl || '', domain: v.domain || '', country: v.country || '', description: v.description || '', criticality: v.criticality, status: v.status });
        }
        setLoading(false);
    }, [apiUrl, params.vendorId]);

    const fetchDocs = useCallback(async () => {
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}/documents`));
        if (res.ok) setDocs(await res.json());
    }, [apiUrl, params.vendorId]);

    const fetchAssessments = useCallback(async () => {
        const res = await fetch(apiUrl(`/vendors/questionnaires/templates`));
        if (res.ok) setTemplates(await res.json());
        // We get assessments from vendor detail, but need a separate list
        // For now, we'll use a simple approach
        const aRes = await fetch(apiUrl(`/vendors/${params.vendorId}`));
        if (aRes.ok) {
            const v = await aRes.json();
            setAssessments(v.assessments || []);
        }
    }, [apiUrl, params.vendorId]);

    useEffect(() => { fetchVendor(); }, [fetchVendor]);
    useEffect(() => { if (tab === 'documents') fetchDocs(); }, [tab, fetchDocs]);
    useEffect(() => { if (tab === 'assessments') fetchAssessments(); }, [tab, fetchAssessments]);

    const fetchLinks = useCallback(async () => {
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}/links`));
        if (res.ok) setLinks(await res.json());
    }, [apiUrl, params.vendorId]);
    useEffect(() => { if (tab === 'links') fetchLinks(); }, [tab, fetchLinks]);

    const fetchBundles = useCallback(async () => {
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}/bundles`));
        if (res.ok) setBundles(await res.json());
    }, [apiUrl, params.vendorId]);
    useEffect(() => { if (tab === 'bundles') fetchBundles(); }, [tab, fetchBundles]);

    const fetchSubs = useCallback(async () => {
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}/subprocessors`));
        if (res.ok) setSubs(await res.json());
    }, [apiUrl, params.vendorId]);
    useEffect(() => { if (tab === 'subprocessors') fetchSubs(); }, [tab, fetchSubs]);

    const saveEdit = async () => {
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
        });
        if (res.ok) { setVendor(await res.json()); setEditing(false); }
    };

    const addDoc = async (e: React.FormEvent) => {
        e.preventDefault();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = { type: docForm.type };
        if (docForm.title) body.title = docForm.title;
        if (docForm.externalUrl) body.externalUrl = docForm.externalUrl;
        if (docForm.notes) body.notes = docForm.notes;
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}/documents`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) { setShowDocForm(false); setDocForm({ type: 'CONTRACT', title: '', externalUrl: '', notes: '' }); fetchDocs(); }
    };

    const removeDoc = async (docId: string) => {
        if (!confirm('Remove this document?')) return;
        await fetch(apiUrl(`/vendors/${params.vendorId}/documents/${docId}`), { method: 'DELETE' });
        fetchDocs();
    };

    const startAssessment = async () => {
        if (!selectedTemplate) return;
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}/assessments/start`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey: selectedTemplate }),
        });
        if (res.ok) {
            const assessment = await res.json();
            window.location.href = tenantHref(`/vendors/${params.vendorId}/assessment/${assessment.id}`);
        }
    };

    const handleEnrich = async () => {
        setEnriching(true);
        const res = await fetch(apiUrl(`/vendors/${params.vendorId}/enrich`), { method: 'POST' });
        if (res.ok) { setVendor(await res.json()); }
        setEnriching(false);
    };

    if (loading) return <SkeletonDetailPage />;
    if (!vendor) return <div className="text-red-400 py-8 text-center">Vendor not found</div>;

    const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href={tenantHref('/vendors')} className="text-slate-400 hover:text-white">← Back</Link>
                    <h1 className="text-2xl font-bold" id="vendor-detail-name">{vendor.name}</h1>
                    <span className={`badge ${STATUS_BADGE[vendor.status]}`}>{vendor.status}</span>
                    <span className={`badge ${CRIT_BADGE[vendor.criticality]}`}>{vendor.criticality}</span>
                </div>
                <div className="flex gap-2">
                    {canWrite && (vendor.domain || vendor.websiteUrl) && (
                        <button className="btn btn-secondary" onClick={handleEnrich} disabled={enriching} id="enrich-vendor-btn">
                            {enriching ? 'Enriching…' : '🔍 Auto-fill'}
                        </button>
                    )}
                    {canWrite && !editing && (
                        <button className="btn btn-secondary" onClick={() => setEditing(true)} id="edit-vendor-btn">Edit</button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-700">
                {(['overview', 'documents', 'assessments', 'links', 'bundles', 'subprocessors'] as Tab[]).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2 text-sm capitalize ${tab === t ? 'border-b-2 border-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}
                        id={`tab-${t}`}>
                        {t} {t === 'documents' ? `(${vendor._count?.documents || 0})` : t === 'assessments' ? `(${vendor._count?.assessments || 0})` : ''}
                    </button>
                ))}
            </div>

            {/* OVERVIEW */}
            {tab === 'overview' && !editing && (
                <div className="card p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-slate-400">Legal Name:</span> <span className="ml-2">{vendor.legalName || '—'}</span></div>
                        <div><span className="text-slate-400">Domain:</span> <span className="ml-2">{vendor.domain || '—'}</span></div>
                        <div><span className="text-slate-400">Website:</span> <span className="ml-2">{vendor.websiteUrl ? <a href={vendor.websiteUrl} target="_blank" className="text-blue-400 underline">{vendor.websiteUrl}</a> : '—'}</span></div>
                        <div><span className="text-slate-400">Country:</span> <span className="ml-2">{vendor.country || '—'}</span></div>
                        <div><span className="text-slate-400">Owner:</span> <span className="ml-2">{vendor.owner?.name || '—'}</span></div>
                        <div><span className="text-slate-400">Data Access:</span> <span className="ml-2">{vendor.dataAccess || '—'}</span></div>
                        <div><span className="text-slate-400">Sub-processor:</span> <span className="ml-2">{vendor.isSubprocessor ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-400">Inherent Risk:</span> <span className="ml-2">{vendor.inherentRisk ? <span className={`badge ${CRIT_BADGE[vendor.inherentRisk]}`}>{vendor.inherentRisk}</span> : '—'}</span></div>
                        <div><span className="text-slate-400">Next Review:</span> <span className="ml-2">{fmtDate(vendor.nextReviewAt)}</span></div>
                        <div><span className="text-slate-400">Contract Renewal:</span> <span className="ml-2">{fmtDate(vendor.contractRenewalAt)}</span></div>
                    </div>
                    {/* Enrichment Fields */}
                    {(vendor.privacyPolicyUrl || vendor.securityPageUrl || vendor.certificationsJson) && (
                        <div className="border-t border-slate-700 pt-3 mt-3 space-y-2">
                            <h3 className="text-sm font-semibold text-slate-300">Enrichment Data</h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                {vendor.privacyPolicyUrl && <div><span className="text-slate-400">Privacy Policy:</span> <a href={vendor.privacyPolicyUrl} target="_blank" className="text-blue-400 underline ml-1" id="enrichment-privacy">View ↗</a></div>}
                                {vendor.securityPageUrl && <div><span className="text-slate-400">Security Page:</span> <a href={vendor.securityPageUrl} target="_blank" className="text-blue-400 underline ml-1" id="enrichment-security">View ↗</a></div>}
                                {vendor.certificationsJson && Array.isArray(vendor.certificationsJson) && (
                                    <div className="col-span-2"><span className="text-slate-400">Certifications:</span> {(vendor.certificationsJson as string[]).map((c: string) => <span key={c} className="badge badge-info ml-1">{c}</span>)}</div>
                                )}
                            </div>
                            {vendor.enrichmentLastRunAt && <p className="text-xs text-slate-500">Last enriched: {fmtDate(vendor.enrichmentLastRunAt)} ({vendor.enrichmentStatus})</p>}
                        </div>
                    )}
                    {vendor.description && <div className="text-sm text-slate-300 border-t border-slate-700 pt-3 mt-3">{vendor.description}</div>}
                </div>
            )}

            {/* EDIT FORM */}
            {tab === 'overview' && editing && canWrite && (
                <div className="card p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Name</label>
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            <input className="input w-full" value={editForm.name} onChange={e => setEditForm((p: any) => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Legal Name</label>
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            <input className="input w-full" value={editForm.legalName} onChange={e => setEditForm((p: any) => ({ ...p, legalName: e.target.value }))} />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Status</label>
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            <select className="input w-full" value={editForm.status} onChange={e => setEditForm((p: any) => ({ ...p, status: e.target.value }))}>
                                {['ACTIVE', 'ONBOARDING', 'OFFBOARDING', 'OFFBOARDED'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Criticality</label>
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            <select className="input w-full" value={editForm.criticality} onChange={e => setEditForm((p: any) => ({ ...p, criticality: e.target.value }))}>
                                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Description</label>
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        <textarea className="input w-full h-20" value={editForm.description} onChange={e => setEditForm((p: any) => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="flex gap-3">
                        <button className="btn btn-primary" onClick={saveEdit} id="save-vendor-btn">Save</button>
                        <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* DOCUMENTS */}
            {tab === 'documents' && (
                <div className="space-y-4">
                    {canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary" onClick={() => setShowDocForm(!showDocForm)} id="add-doc-btn">
                                {showDocForm ? 'Cancel' : '+ Add Document'}
                            </button>
                        </div>
                    )}
                    {showDocForm && canWrite && (
                        <form onSubmit={addDoc} className="card p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Type</label>
                                    <select className="input w-full" value={docForm.type} onChange={e => setDocForm(p => ({ ...p, type: e.target.value }))} id="doc-type-select">
                                        {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Title</label>
                                    <input className="input w-full" value={docForm.title} onChange={e => setDocForm(p => ({ ...p, title: e.target.value }))} id="doc-title-input" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">External URL</label>
                                <input className="input w-full" type="url" value={docForm.externalUrl} onChange={e => setDocForm(p => ({ ...p, externalUrl: e.target.value }))} placeholder="https://..." id="doc-url-input" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Notes</label>
                                <input className="input w-full" value={docForm.notes} onChange={e => setDocForm(p => ({ ...p, notes: e.target.value }))} id="doc-notes-input" />
                            </div>
                            <button type="submit" className="btn btn-primary" id="submit-doc-btn">Add Document</button>
                        </form>
                    )}
                    <div className="card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700 text-left text-xs uppercase text-slate-400">
                                    <th className="p-3">Type</th>
                                    <th className="p-3">Title</th>
                                    <th className="p-3">Valid To</th>
                                    <th className="p-3">Uploaded By</th>
                                    <th className="p-3">Link</th>
                                    {canWrite && <th className="p-3"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {docs.map(d => (
                                    <tr key={d.id} className="border-b border-slate-800">
                                        <td className="p-3"><span className="badge badge-info">{DOC_TYPE_LABELS[d.type] || d.type}</span></td>
                                        <td className="p-3">{d.title || '—'}</td>
                                        <td className="p-3">{d.validTo ? new Date(d.validTo).toLocaleDateString() : '—'}</td>
                                        <td className="p-3 text-slate-400">{d.uploadedBy?.name || '—'}</td>
                                        <td className="p-3">
                                            {d.externalUrl && <a href={d.externalUrl} target="_blank" className="text-blue-400 underline text-xs">Open ↗</a>}
                                        </td>
                                        {canWrite && <td className="p-3"><button className="text-red-400 text-xs hover:underline" onClick={() => removeDoc(d.id)}>Remove</button></td>}
                                    </tr>
                                ))}
                                {docs.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-8">No documents</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ASSESSMENTS */}
            {tab === 'assessments' && (
                <div className="space-y-4">
                    {canWrite && (
                        <div className="flex items-center gap-3 justify-end">
                            {!showStartAssessment ? (
                                <button className="btn btn-primary" onClick={() => setShowStartAssessment(true)} id="start-assessment-btn">
                                    + Start Assessment
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <select className="input w-48" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} id="template-select">
                                        <option value="">Select template…</option>
                                        {templates.map(t => <option key={t.key} value={t.key}>{t.name} ({t._count?.questions || 0} Q)</option>)}
                                    </select>
                                    <button className="btn btn-primary" onClick={startAssessment} disabled={!selectedTemplate} id="confirm-start-assessment">Start</button>
                                    <button className="btn btn-secondary" onClick={() => setShowStartAssessment(false)}>Cancel</button>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700 text-left text-xs uppercase text-slate-400">
                                    <th className="p-3">Template</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Score</th>
                                    <th className="p-3">Risk Rating</th>
                                    <th className="p-3">Started</th>
                                    <th className="p-3">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {assessments.map((a: any) => (
                                    <tr key={a.id} className="border-b border-slate-800">
                                        <td className="p-3">{a.template?.name || '—'}</td>
                                        <td className="p-3"><span className={`badge ${ASSESSMENT_STATUS_BADGE[a.status]}`}>{a.status}</span></td>
                                        <td className="p-3">{a.score != null ? a.score.toFixed(1) : '—'}</td>
                                        <td className="p-3">{a.riskRating ? <span className={`badge ${CRIT_BADGE[a.riskRating]}`}>{a.riskRating}</span> : '—'}</td>
                                        <td className="p-3 text-slate-400">{new Date(a.startedAt).toLocaleDateString()}</td>
                                        <td className="p-3">
                                            <Link href={tenantHref(`/vendors/${params.vendorId}/assessment/${a.id}`)} className="text-blue-400 hover:underline text-xs" id={`open-assessment-${a.id}`}>
                                                Open →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {assessments.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-8">No assessments</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* LINKS / TRACEABILITY */}
            {tab === 'links' && (
                <div className="space-y-4">
                    {canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary" onClick={() => setShowLinkForm(!showLinkForm)} id="add-link-btn">
                                {showLinkForm ? 'Cancel' : '+ Link Entity'}
                            </button>
                        </div>
                    )}
                    {showLinkForm && canWrite && (
                        <div className="card p-4 flex items-end gap-3">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Type</label>
                                <select className="input" value={linkForm.entityType} onChange={e => setLinkForm(p => ({ ...p, entityType: e.target.value }))} id="link-type">
                                    <option value="ASSET">Asset</option><option value="RISK">Risk</option>
                                    <option value="ISSUE">Issue</option><option value="CONTROL">Control</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Entity ID</label>
                                <input className="input w-48" value={linkForm.entityId} onChange={e => setLinkForm(p => ({ ...p, entityId: e.target.value }))} id="link-entity-id" placeholder="Paste ID" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Relation</label>
                                <select className="input" value={linkForm.relation} onChange={e => setLinkForm(p => ({ ...p, relation: e.target.value }))} id="link-relation">
                                    <option value="RELATED">Related</option><option value="USES">Uses</option>
                                    <option value="MITIGATES">Mitigates</option><option value="STORES_DATA_FOR">Stores Data</option>
                                </select>
                            </div>
                            <button className="btn btn-primary" id="submit-link-btn" onClick={async () => {
                                await fetch(apiUrl(`/vendors/${params.vendorId}/links`), {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(linkForm),
                                });
                                setShowLinkForm(false); setLinkForm({ entityType: 'ASSET', entityId: '', relation: 'RELATED' }); fetchLinks();
                            }}>Add</button>
                        </div>
                    )}
                    {['ASSET', 'RISK', 'ISSUE', 'CONTROL'].map(type => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const typeLinks = links.filter((l: any) => l.entityType === type);
                        if (typeLinks.length === 0) return null;
                        return (
                            <div key={type} className="card p-4 space-y-2">
                                <h3 className="text-sm font-semibold text-slate-300">{type}s ({typeLinks.length})</h3>
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {typeLinks.map((l: any) => (
                                    <div key={l.id} className="flex items-center justify-between text-sm border-b border-slate-800 py-1">
                                        <span><code className="text-xs text-blue-400">{l.entityId}</code> <span className="badge badge-neutral text-xs ml-1">{l.relation}</span></span>
                                        {canWrite && <button className="text-red-400 text-xs" onClick={async () => {
                                            await fetch(apiUrl(`/vendors/${params.vendorId}/links/${l.id}`), { method: 'DELETE' }); fetchLinks();
                                        }}>Remove</button>}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                    {links.length === 0 && <div className="card p-6 text-center text-slate-500">No linked entities</div>}
                </div>
            )}

            {/* EVIDENCE BUNDLES */}
            {tab === 'bundles' && (
                <div className="space-y-4">
                    {canWrite && (
                        <div className="flex items-center gap-2 justify-end">
                            <input className="input w-48" placeholder="Bundle name…" value={bundleName}
                                onChange={e => setBundleName(e.target.value)} id="bundle-name-input" />
                            <button className="btn btn-primary" disabled={!bundleName} id="create-bundle-btn" onClick={async () => {
                                await fetch(apiUrl(`/vendors/${params.vendorId}/bundles`), {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: bundleName }),
                                });
                                setBundleName(''); fetchBundles();
                            }}>+ New Bundle</button>
                        </div>
                    )}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {bundles.map((b: any) => (
                        <div key={b.id} className="card p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-medium">{b.name}</span>
                                    <span className="ml-2 text-xs text-slate-400">{b._count?.items || 0} items</span>
                                    {b.frozenAt && <span className="badge badge-success ml-2">🔒 Frozen</span>}
                                </div>
                                {canWrite && !b.frozenAt && (
                                    <button className="btn btn-secondary text-xs" id={`freeze-bundle-${b.id}`} onClick={async () => {
                                        if (!confirm('Freeze this bundle? Items become immutable.')) return;
                                        await fetch(apiUrl(`/vendors/${params.vendorId}/bundles/${b.id}?action=freeze`), { method: 'POST' });
                                        fetchBundles();
                                    }}>🧳 Freeze</button>
                                )}
                            </div>
                            <div className="text-xs text-slate-400">Created by {b.createdBy?.name || '—'} on {new Date(b.createdAt).toLocaleDateString()}</div>
                        </div>
                    ))}
                    {bundles.length === 0 && <div className="card p-6 text-center text-slate-500">No evidence bundles</div>}
                </div>
            )}

            {/* SUBPROCESSORS */}
            {tab === 'subprocessors' && (
                <div className="space-y-4">
                    {canWrite && (
                        <div className="card p-4 flex items-end gap-3">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Subprocessor Vendor ID</label>
                                <input className="input w-48" value={subForm.subprocessorVendorId}
                                    onChange={e => setSubForm(p => ({ ...p, subprocessorVendorId: e.target.value }))} id="sub-vendor-id" placeholder="Paste vendor ID" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Purpose</label>
                                <input className="input w-48" value={subForm.purpose}
                                    onChange={e => setSubForm(p => ({ ...p, purpose: e.target.value }))} id="sub-purpose" placeholder="e.g. Data hosting" />
                            </div>
                            <button className="btn btn-primary" disabled={!subForm.subprocessorVendorId} id="add-subprocessor-btn" onClick={async () => {
                                await fetch(apiUrl(`/vendors/${params.vendorId}/subprocessors`), {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(subForm),
                                });
                                setSubForm({ subprocessorVendorId: '', purpose: '' }); fetchSubs();
                            }}>+ Add</button>
                        </div>
                    )}
                    <div className="card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b border-slate-700 text-left text-xs uppercase text-slate-400">
                                <th className="p-3">Subprocessor</th><th className="p-3">Country</th>
                                <th className="p-3">Criticality</th><th className="p-3">Risk</th>
                                <th className="p-3">Purpose</th>
                                {canWrite && <th className="p-3"></th>}
                            </tr></thead>
                            <tbody>
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {subs.map((s: any) => (
                                    <tr key={s.id} className="border-b border-slate-800">
                                        <td className="p-3 font-medium">{s.subprocessor?.name || s.subprocessorVendorId}</td>
                                        <td className="p-3 text-slate-400">{s.subprocessor?.country || s.country || '—'}</td>
                                        <td className="p-3"><span className={`badge ${CRIT_BADGE[s.subprocessor?.criticality] || 'badge-neutral'}`}>{s.subprocessor?.criticality || '—'}</span></td>
                                        <td className="p-3">{s.subprocessor?.inherentRisk ? <span className={`badge ${CRIT_BADGE[s.subprocessor.inherentRisk]}`}>{s.subprocessor.inherentRisk}</span> : '—'}</td>
                                        <td className="p-3 text-slate-400 text-xs">{s.purpose || '—'}</td>
                                        {canWrite && <td className="p-3"><button className="text-red-400 text-xs" onClick={async () => {
                                            await fetch(apiUrl(`/vendors/${params.vendorId}/subprocessors?relationId=${s.id}`), { method: 'DELETE' }); fetchSubs();
                                        }}>Remove</button></td>}
                                    </tr>
                                ))}
                                {subs.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-8">No subprocessors</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
