'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

export default function ControlTemplatesPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();
    const { permissions } = useTenantContext();

    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [installing, setInstalling] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        const res = await fetch(apiUrl('/controls/templates'));
        if (res.ok) setTemplates(await res.json());
        setLoading(false);
    }, [apiUrl]);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    const toggle = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(t => t.id)));
        }
    };

    const handleInstall = async () => {
        if (selectedIds.size === 0) return;
        setInstalling(true);
        setError('');
        try {
            const res = await fetch(apiUrl('/controls/templates/install'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateIds: Array.from(selectedIds) }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(typeof data.error === 'string' ? data.error : data.message || 'Failed to install templates');
            }
            const result = await res.json();
            const count = Array.isArray(result) ? result.length : 1;
            setSuccess(`✅ Installed ${count} control(s) successfully!`);
            setTimeout(() => router.push(tenantHref('/controls')), 1500);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            setError(e.message);
        } finally {
            setInstalling(false);
        }
    };

    const filtered = templates.filter(t =>
        !searchQuery ||
        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.frameworkTag?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const categories = [...new Set(templates.map(t => t.category).filter(Boolean))];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold" id="templates-heading">📋 Control Templates</h1>
                    <p className="text-slate-400 text-sm">Select templates to install as controls in your register</p>
                </div>
                <Link href={tenantHref('/controls')} className="btn btn-secondary">
                    ← Back to Controls
                </Link>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
            )}
            {success && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm" id="install-success">{success}</div>
            )}

            {/* Filters + Install bar */}
            <div className="glass-card p-4">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="flex gap-3 items-center flex-1">
                        <input
                            type="text"
                            className="input flex-1 min-w-[200px]"
                            placeholder="Search templates..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            id="template-search"
                        />
                    </div>
                    {permissions.canWrite && (
                        <button
                            onClick={handleInstall}
                            disabled={selectedIds.size === 0 || installing}
                            className="btn btn-primary"
                            id="install-selected-btn"
                        >
                            {installing ? 'Installing...' : `Install Selected (${selectedIds.size})`}
                        </button>
                    )}
                </div>
            </div>

            {/* Template list */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500 animate-pulse">Loading templates...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <p className="text-lg mb-2">No templates found</p>
                        <p className="text-sm">Templates are seeded by your admin.</p>
                    </div>
                ) : (
                    <table className="data-table" id="templates-table">
                        <thead>
                            <tr>
                                <th className="w-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                                        onChange={toggleAll}
                                        className="rounded"
                                    />
                                </th>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Framework</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(t => (
                                <tr key={t.id} className="cursor-pointer hover:bg-slate-700/30 transition" onClick={() => toggle(t.id)}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(t.id)}
                                            onChange={() => toggle(t.id)}
                                            className="rounded"
                                        />
                                    </td>
                                    <td className="text-xs text-slate-400 font-mono">{t.code || '—'}</td>
                                    <td className="font-medium text-white">{t.name}</td>
                                    <td>
                                        {t.category && (
                                            <span className="badge badge-info text-xs">{t.category}</span>
                                        )}
                                    </td>
                                    <td>
                                        {t.frameworkTag && (
                                            <span className="badge badge-neutral text-xs">{t.frameworkTag}</span>
                                        )}
                                    </td>
                                    <td className="text-xs text-slate-500 truncate max-w-xs">{t.description || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
