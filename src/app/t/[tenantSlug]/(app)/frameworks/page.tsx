'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const FW_META: Record<string, { icon: string; color: string }> = {
    ISO27001: { icon: '🛡️', color: 'from-indigo-500 to-purple-600' },
    NIS2: { icon: '🇪🇺', color: 'from-blue-500 to-cyan-600' },
    ISO9001: { icon: '✅', color: 'from-emerald-500 to-green-600' },
    ISO28000: { icon: '📦', color: 'from-orange-500 to-amber-600' },
    ISO39001: { icon: '🚗', color: 'from-rose-500 to-pink-600' },
};

export default function FrameworksPage() {
    const params = useParams();
    const tenantSlug = params.tenantSlug as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);
    const tenantHref = useCallback((path: string) => `/t/${tenantSlug}${path}`, [tenantSlug]);

    const [frameworks, setFrameworks] = useState<any[]>([]);
    const [coverages, setCoverages] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(apiUrl('/frameworks'))
            .then(r => r.ok ? r.json() : [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(async (fws: any[]) => {
                setFrameworks(fws);
                // Fetch coverage for each framework
                const covMap: Record<string, any> = {};
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await Promise.all(fws.map(async (fw: any) => {
                    try {
                        const r = await fetch(apiUrl(`/frameworks/${fw.key}?action=coverage`));
                        if (r.ok) covMap[fw.key] = await r.json();
                    } catch { /* ignore */ }
                }));
                setCoverages(covMap);
            })
            .finally(() => setLoading(false));
    }, [apiUrl]);

    if (loading) return (
        <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="glass-card animate-pulse h-56" />
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white" id="frameworks-heading">🗺️ Compliance Frameworks</h1>
                    <p className="text-sm text-slate-400 mt-1">Browse standards, install control packs, and track requirement coverage</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {frameworks.map((fw: any) => {
                    const meta = FW_META[fw.key] || { icon: '📋', color: 'from-slate-500 to-slate-600' };
                    const cov = coverages[fw.key];
                    const isInstalled = cov && cov.mapped > 0;
                    const coveragePercent = cov?.coveragePercent ?? 0;

                    return (
                        <div key={fw.id} className="glass-card hover:border-brand-400/40 transition-all group relative overflow-hidden" id={`fw-card-${fw.key}`}>
                            {/* Gradient accent */}
                            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${meta.color}`} />

                            <div className="flex items-start justify-between pt-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <h2 className="text-lg font-semibold text-white group-hover:text-brand-300 transition-colors">{fw.name}</h2>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        {fw.version && <span className="badge badge-primary text-xs">v{fw.version}</span>}
                                        {fw.kind && <span className="text-xs text-slate-500">{fw.kind.replace('_', ' ')}</span>}
                                    </div>
                                </div>
                                {isInstalled ? (
                                    <span className="badge badge-success text-xs" id={`fw-installed-${fw.key}`}>✓ Installed</span>
                                ) : (
                                    <span className="badge badge-warning text-xs">Available</span>
                                )}
                            </div>

                            <p className="text-sm text-slate-400 mt-3 line-clamp-2">{fw.description}</p>

                            {/* Stats */}
                            <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
                                <span>{fw._count?.requirements || 0} requirements</span>
                                <span>{fw._count?.packs || 0} pack{(fw._count?.packs || 0) !== 1 ? 's' : ''}</span>
                            </div>

                            {/* Coverage bar */}
                            {cov && (
                                <div className="mt-3" id={`fw-coverage-${fw.key}`}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-slate-400">Coverage</span>
                                        <span className={coveragePercent === 100 ? 'text-emerald-400' : coveragePercent > 0 ? 'text-brand-400' : 'text-slate-500'}>
                                            {coveragePercent}%
                                        </span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${coveragePercent === 100 ? 'bg-emerald-500' : coveragePercent > 0 ? 'bg-brand-500' : 'bg-slate-600'
                                                }`}
                                            style={{ width: `${coveragePercent}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 text-xs mt-1 text-slate-500">
                                        <span>{cov.mapped}/{cov.total} mapped</span>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 mt-4">
                                <Link href={tenantHref(`/frameworks/${fw.key}`)} className="btn btn-primary flex-1 text-center text-sm" id={`view-framework-${fw.key}`}>
                                    View Details
                                </Link>
                                {!isInstalled && (
                                    <Link href={tenantHref(`/frameworks/${fw.key}/install`)} className="btn btn-secondary text-sm" id={`install-framework-${fw.key}`}>
                                        Install
                                    </Link>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {frameworks.length === 0 && (
                <div className="glass-card text-center py-12">
                    <p className="text-slate-500">No frameworks available. Run the seed to populate.</p>
                </div>
            )}
        </div>
    );
}
