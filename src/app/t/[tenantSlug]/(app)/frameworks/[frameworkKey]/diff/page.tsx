'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function DiffPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const tenantSlug = params.tenantSlug as string;
    const frameworkKey = params.frameworkKey as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);
    const tenantHref = useCallback((path: string) => `/t/${tenantSlug}${path}`, [tenantSlug]);

    const fromKey = searchParams.get('from') || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [diff, setDiff] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [framework, setFramework] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'added' | 'removed' | 'changed'>('added');

    useEffect(() => {
        (async () => {
            try {
                const fwRes = await fetch(apiUrl(`/frameworks/${frameworkKey}`));
                if (fwRes.ok) setFramework(await fwRes.json());

                if (fromKey) {
                    const diffRes = await fetch(apiUrl(`/frameworks/${frameworkKey}?action=diff&from=${fromKey}`));
                    if (diffRes.ok) {
                        setDiff(await diffRes.json());
                    } else {
                        setError('Failed to compute diff. Ensure both frameworks exist.');
                    }
                }
            } catch { setError('Failed to load data'); }
            setLoading(false);
        })();
    }, [apiUrl, frameworkKey, fromKey]);

    if (loading) return <div className="p-8 animate-pulse text-slate-400">Loading diff...</div>;

    return (
        <div className="space-y-6">
            <div>
                <Link href={tenantHref(`/frameworks/${frameworkKey}`)} className="text-slate-400 hover:text-white transition-colors text-sm">
                    ← Back to {framework?.name || frameworkKey}
                </Link>
                <h1 className="text-2xl font-bold text-white mt-2" id="diff-heading">
                    Requirements Diff
                </h1>
                {diff && (
                    <p className="text-sm text-slate-400 mt-1">
                        Comparing <span className="text-brand-400">{diff.from.name} v{diff.from.version}</span>
                        {' → '}
                        <span className="text-brand-400">{diff.to.name} v{diff.to.version}</span>
                    </p>
                )}
            </div>

            {!fromKey && (
                <div className="glass-card text-center py-8 text-slate-400">
                    <p>Specify a <code className="text-brand-400">?from=FRAMEWORK_KEY</code> query parameter to compare.</p>
                    <p className="text-xs mt-2 text-slate-600">This page compares the &quot;from&quot; framework to this framework to show added/removed/changed requirements.</p>
                </div>
            )}

            {error && <div className="glass-card text-red-400">{error}</div>}

            {diff && (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="diff-summary">
                        <div className="glass-card text-center">
                            <div className="text-3xl font-bold text-emerald-400">{diff.summary.added}</div>
                            <div className="text-xs text-slate-400 mt-1">Added</div>
                        </div>
                        <div className="glass-card text-center">
                            <div className="text-3xl font-bold text-red-400">{diff.summary.removed}</div>
                            <div className="text-xs text-slate-400 mt-1">Removed</div>
                        </div>
                        <div className="glass-card text-center">
                            <div className="text-3xl font-bold text-amber-400">{diff.summary.changed}</div>
                            <div className="text-xs text-slate-400 mt-1">Changed</div>
                        </div>
                        <div className="glass-card text-center">
                            <div className={`text-3xl font-bold ${diff.summary.unmappedNewRequirements > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {diff.summary.unmappedNewRequirements}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">New Unmapped</div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg w-fit" id="diff-tabs">
                        {(['added', 'removed', 'changed'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                                    }`}
                                id={`diff-tab-${tab}`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)} ({diff[tab].length})
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="space-y-2" id="diff-content">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {activeTab === 'added' && diff.added.map((r: any, i: number) => (
                            <div key={i} className="glass-card flex items-center gap-3">
                                <span className="text-emerald-500 text-lg font-bold">+</span>
                                <code className="text-xs text-brand-400 font-mono w-28 flex-shrink-0">{r.code}</code>
                                <span className="text-sm text-slate-300">{r.title}</span>
                                {r.section && <span className="text-xs text-slate-500 ml-auto">{r.section}</span>}
                            </div>
                        ))}

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {activeTab === 'removed' && diff.removed.map((r: any, i: number) => (
                            <div key={i} className="glass-card flex items-center gap-3">
                                <span className="text-red-500 text-lg font-bold">−</span>
                                <code className="text-xs text-red-400/60 font-mono w-28 flex-shrink-0 line-through">{r.code}</code>
                                <span className="text-sm text-slate-500 line-through">{r.title}</span>
                                {r.section && <span className="text-xs text-slate-600 ml-auto">{r.section}</span>}
                            </div>
                        ))}

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {activeTab === 'changed' && diff.changed.map((r: any, i: number) => (
                            <div key={i} className="glass-card">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-amber-500 text-lg font-bold">~</span>
                                    <code className="text-xs text-brand-400 font-mono">{r.code}</code>
                                    <span className="text-xs text-slate-500">Changed: {r.changes.join(', ')}</span>
                                </div>
                                <div className="ml-8 space-y-1">
                                    {r.changes.includes('title') && (
                                        <div className="text-xs">
                                            <span className="text-red-400 line-through">{r.from.title}</span>
                                            <span className="text-slate-500 mx-2">→</span>
                                            <span className="text-emerald-400">{r.to.title}</span>
                                        </div>
                                    )}
                                    {r.changes.includes('section') && (
                                        <div className="text-xs">
                                            <span className="text-slate-500">Section: </span>
                                            <span className="text-red-400">{r.from.section || '(none)'}</span>
                                            <span className="text-slate-500 mx-2">→</span>
                                            <span className="text-emerald-400">{r.to.section || '(none)'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {diff[activeTab].length === 0 && (
                            <div className="glass-card text-center py-6 text-slate-500">
                                No {activeTab} requirements.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
