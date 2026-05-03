import { getTenantCtx } from '@/app-layer/context';
import { listFrameworks, computeCoverage } from '@/app-layer/usecases/framework';

import { FrameworksClient } from './FrameworksClient';

export const dynamic = 'force-dynamic';

export default async function FrameworksPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const frameworks = await listFrameworks(ctx);

    // Fetch coverage for each framework in parallel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coverages: Record<string, any> = {};
    await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frameworks.map(async (fw: any) => {
            try {
                coverages[fw.key] = await computeCoverage(ctx, fw.key);
            } catch {
                /* framework may not have requirements */
            }
        }),
    );

    return (
        <FrameworksClient
            frameworks={frameworks}
            coverages={coverages}
            tenantSlug={tenantSlug}
        />
    );
}
