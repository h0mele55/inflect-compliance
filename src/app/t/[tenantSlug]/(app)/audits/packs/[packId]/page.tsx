'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const ENTITY_ICON: Record<string, string> = {
    CONTROL: '🔧', POLICY: '📄', EVIDENCE: '📎', FILE: '📁', ISSUE: '⚠️',
    READINESS_REPORT: '📊', FRAMEWORK_COVERAGE: '📈',
};

export default function PackDetailPage() {
    const params = useParams();
    const tenantSlug = params.tenantSlug as string;
    const packId = params.packId as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [pack, setPack] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [freezing, setFreezing] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [cloning, setCloning] = useState(false);
    const router = useRouter();

    const loadPack = useCallback(() => {
        fetch(apiUrl(`/audits/packs/${packId}`))
            .then(r => r.ok ? r.json() : null)
            .then(setPack)
            .finally(() => setLoading(false));
    }, [apiUrl, packId]);

    useEffect(() => { loadPack(); }, [loadPack]);

    const freeze = async () => {
        setFreezing(true);
        try {
            const res = await fetch(apiUrl(`/audits/packs/${packId}?action=freeze`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            if (res.ok) loadPack();
            else {
                const err = await res.json();
                alert(err.message || 'Failed to freeze');
            }
        } finally { setFreezing(false); }
    };

    const share = async () => {
        setSharing(true);
        try {
            const res = await fetch(apiUrl(`/audits/packs/${packId}?action=share`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            if (res.ok) {
                const data = await res.json();
                const link = `${window.location.origin}/audit/shared/${data.token}`;
                setShareLink(link);
            }
        } finally { setSharing(false); }
    };

    if (loading) return <div className="p-8"><div className="glass-card animate-pulse h-64" /></div>;
    if (!pack) return <div className="p-8 text-center text-slate-400">Pack not found</div>;

    const isDraft = pack.status === 'DRAFT';
    const isFrozen = pack.status === 'FROZEN' || pack.status === 'EXPORTED';

    // Group items by entity type
    const grouped: Record<string, any[]> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pack.items || []).forEach((item: any) => {
        if (!grouped[item.entityType]) grouped[item.entityType] = [];
        grouped[item.entityType].push(item);
    });

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center gap-3">
                <Link href={`/t/${tenantSlug}/audits/cycles`} className="text-slate-400 hover:text-white transition">← Cycles</Link>
            </div>

            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-bold" id="pack-name">{pack.name}</h1>
                        <p className="text-sm text-slate-400">
                            {pack.cycle?.frameworkKey} · {pack._count?.items || 0} items ·
                            <span className={`badge ml-2 ${isDraft ? 'badge-neutral' : 'badge-info'}`} id="pack-status">{pack.status}</span>
                        </p>
                        {pack.frozenAt && (
                            <p className="text-xs text-slate-500 mt-1">
                                Frozen {new Date(pack.frozenAt).toLocaleString()} by {pack.frozenBy?.name || pack.frozenBy?.email || 'Admin'}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isDraft && (
                            <button onClick={freeze} disabled={freezing} className="btn btn-primary" id="freeze-pack-btn">
                                {freezing ? 'Freezing...' : '🔒 Freeze Pack'}
                            </button>
                        )}
                        {isFrozen && (
                            <button onClick={share} disabled={sharing} className="btn btn-primary" id="share-pack-btn">
                                {sharing ? 'Creating...' : '🔗 Generate Share Link'}
                            </button>
                        )}
                        {isFrozen && (
                            <button onClick={async () => {
                                setCloning(true);
                                try {
                                    const res = await fetch(apiUrl(`/audits/packs/${packId}?action=clone`), {
                                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
                                    });
                                    if (res.ok) {
                                        const cloned = await res.json();
                                        router.push(`/t/${tenantSlug}/audits/packs/${cloned.id}`);
                                    }
                                } finally { setCloning(false); }
                            }} disabled={cloning} className="btn btn-secondary" id="clone-pack-btn">
                                {cloning ? 'Cloning...' : '🔄 Clone for Retest'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Share Link */}
            {shareLink && (
                <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/5 animate-fadeIn" id="share-link-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-emerald-400">Share Link Generated</p>
                            <p className="text-xs text-slate-400 mt-1 break-all" id="share-link-url">{shareLink}</p>
                        </div>
                        <button onClick={() => { navigator.clipboard.writeText(shareLink); }}
                            className="btn btn-sm btn-secondary">Copy</button>
                    </div>
                </div>
            )}

            {/* Items grouped by type */}
            {Object.keys(grouped).length === 0 ? (
                <div className="glass-card p-12 text-center text-slate-400">
                    <p>No items in this pack yet.</p>
                </div>
            ) : (
                Object.entries(grouped).map(([type, items]) => (
                    <div key={type} className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <span>{ENTITY_ICON[type] || '📋'}</span>
                            <span>{type}</span>
                            <span className="text-slate-500">({items.length})</span>
                        </h3>
                        <div className="glass-card divide-y divide-slate-700/50">
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {items.map((item: any) => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                let snap: any = {};
                                try { snap = JSON.parse(item.snapshotJson || '{}'); } catch { /* */ }
                                const name = snap.code || snap.title || snap.name || item.entityId;
                                const status = snap.status || '';
                                return (
                                    <div key={item.id} className="p-3 flex items-center justify-between text-sm">
                                        <div className="flex-1 min-w-0">
                                            <span className="font-medium truncate block">{name}</span>
                                            {snap.description && <span className="text-xs text-slate-500 truncate block">{snap.description}</span>}
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            {status && <span className="badge badge-neutral text-xs">{status}</span>}
                                            {snap.taskCompletion && (
                                                <span className="text-xs text-slate-500">
                                                    Tasks: {snap.taskCompletion.done}/{snap.taskCompletion.total}
                                                </span>
                                            )}
                                            {snap.evidenceCount !== undefined && (
                                                <span className="text-xs text-slate-500">
                                                    Evidence: {snap.evidenceCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            {/* Export area (placeholder) */}
            {isFrozen && (
                <div className="glass-card p-6">
                    <h3 className="text-sm font-semibold mb-2">Exports</h3>
                    <div className="flex gap-2">
                        <a href={apiUrl(`/audits/packs/${packId}?action=export&format=json`)}
                            target="_blank" rel="noopener" className="btn btn-secondary btn-sm">📥 Export JSON</a>
                        <a href={apiUrl(`/audits/packs/${packId}?action=export&format=csv`)}
                            target="_blank" rel="noopener" className="btn btn-secondary btn-sm">📥 Export CSV</a>
                    </div>
                </div>
            )}
        </div>
    );
}
