/**
 * Epic B.3 — Admin API for initiating a per-tenant key rotation.
 *
 *   POST  /api/t/:tenantSlug/admin/key-rotation
 *     Enqueues a `key-rotation` job for this tenant. Returns 202 with
 *     a BullMQ job id that the operator can use to poll state.
 *     Audit-logged.
 *
 *   GET   /api/t/:tenantSlug/admin/key-rotation?jobId=<id>
 *     Reports the current state of a previously-enqueued job.
 *     Status + progress payload (no key material).
 *
 * Restricted to ADMIN (via `requireAdminCtx`). Wrapped in the
 * default API wrapper, which also applies the Epic A.2 rate limit —
 * overridden to `API_KEY_CREATE_LIMIT` (5/hr) because rotation is a
 * high-privilege operation that should not be hammered.
 *
 * The actual work runs in the BullMQ worker process; this endpoint
 * only enqueues + returns the handle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/auth/require-admin';
import { withApiErrorHandling } from '@/lib/errors/api';
import { enqueue, getQueue } from '@/app-layer/jobs/queue';
import { API_KEY_CREATE_LIMIT } from '@/lib/security/rate-limit-middleware';
import { logEvent } from '@/app-layer/events/audit';

// ─── POST — initiate rotation ──────────────────────────────────────

export const POST = withApiErrorHandling(
    async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
        const ctx = await requireAdminCtx(params, req);

        const job = await enqueue('key-rotation', {
            tenantId: ctx.tenantId,
            initiatedByUserId: ctx.userId,
            requestId: ctx.requestId,
        });

        // Operationally-visible audit entry — the attribution row
        // an auditor or compliance officer looks at when reviewing
        // who touched the keys and when.
        await logEvent(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
            ctx,
            {
                action: 'KEY_ROTATION_INITIATED',
                entityType: 'TenantKey',
                entityId: ctx.tenantId,
                details: `Key rotation initiated by admin user ${ctx.userId}`,
                metadata: { jobId: job.id },
            },
        );

        return NextResponse.json(
            {
                status: 'queued',
                jobId: job.id,
                tenantId: ctx.tenantId,
                initiatedByUserId: ctx.userId,
            },
            { status: 202 },
        );
    },
    {
        // Much tighter than the default API_MUTATION_LIMIT — rotation
        // is a once-a-quarter operation at most; 5/hr is comfortably
        // above legitimate usage and well below abuse volume.
        rateLimit: {
            config: API_KEY_CREATE_LIMIT,
            scope: 'key-rotation-initiate',
        },
    },
);

// ─── GET — poll job status ─────────────────────────────────────────

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
        const ctx = await requireAdminCtx(params, req);
        const url = new URL(req.url);
        const jobId = url.searchParams.get('jobId');
        if (!jobId) {
            return NextResponse.json(
                { error: { code: 'BAD_REQUEST', message: 'jobId required' } },
                { status: 400 },
            );
        }

        const queue = getQueue();
        const job = await queue.getJob(jobId);
        if (!job) {
            return NextResponse.json(
                {
                    error: {
                        code: 'NOT_FOUND',
                        message: `No job with id ${jobId}`,
                    },
                },
                { status: 404 },
            );
        }

        // Defensive — in the extraordinarily unlikely event someone
        // reuses a job id from a different tenant, we don't leak it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = job.data as any;
        if (payload?.tenantId && payload.tenantId !== ctx.tenantId) {
            return NextResponse.json(
                {
                    error: {
                        code: 'NOT_FOUND',
                        message: `No job with id ${jobId}`,
                    },
                },
                { status: 404 },
            );
        }

        const state = await job.getState();
        const progress = job.progress;
        const returnvalue = job.returnvalue ?? null;
        const failedReason = job.failedReason ?? null;

        return NextResponse.json({
            jobId,
            state,
            progress,
            result: returnvalue,
            failedReason,
        });
    },
    // GET is not considered a mutation; default wrapper rate limit
    // does not apply to GET.
);
