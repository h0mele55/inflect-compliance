import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { listMyNotifications } from '@/app-layer/usecases/notification';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest) => {
    const ctx = await getLegacyCtx(req);
    const notifications = await listMyNotifications(ctx);
    return NextResponse.json<any>(notifications);
});
