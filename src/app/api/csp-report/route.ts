import { NextResponse } from 'next/server';

/**
 * CSP violation report collector.
 *
 * Receives reports from the browser when Content-Security-Policy is violated.
 * Supports both legacy `application/csp-report` and modern `application/reports+json`.
 *
 * In production, wire this to your structured logging / SIEM pipeline.
 * For now, we log to console.warn for visibility during development.
 */
export async function POST(request: Request): Promise<NextResponse> {
    try {
        const contentType = request.headers.get('content-type') ?? '';

        let report: unknown;
        if (
            contentType.includes('application/csp-report') ||
            contentType.includes('application/reports+json') ||
            contentType.includes('application/json')
        ) {
            report = await request.json();
        } else {
            report = await request.text();
        }

        // Structured log — pipe to your SIEM in production
        console.warn('[CSP-VIOLATION]', JSON.stringify(report, null, 2));

        return new NextResponse(null, { status: 204 });
    } catch {
        // Malformed report — still return 204 to not leak info
        return new NextResponse(null, { status: 204 });
    }
}
