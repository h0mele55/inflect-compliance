import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { markNotificationRead } from '@/app-layer/usecases/notification';
import { withApiErrorHandling } from '@/lib/errors/api';

export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    const notification = await markNotificationRead(ctx, params.id);
    return NextResponse.json<any>(notification);
});
