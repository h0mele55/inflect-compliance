/**
 * SCIM 2.0 ServiceProviderConfig endpoint
 *
 * GET /api/scim/v2/ServiceProviderConfig
 *
 * This is a public endpoint (no auth required per SCIM spec).
 * Returns the capabilities of this SCIM service provider.
 */
import { NextRequest, NextResponse } from 'next/server';
import { scimServiceProviderConfig } from '@/lib/scim/types';

export async function GET(req: NextRequest) {
    const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    return NextResponse.json<any>(scimServiceProviderConfig(baseUrl), {
        headers: { 'Content-Type': 'application/scim+json' },
    });
}
