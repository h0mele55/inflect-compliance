import { NextRequest, NextResponse } from 'next/server';
import { withValidatedBody } from '@/lib/validation/route';
import { EmptyBodySchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(withValidatedBody(EmptyBodySchema, async () => {
    const response = NextResponse.json({ success: true });
    response.cookies.set('token', '', { maxAge: 0, path: '/' });
    return response;
}));
