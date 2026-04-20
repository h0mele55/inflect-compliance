/**
 * POST /api/t/[tenantSlug]/evidence/retention/sweep
 * Admin-only: run retention sweep.
 * Body: { dryRun?: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { runRetentionSweepUsecase } from '@/app-layer/usecases/evidence-retention';
import { z } from 'zod';

const SweepSchema = z.object({
    dryRun: z.boolean().optional(),
}).strip();

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const body = SweepSchema.parse(await req.json());
    const result = await runRetentionSweepUsecase(ctx, { dryRun: body.dryRun });
    return NextResponse.json<any>(result);
});
