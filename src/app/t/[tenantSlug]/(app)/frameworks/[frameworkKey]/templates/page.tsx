'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function TemplateLibraryPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const tenantSlug = params.tenantSlug as string;
    const frameworkKey = params.frameworkKey as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);
    const tenantHref = useCallback((path: string) => `/t/${tenantSlug}${path}`, [tenantSlug]);

    const [templates, setTemplates] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [framework, setFramework] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [category, setCategory] = useState('');
    const [section, setSection] = useState('');
    const [installing, setInstalling] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkInstalling, setBulkInstalling] = useState(false);
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

    const fetchTemplates = useCallback(async () => {
        const params = new URLSearchParams({ action: 'templates' });
        if (search) params.set('search', search);
        if (category) params.set('category', category);
        if (section) params.set('section', section);
        try {
            const res = await fetch(apiUrl(`/frameworks/${frameworkKey}?${params}`));
            if (res.ok) setTemplates(await res.json());
        } catch { /* ignore */ }
    }, [apiUrl, frameworkKey, search, category, section]);

    useEffect(() => {
        (async () => {
            const [fwRes] = await Promise.all([
                fetch(apiUrl(`/frameworks/${frameworkKey}`)),
            ]);
            if (fwRes.ok) setFramework(await fwRes.json());
            await fetchTemplates();
            setLoading(false);
        })();
    }, [apiUrl, frameworkKey, fetchTemplates]);

    // Debounced search
    useEffect(() => {
        const id = setTimeout(fetchTemplates, 300);
        return () => clearTimeout(id);
    }, [search, category, section, fetchTemplates]);

    const installTemplate = async (code: string) => {
        setInstalling(code);
        try {
            await fetch(apiUrl(`/frameworks/${frameworkKey}?action=install-template`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateCode: code }),
            });
            await fetchTemplates();
        } catch { /* ignore */ }
        setInstalling(null);
    };

    const bulkInstall = async () => {
        if (selected.size === 0) return;
        setBulkInstalling(true);
        try {
            await fetch(apiUrl(`/frameworks/${frameworkKey}?action=bulk-install`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateCodes: Array.from(selected) }),
            });
            setSelected(new Set());
            await fetchTemplates();
        } catch { /* ignore */ }
        setBulkInstalling(false);
    };

    const toggleSelect = (code: string) => {
        const next = new Set(selected);
        next.has(code) ? next.delete(code) : next.add(code);
        setSelected(next);
    };

    const selectAll = () => {
        const uninstalled = templates.filter(t => !t.installed).map(t => t.code);
        setSelected(new Set(uninstalled));
    };

    const categories = [...new Set(templates.map(t => t.category).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections = [...new Set(templates.flatMap(t => t.requirements.map((r: any) => r.section)).filter(Boolean))];
    const installed = templates.filter(t => t.installed).length;
    const available = templates.filter(t => !t.installed).length;

    if (loading) return <div className="p-8 animate-pulse text-slate-400">Loading template library...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Link href={tenantHref(`/frameworks/${frameworkKey}`)} className="text-slate-400 hover:text-white transition-colors text-sm">
                        ← Back to {framework?.name || frameworkKey}
                    </Link>
                    <h1 className="text-2xl font-bold text-white mt-2" id="template-library-heading">
                        Template Library — {framework?.name}
                    </h1>
                    <div className="flex gap-3 mt-1 text-xs text-slate-500">
                        <span>{templates.length} templates</span>
                        <span className="text-emerald-500">{installed} installed</span>
                        <span className="text-brand-400">{available} available</span>
                    </div>
                </div>
                {selected.size > 0 && (
                    <button
                        onClick={bulkInstall}
                        disabled={bulkInstalling}
                        className="btn btn-primary"
                        id="bulk-install-btn"
                    >
                        {bulkInstalling ? '⏳ Installing...' : `Install ${selected.size} Selected`}
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center" id="template-filters">
                <input
                    type="text"
                    placeholder="Search templates..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input w-60"
                    id="template-search"
                />
                <select value={category} onChange={e => setCategory(e.target.value)} className="input w-40" id="filter-category">
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={section} onChange={e => setSection(e.target.value)} className="input w-48" id="filter-section">
                    <option value="">All Sections</option>
                    {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={selectAll} className="btn btn-secondary text-xs" id="select-all-btn">Select All Uninstalled</button>
            </div>

            {/* Template cards */}
            <div className="space-y-3" id="template-list">
                {templates.map(t => {
                    const isExpanded = expandedTemplate === t.code;
                    const isSelected = selected.has(t.code);

                    return (
                        <div key={t.code} className={`glass-card transition-colors ${isSelected ? 'ring-1 ring-brand-500/50' : ''}`} id={`template-${t.code}`}>
                            <div className="flex items-start gap-3">
                                {/* Checkbox */}
                                {!t.installed && (
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelect(t.code)}
                                        className="mt-1 accent-brand-500"
                                    />
                                )}

                                {/* Main */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setExpandedTemplate(isExpanded ? null : t.code)}
                                            className="text-left flex-1 min-w-0"
                                        >
                                            <div className="flex items-center gap-2">
                                                <code className="text-xs text-brand-400 font-mono">{t.code}</code>
                                                <span className="text-sm font-medium text-white truncate">{t.title}</span>
                                                {t.installed ? (
                                                    <span className="badge badge-success text-xs flex-shrink-0">Installed</span>
                                                ) : (
                                                    <span className="badge badge-primary text-xs flex-shrink-0">Available</span>
                                                )}
                                            </div>
                                        </button>
                                        {!t.installed && (
                                            <button
                                                onClick={() => installTemplate(t.code)}
                                                disabled={installing === t.code}
                                                className="btn btn-primary text-xs px-3 py-1 flex-shrink-0"
                                            >
                                                {installing === t.code ? '⏳' : 'Install'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Badges row */}
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {t.category && <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{t.category}</span>}
                                        {t.defaultFrequency && <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{t.defaultFrequency}</span>}
                                        <span className="text-xs text-slate-500">{t.tasks.length} tasks</span>
                                        <span className="text-xs text-slate-500">{t.requirements.length} requirements</span>
                                    </div>

                                    {/* Expanded detail */}
                                    {isExpanded && (
                                        <div className="mt-3 space-y-3 border-t border-slate-700/30 pt-3">
                                            {t.description && (
                                                <p className="text-sm text-slate-400">{t.description}</p>
                                            )}

                                            {/* Requirements */}
                                            <div>
                                                <h4 className="text-xs font-semibold text-slate-500 mb-1">Mapped Requirements</h4>
                                                <div className="space-y-1">
                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    {t.requirements.map((r: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs">
                                                            <code className="text-brand-400 font-mono">{r.code}</code>
                                                            <span className="text-slate-400">{r.title}</span>
                                                            <span className="text-slate-600">({r.framework.name})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Tasks */}
                                            <div>
                                                <h4 className="text-xs font-semibold text-slate-500 mb-1">Default Tasks</h4>
                                                <div className="space-y-1">
                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    {t.tasks.map((task: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                                            <span className="text-slate-300">{task.title}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Suggested evidence */}
                                            <div>
                                                <h4 className="text-xs font-semibold text-slate-500 mb-1">Suggested Evidence Types</h4>
                                                <div className="flex flex-wrap gap-1">
                                                    {['DOCUMENT', 'SCREENSHOT', 'LOG'].map(type => (
                                                        <span key={type} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{type}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {templates.length === 0 && (
                    <div className="glass-card text-center py-8 text-slate-500">No templates match your filters.</div>
                )}
            </div>
        </div>
    );
}
