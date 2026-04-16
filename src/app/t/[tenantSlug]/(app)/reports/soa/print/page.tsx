import { getTenantCtx } from '@/app-layer/context';
import { getSoA } from '@/app-layer/usecases/soa';
import { SoAPrintView } from './SoAPrintView';

export const dynamic = 'force-dynamic';

/**
 * Print-optimized SoA page — no nav, clean layout, CSS print styles.
 * Users click "Print / Save as PDF" in their browser.
 */
export default async function SoAPrintPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    // Independent fetches — run in parallel
    const [report, tenant] = await Promise.all([
        getSoA(ctx, {
            includeEvidence: true,
            includeTasks: true,
            includeTests: true,
        }),
        import('@/lib/prisma').then(m =>
            m.default.tenant.findUnique({
                where: { id: ctx.tenantId },
                select: { name: true },
            })
        ),
    ]);

    return (
        <SoAPrintView
            report={JSON.parse(JSON.stringify(report))}
            tenantName={tenant?.name || tenantSlug}
        />
    );
}
