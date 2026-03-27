/**
 * SCIM 2.0 Users collection endpoint
 *
 * GET  /api/scim/v2/Users — list users (with optional filter)
 * POST /api/scim/v2/Users — create user
 *
 * All requests are authenticated via tenant-scoped SCIM bearer token.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateScimRequest, ScimAuthError } from '@/lib/scim/auth';
import { scimError, scimListResponse } from '@/lib/scim/types';
import { scimListUsers, scimCreateUser, type ScimCreateUserInput } from '@/app-layer/usecases/scim-users';

export async function GET(req: NextRequest) {
    try {
        const ctx = await authenticateScimRequest(req);
        const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

        const startIndex = parseInt(req.nextUrl.searchParams.get('startIndex') || '1', 10);
        const count = parseInt(req.nextUrl.searchParams.get('count') || '100', 10);
        const filter = req.nextUrl.searchParams.get('filter') || undefined;

        const { resources, total } = await scimListUsers(ctx, baseUrl, { startIndex, count, filter });

        return NextResponse.json(scimListResponse(resources, total, startIndex), {
            headers: { 'Content-Type': 'application/scim+json' },
        });
    } catch (e) {
        if (e instanceof ScimAuthError) {
            return NextResponse.json(scimError(e.status, e.message, e.scimType), { status: e.status });
        }
        return NextResponse.json(scimError(500, 'Internal server error'), { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const ctx = await authenticateScimRequest(req);
        const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

        const body = await req.json() as ScimCreateUserInput;

        if (!body.userName) {
            return NextResponse.json(
                scimError(400, 'userName is required', 'invalidValue'),
                { status: 400 }
            );
        }

        const { user, created } = await scimCreateUser(ctx, body, baseUrl);

        return NextResponse.json(user, {
            status: created ? 201 : 200,
            headers: {
                'Content-Type': 'application/scim+json',
                ...(created ? { Location: user.meta.location } : {}),
            },
        });
    } catch (e) {
        if (e instanceof ScimAuthError) {
            return NextResponse.json(scimError(e.status, e.message, e.scimType), { status: e.status });
        }
        return NextResponse.json(scimError(500, 'Internal server error'), { status: 500 });
    }
}
