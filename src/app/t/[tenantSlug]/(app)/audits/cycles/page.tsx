'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const FW_META: Record<string, { icon: string; label: string; color: string }> = {
    ISO27001: { icon: '🛡️', label: 'ISO/IEC 27001:2022', color: 'from-indigo-500 to-purple-600' },
    NIS2: { icon: '🇪🇺', label: 'NIS2 Directive', color: 'from-blue-500 to-cyan-600' },
};

const STATUS_BADGE: Record<string, string> = {
    PLANNING: 'badge-neutral', IN_PROGRESS: 'badge-info', READY: 'badge-success', COMPLETE: 'badge-warning',
};

export default function AuditCyclesPage() {
    const params = useParams();
    const router = useRouter();
    const tenantSlug = params.tenantSlug as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    const [cycles, setCycles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ frameworkKey: 'ISO27001', frameworkVersion: '2022', name: '' });

    useEffect(() => {
        fetch(apiUrl('/audits/cycles'))
            .then(r => r.ok ? r.json() : [])
            .then(setCycles)
            .finally(() => setLoading(false));
    }, [apiUrl]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        const version = form.frameworkKey === 'NIS2' ? 'EU_2022_2555' : '2022';
        const res = await fetch(apiUrl('/audits/cycles'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, frameworkVersion: version }),
        });
        if (res.ok) {
            const cycle = await res.json();
            router.push(`/t/${tenantSlug}/audits/cycles/${cycle.id}`);
        }
    };

    if (loading) return (
        <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3].map(i => <div key={i} className="glass-card animate-pulse h-40" />)}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Audit Readiness</h1>
                    <p className="text-slate-400 text-sm">{cycles.length} audit cycle{cycles.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="btn btn-primary" id="create-cycle-btn">
                    {showForm ? 'Cancel' : '+ New Audit Cycle'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={create} className="glass-card p-6 space-y-4 animate-fadeIn" id="cycle-form">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="input-label">Framework *</label>
                            <select className="input w-full" value={form.frameworkKey}
                                onChange={e => setForm(f => ({ ...f, frameworkKey: e.target.value }))} id="fw-select">
                                <option value="ISO27001">🛡️ ISO/IEC 27001:2022</option>
                                <option value="NIS2">🇪🇺 NIS2 Directive (EU 2022/2555)</option>
                            </select>
                        </div>
                        <div>
                            <label className="input-label">Cycle Name *</label>
                            <input className="input w-full" required value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} id="cycle-name-input"
                                placeholder="e.g. ISO27001 Recertification 2025" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="btn btn-primary" id="submit-cycle-btn">Create Cycle</button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
                    </div>
                </form>
            )}

            {cycles.length === 0 && !showForm ? (
                <div className="glass-card p-12 text-center">
                    <div className="text-4xl mb-4">📋</div>
                    <h3 className="text-lg font-semibold mb-2">No audit cycles yet</h3>
                    <p className="text-slate-400 text-sm mb-4">Create your first audit cycle for ISO 27001 or NIS2</p>
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">+ New Audit Cycle</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cycles.map(c => {
                        const meta = FW_META[c.frameworkKey] || { icon: '📋', label: c.frameworkKey, color: 'from-gray-500 to-gray-600' };
                        return (
                            <Link key={c.id} href={`/t/${tenantSlug}/audits/cycles/${c.id}`} id={`cycle-link-${c.id}`}
                                className="glass-card p-6 hover:bg-slate-700/30 transition group">
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-lg`}>
                                        {meta.icon}
                                    </div>
                                    <span className={`badge ${STATUS_BADGE[c.status] || 'badge-neutral'}`}>{c.status}</span>
                                </div>
                                <h3 className="font-semibold text-sm group-hover:text-white transition">{c.name}</h3>
                                <p className="text-xs text-slate-400 mt-1">{meta.label} · v{c.frameworkVersion}</p>
                                <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                                    <span>{c.packs?.length || 0} pack{(c.packs?.length || 0) !== 1 ? 's' : ''}</span>
                                    <span>·</span>
                                    <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
