/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTenantCtx } from '@/app-layer/context';
import { listFrameworks, computeCoverage } from '@/app-layer/usecases/framework';
import { FrameworksClient, type FrameworkRow } from './FrameworksClient';

export const dynamic = 'force-dynamic';

export default async function FrameworksPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const frameworks = await listFrameworks(ctx);

    // Pull coverage in parallel — keeps the page server-rendered
    // (no client fetch waterfall) while letting the table render
    // every column's data without separate loading states.
    const coverages: Record<string, any> = {};
    await Promise.all(
        frameworks.map(async (fw: any) => {
            try {
                coverages[fw.key] = await computeCoverage(ctx, fw.key);
            } catch {
                /* framework may have zero requirements */
            }
        }),
    );

    const rows: FrameworkRow[] = frameworks.map((fw: any) => {
        const cov = coverages[fw.key];
        return {
            id: fw.id,
            key: fw.key,
            name: fw.name,
            kind: fw.kind ?? 'CUSTOM',
            version: fw.version ?? null,
            description: fw.description ?? null,
            requirementCount: fw._count?.requirements ?? 0,
            packCount: fw._count?.packs ?? 0,
            coveragePercent: cov?.coveragePercent ?? 0,
            coverageMapped: cov?.mapped ?? 0,
            coverageTotal: cov?.total ?? 0,
            isInstalled: !!cov && cov.mapped > 0,
        };
    });

    return <FrameworksClient tenantSlug={tenantSlug} rows={rows} />;
}
