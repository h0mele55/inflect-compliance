import { NextResponse } from 'next/server';
import {
    checkReportRateLimit,
    storeViolation,
    recordDropped,
    parseLegacyReport,
    parseModernReports,
    getViolationSummary,
    MAX_REPORT_PAYLOAD_BYTES,
} from '@/lib/security/csp-violations';
import { jsonResponse } from '@/lib/api-response';

/**
 * CSP Violation Report Endpoint
 *
 * POST — receives browser CSP violation reports
 *   Supports:
 *     - Legacy: application/csp-report (single violation)
 *     - Modern: application/reports+json (Reporting API v1, array)
 *     - Fallback: application/json
 *
 * GET — returns recent violation summary (admin debugging)
 *   Protected by admin role check (via middleware auth guard).
 *
 * Security:
 *   - Rate limited: 30 reports/IP/min
 *   - Payload size capped at 16 KB
 *   - No CSRF token required (browser sends reports without credentials)
 *   - Always returns 204 on POST (never leaks internal state)
 */

// ─── POST: Receive CSP violation reports ─────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
    try {
        // ── Rate limit by IP ──
        const clientIp = extractClientIp(request);
        if (!checkReportRateLimit(clientIp)) {
            recordDropped();
            return new NextResponse(null, { status: 429 });
        }

        // ── Payload size guard ──
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_REPORT_PAYLOAD_BYTES) {
            recordDropped();
            return new NextResponse(null, { status: 413 });
        }

        // ── Read body with size limit ──
        const rawBody = await readBodyWithLimit(request, MAX_REPORT_PAYLOAD_BYTES);
        if (rawBody === null) {
            recordDropped();
            return new NextResponse(null, { status: 413 });
        }

        // ── Parse payload ──
        const contentType = request.headers.get('content-type') ?? '';
        const userAgent = request.headers.get('user-agent') ?? '';

        let parsed: ReturnType<typeof JSON.parse>;
        try {
            parsed = JSON.parse(rawBody);
        } catch {
            recordDropped();
            return new NextResponse(null, { status: 204 });
        }

        // ── Legacy format: { "csp-report": { ... } } ──
        if (
            contentType.includes('application/csp-report') ||
            (typeof parsed === 'object' && parsed !== null && 'csp-report' in parsed)
        ) {
            const violation = parseLegacyReport(parsed, clientIp, userAgent);
            if (violation) {
                storeViolation(violation);
            } else {
                recordDropped();
            }
            return new NextResponse(null, { status: 204 });
        }

        // ── Modern format: [{ "type": "csp-violation", "body": { ... } }] ──
        if (
            contentType.includes('application/reports+json') ||
            Array.isArray(parsed)
        ) {
            const violations = parseModernReports(parsed, clientIp, userAgent);
            for (const v of violations) {
                storeViolation(v);
            }
            if (violations.length === 0) recordDropped();
            return new NextResponse(null, { status: 204 });
        }

        // ── Unknown format ──
        recordDropped();
        return new NextResponse(null, { status: 204 });
    } catch {
        // Never leak errors — always 204
        recordDropped();
        return new NextResponse(null, { status: 204 });
    }
}

// ─── GET: Admin summary of recent violations ────────────────────────

export async function GET(): Promise<NextResponse> {
    // NOTE: This route is protected by the middleware auth guard.
    // Only authenticated users can access /api/* routes.
    const summary = getViolationSummary(50);
    return jsonResponse(summary);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return '127.0.0.1';
}

/**
 * Read request body with a byte limit to prevent memory exhaustion.
 * Returns null if the body exceeds the limit.
 */
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string | null> {
    const reader = request.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                reader.cancel();
                return null;
            }
            chunks.push(value);
        }

        const merged = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
        }

        return new TextDecoder().decode(merged);
    } catch {
        return null;
    }
}
