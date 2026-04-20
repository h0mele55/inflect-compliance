import { NextRequest, NextResponse } from 'next/server';
import { getPackByShareToken } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { token: string } }) => {
    const data = await getPackByShareToken(params.token);
    return NextResponse.json<any>(data);
});
