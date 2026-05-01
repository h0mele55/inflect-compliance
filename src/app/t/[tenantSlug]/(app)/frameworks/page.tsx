import Link from 'next/link';
import { getTenantCtx } from '@/app-layer/context';
import { listFrameworks, computeCoverage } from '@/app-layer/usecases/framework';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
    ShieldCheck,
    Flag,
    BadgeCheck,
    Package,
    Car,
    ClipboardList,
    type LucideIcon,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const FW_META: Record<string, { icon: LucideIcon; color: string }> = {
    ISO27001: { icon: ShieldCheck, color: 'from-indigo-500 to-purple-600' },
    NIS2: { icon: Flag, color: 'from-blue-500 to-cyan-600' },
    ISO9001: { icon: BadgeCheck, color: 'from-emerald-500 to-green-600' },
    ISO28000: { icon: Package, color: 'from-orange-500 to-amber-600' },
    ISO39001: { icon: Car, color: 'from-rose-500 to-pink-600' },
};
const FW_DEFAULT: { icon: LucideIcon; color: string } = { icon: ClipboardList, color: 'from-slate-500 to-slate-600' };

export default async function FrameworksPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const href = (path: string) => `/t/${tenantSlug}${path}`;

    const frameworks = await listFrameworks(ctx);

    // Fetch coverage for each framework in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coverages: Record<string, any> = {};
    await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frameworks.map(async (fw: any) => {
            try {
                coverages[fw.key] = await computeCoverage(ctx, fw.key);
            } catch { /* framework may not have requirements */ }
        })
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-content-emphasis" id="frameworks-heading">Compliance Frameworks</h1>
                    <p className="text-sm text-content-muted mt-1">Browse standards, install control packs, and track requirement coverage</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {frameworks.map((fw: any) => {
                    const meta = FW_META[fw.key] || FW_DEFAULT;
                    const FwIcon = meta.icon;
                    const cov = coverages[fw.key];
                    const isInstalled = cov && cov.mapped > 0;
                    const coveragePercent = cov?.coveragePercent ?? 0;

                    return (
                        <div key={fw.id} className="glass-card hover:border-[var(--brand-default)]/40 transition-all group relative overflow-hidden" id={`fw-card-${fw.key}`}>
                            {/* Gradient accent */}
                            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${meta.color}`} />

                            <div className="flex items-start justify-between pt-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <FwIcon className="w-6 h-6 text-content-emphasis" aria-hidden="true" />
                                        <h2 className="text-lg font-semibold text-content-emphasis group-hover:text-[var(--brand-muted)] transition-colors">{fw.name}</h2>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        {fw.version && <span className="badge badge-primary text-xs">v{fw.version}</span>}
                                        {fw.kind && <span className="text-xs text-content-subtle">{fw.kind.replace('_', ' ')}</span>}
                                    </div>
                                </div>
                                {isInstalled ? (
                                    <span className="badge badge-success text-xs" id={`fw-installed-${fw.key}`}>Installed</span>
                                ) : (
                                    <span className="badge badge-warning text-xs">Available</span>
                                )}
                            </div>

                            <p className="text-sm text-content-muted mt-3 line-clamp-2">{fw.description}</p>

                            {/* Stats */}
                            <div className="flex items-center gap-4 mt-4 text-xs text-content-subtle">
                                <span>{fw._count?.requirements || 0} requirements</span>
                                <span>{fw._count?.packs || 0} pack{(fw._count?.packs || 0) !== 1 ? 's' : ''}</span>
                            </div>

                            {/* Coverage bar — Epic 59 ProgressBar primitive. */}
                            {cov && (
                                <div className="mt-3" id={`fw-coverage-${fw.key}`}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-content-muted">Coverage</span>
                                        <span className={coveragePercent === 100 ? 'text-emerald-400' : coveragePercent > 0 ? 'text-[var(--brand-default)]' : 'text-content-subtle'}>
                                            {coveragePercent}%
                                        </span>
                                    </div>
                                    <ProgressBar
                                        value={coveragePercent}
                                        size="sm"
                                        variant={
                                            coveragePercent === 100
                                                ? 'success'
                                                : coveragePercent > 0
                                                    ? 'brand'
                                                    : 'neutral'
                                        }
                                        aria-label={`${fw.name} coverage`}
                                    />
                                    <div className="flex items-center gap-2 text-xs mt-1 text-content-subtle">
                                        <span>{cov.mapped}/{cov.total} mapped</span>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 mt-4">
                                <Link href={href(`/frameworks/${fw.key}`)} className="btn btn-primary flex-1" id={`view-framework-${fw.key}`}>
                                    View Details
                                </Link>
                                {!isInstalled && (
                                    <Link href={href(`/frameworks/${fw.key}/install`)} className="btn btn-secondary" id={`install-framework-${fw.key}`}>
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
                    <p className="text-content-subtle">No frameworks available. Run the seed to populate.</p>
                </div>
            )}
        </div>
    );
}
