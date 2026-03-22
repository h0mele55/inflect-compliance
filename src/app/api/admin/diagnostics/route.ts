/**
 * Admin Diagnostics Endpoint
 *
 * GET /api/admin/diagnostics
 *
 * Returns lightweight service health and configuration status.
 * Admin-only — requires authenticated session with ADMIN role.
 *
 * SAFETY: Never exposes secrets, DSNs, or sensitive configuration values.
 */
import { NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getLegacyCtx } from '@/lib/auth/context';
import { forbidden } from '@/lib/errors/types';
import { isTelemetryInitialized } from '@/lib/observability/instrumentation';
import { isSentryInitialized } from '@/lib/observability/sentry';

const startedAt = new Date();

export const GET = withApiErrorHandling(async (req) => {
    const ctx = await getLegacyCtx(req);
    if (!ctx.permissions.canAdmin) {
        throw forbidden('Admin access required');
    }

    const uptimeSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);

    return NextResponse.json({
        service: {
            name: process.env.OTEL_SERVICE_NAME || 'inflect-compliance',
            version: process.env.npm_package_version || '0.0.0',
            environment: process.env.NODE_ENV || 'development',
            startedAt: startedAt.toISOString(),
            uptimeSeconds,
        },
        observability: {
            otelEnabled: !!process.env.OTEL_ENABLED && process.env.OTEL_ENABLED === 'true',
            otelInitialized: isTelemetryInitialized(),
            sentryConfigured: !!process.env.SENTRY_DSN,
            sentryInitialized: isSentryInitialized(),
            logLevel: process.env.LOG_LEVEL || 'info',
        },
        runtime: {
            nodeVersion: process.version,
            platform: process.platform,
            memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
    });
});
