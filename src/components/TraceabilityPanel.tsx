'use client';
import { useState, useEffect, useCallback } from 'react';

interface TraceabilityPanelProps {
    apiBase: string;            // e.g. /api/t/acme-corp
    entityType: 'control' | 'risk' | 'asset';
    entityId: string;
    canWrite: boolean;
    tenantHref: (path: string) => string;
}

const RISK_STATUS_BADGE: Record<string, string> = {
    OPEN: 'badge-danger', MITIGATING: 'badge-warning', CLOSED: 'badge-success', ACCEPTED: 'badge-info',
};

export default function TraceabilityPanel({ apiBase, entityType, entityId, canWrite, tenantHref }: TraceabilityPanelProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Add forms
    const [showAddRisk, setShowAddRisk] = useState(false);
    const [showAddControl, setShowAddControl] = useState(false);
    const [showAddAsset, setShowAddAsset] = useState(false);
    const [addId, setAddId] = useState('');
    const [addRationale, setAddRationale] = useState('');
    const [saving, setSaving] = useState(false);

    // Available items for dropdown
    const [availableRisks, setAvailableRisks] = useState<any[]>([]);
    const [availableControls, setAvailableControls] = useState<any[]>([]);
    const [availableAssets, setAvailableAssets] = useState<any[]>([]);

    const traceUrl = entityType === 'control'
        ? `${apiBase}/controls/${entityId}/traceability`
        : entityType === 'risk'
            ? `${apiBase}/risks/${entityId}/traceability`
            : `${apiBase}/assets/${entityId}/traceability`;

    const fetchData = useCallback(() => {
        setLoading(true);
        fetch(traceUrl).then(r => r.ok ? r.json() : null).then(setData).finally(() => setLoading(false));
    }, [traceUrl]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Fetch available items when forms open
    useEffect(() => {
        if (showAddRisk) fetch(`${apiBase}/risks`).then(r => r.ok ? r.json() : []).then(d => setAvailableRisks(Array.isArray(d) ? d : d.risks || []));
    }, [showAddRisk, apiBase]);
    useEffect(() => {
        if (showAddControl) fetch(`${apiBase}/controls`).then(r => r.ok ? r.json() : []).then(d => setAvailableControls(Array.isArray(d) ? d : d.controls || []));
    }, [showAddControl, apiBase]);
    useEffect(() => {
        if (showAddAsset) fetch(`${apiBase}/assets`).then(r => r.ok ? r.json() : []).then(d => setAvailableAssets(Array.isArray(d) ? d : d.assets || []));
    }, [showAddAsset, apiBase]);

    const handleLink = async (type: 'risk' | 'control' | 'asset') => {
        if (!addId) return;
        setSaving(true);
        let url = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any = {};
        if (entityType === 'control' && type === 'risk') {
            url = `${apiBase}/controls/${entityId}/risks`;
            body = { riskId: addId, rationale: addRationale || undefined };
        } else if (entityType === 'control' && type === 'asset') {
            url = `${apiBase}/assets/${addId}/controls`;
            body = { controlId: entityId, rationale: addRationale || undefined };
        } else if (entityType === 'risk' && type === 'control') {
            url = `${apiBase}/controls/${addId}/risks`;
            body = { riskId: entityId, rationale: addRationale || undefined };
        } else if (entityType === 'risk' && type === 'asset') {
            url = `${apiBase}/assets/${addId}/risks`;
            body = { riskId: entityId, rationale: addRationale || undefined };
        } else if (entityType === 'asset' && type === 'control') {
            url = `${apiBase}/assets/${entityId}/controls`;
            body = { controlId: addId, rationale: addRationale || undefined };
        } else if (entityType === 'asset' && type === 'risk') {
            url = `${apiBase}/assets/${entityId}/risks`;
            body = { riskId: addId, rationale: addRationale || undefined };
        }
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { fetchData(); setAddId(''); setAddRationale(''); setShowAddRisk(false); setShowAddControl(false); setShowAddAsset(false); }
        setSaving(false);
    };

    const handleUnlink = async (type: 'risk' | 'control' | 'asset', linkedId: string) => {
        let url = '';
        if (entityType === 'control' && type === 'risk') url = `${apiBase}/controls/${entityId}/risks/${linkedId}`;
        else if (entityType === 'control' && type === 'asset') url = `${apiBase}/assets/${linkedId}/controls/${entityId}`;
        else if (entityType === 'risk' && type === 'control') url = `${apiBase}/controls/${linkedId}/risks/${entityId}`;
        else if (entityType === 'risk' && type === 'asset') url = `${apiBase}/assets/${linkedId}/risks/${entityId}`;
        else if (entityType === 'asset' && type === 'control') url = `${apiBase}/assets/${entityId}/controls/${linkedId}`;
        else if (entityType === 'asset' && type === 'risk') url = `${apiBase}/assets/${entityId}/risks/${linkedId}`;
        await fetch(url, { method: 'DELETE' });
        fetchData();
    };

    if (loading) return <div className="p-6 text-center text-slate-500 animate-pulse">Loading traceability...</div>;
    if (!data) return <div className="p-6 text-center text-slate-500">Failed to load traceability data</div>;

    const risks = data.risks || [];
    const controls = data.controls || [];
    const assets = data.assets || [];

    // Determine which sections to show based on entity type
    const showRisks = entityType === 'control' || entityType === 'asset';
    const showControls = entityType === 'risk' || entityType === 'asset';
    const showAssets = entityType === 'control' || entityType === 'risk';

    return (
        <div className="space-y-6" id="traceability-panel">
            {/* Risks section */}
            {showRisks && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-white">{entityType === 'control' ? '🛡️ Mitigates Risks' : '⚠️ Associated Risks'} ({risks.length})</h3>
                        {canWrite && (
                            <button className="btn btn-primary text-xs" onClick={() => { setShowAddRisk(!showAddRisk); setAddId(''); }} id="add-risk-link-btn">+ Link Risk</button>
                        )}
                    </div>
                    {showAddRisk && canWrite && (
                        <div className="glass-card p-3 mb-3 space-y-2">
                            <select className="input w-full text-sm" value={addId} onChange={e => setAddId(e.target.value)} id="risk-select">
                                <option value="">Select risk...</option>
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {availableRisks.map((r: any) => <option key={r.id} value={r.id}>{r.title} ({r.status})</option>)}
                            </select>
                            <input type="text" className="input w-full text-sm" placeholder="Rationale (optional)" value={addRationale} onChange={e => setAddRationale(e.target.value)} />
                            <button className="btn btn-primary text-xs" disabled={!addId || saving} onClick={() => handleLink('risk')} id="confirm-risk-link">
                                {saving ? 'Linking...' : 'Link'}
                            </button>
                        </div>
                    )}
                    <div className="glass-card overflow-hidden">
                        {risks.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm" id="no-risks">No risks linked</div>
                        ) : (
                            <table className="data-table" id="linked-risks-table">
                                <thead><tr><th>Risk</th><th>Status</th><th>Score</th><th>Rationale</th>{canWrite && <th>Actions</th>}</tr></thead>
                                <tbody>
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {risks.map((l: any) => {
                                        const r = l.risk;
                                        return (
                                            <tr key={l.id}>
                                                <td className="text-sm text-slate-300">{r?.title || '—'}</td>
                                                <td><span className={`badge ${RISK_STATUS_BADGE[r?.status] || 'badge-neutral'} text-xs`}>{r?.status || '—'}</span></td>
                                                <td className="text-sm text-white font-medium">{r?.score ?? '—'}</td>
                                                <td className="text-xs text-slate-400">{l.rationale || '—'}</td>
                                                {canWrite && (
                                                    <td><button className="text-red-400 text-xs hover:text-red-300" onClick={() => handleUnlink('risk', r?.id)} id={`unlink-risk-${r?.id}`}>✕</button></td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Controls section */}
            {showControls && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-white">{entityType === 'risk' ? '🛡️ Mitigated by Controls' : '🔒 Covered by Controls'} ({controls.length})</h3>
                        {canWrite && (
                            <button className="btn btn-primary text-xs" onClick={() => { setShowAddControl(!showAddControl); setAddId(''); }} id="add-control-link-btn">+ Link Control</button>
                        )}
                    </div>
                    {showAddControl && canWrite && (
                        <div className="glass-card p-3 mb-3 space-y-2">
                            <select className="input w-full text-sm" value={addId} onChange={e => setAddId(e.target.value)} id="control-select">
                                <option value="">Select control...</option>
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {availableControls.map((c: any) => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name} ({c.status})</option>)}
                            </select>
                            <input type="text" className="input w-full text-sm" placeholder="Rationale (optional)" value={addRationale} onChange={e => setAddRationale(e.target.value)} />
                            <button className="btn btn-primary text-xs" disabled={!addId || saving} onClick={() => handleLink('control')} id="confirm-control-link">
                                {saving ? 'Linking...' : 'Link'}
                            </button>
                        </div>
                    )}
                    <div className="glass-card overflow-hidden">
                        {controls.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm" id="no-controls">No controls linked</div>
                        ) : (
                            <table className="data-table" id="linked-controls-table">
                                <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Rationale</th>{canWrite && <th>Actions</th>}</tr></thead>
                                <tbody>
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {controls.map((l: any) => {
                                        const c = l.control;
                                        return (
                                            <tr key={l.id}>
                                                <td className="font-mono text-xs text-brand-300">{c?.code || '—'}</td>
                                                <td className="text-sm text-slate-300">{c?.name || '—'}</td>
                                                <td><span className="badge badge-info text-xs">{c?.status || '—'}</span></td>
                                                <td className="text-xs text-slate-400">{l.rationale || '—'}</td>
                                                {canWrite && (
                                                    <td><button className="text-red-400 text-xs hover:text-red-300" onClick={() => handleUnlink('control', c?.id)} id={`unlink-control-${c?.id}`}>✕</button></td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Assets section */}
            {showAssets && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-white">{entityType === 'control' ? '📦 Covers Assets' : '📦 Affects Assets'} ({assets.length})</h3>
                        {canWrite && (
                            <button className="btn btn-primary text-xs" onClick={() => { setShowAddAsset(!showAddAsset); setAddId(''); }} id="add-asset-link-btn">+ Link Asset</button>
                        )}
                    </div>
                    {showAddAsset && canWrite && (
                        <div className="glass-card p-3 mb-3 space-y-2">
                            <select className="input w-full text-sm" value={addId} onChange={e => setAddId(e.target.value)} id="asset-select">
                                <option value="">Select asset...</option>
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {availableAssets.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                            </select>
                            <input type="text" className="input w-full text-sm" placeholder="Rationale (optional)" value={addRationale} onChange={e => setAddRationale(e.target.value)} />
                            <button className="btn btn-primary text-xs" disabled={!addId || saving} onClick={() => handleLink('asset')} id="confirm-asset-link">
                                {saving ? 'Linking...' : 'Link'}
                            </button>
                        </div>
                    )}
                    <div className="glass-card overflow-hidden">
                        {assets.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm" id="no-assets">No assets linked</div>
                        ) : (
                            <table className="data-table" id="linked-assets-table">
                                <thead><tr><th>Name</th><th>Type</th><th>Criticality</th><th>Rationale</th>{canWrite && <th>Actions</th>}</tr></thead>
                                <tbody>
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {assets.map((l: any) => {
                                        const a = l.asset;
                                        return (
                                            <tr key={l.id}>
                                                <td className="text-sm text-slate-300">{a?.name || '—'}</td>
                                                <td className="text-xs"><span className="badge badge-info">{a?.type || '—'}</span></td>
                                                <td className="text-xs">{a?.criticality ? <span className={`badge ${a.criticality === 'HIGH' ? 'badge-danger' : a.criticality === 'MEDIUM' ? 'badge-warning' : 'badge-neutral'}`}>{a.criticality}</span> : '—'}</td>
                                                <td className="text-xs text-slate-400">{l.rationale || '—'}</td>
                                                {canWrite && (
                                                    <td><button className="text-red-400 text-xs hover:text-red-300" onClick={() => handleUnlink('asset', a?.id)} id={`unlink-asset-${a?.id}`}>✕</button></td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
