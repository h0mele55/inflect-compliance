import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { restartOnboarding } from '@/app-layer/usecases/onboarding';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) => {
    const ctx = await getTenantCtx(await params, req);
    const state = await restartOnboarding(ctx);
    return NextResponse.json<any>(state);
});
