/**
 * GET  /api/t/[tenantSlug]/tests/due       — Due queue (overdue + due-soon plans)
 * POST /api/t/[tenantSlug]/tests/due       — Trigger due planning (ADMIN only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getDueQueue, runDuePlanning } from '@/app-layer/usecases/due-planning';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const queue = await getDueQueue(ctx);
    return NextResponse.json<any>(queue);
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const result = await runDuePlanning(ctx);
    return NextResponse.json<any>(result);
});
