/**
 * Per-tenant DEK rotation — admin API.
 *
 *   POST  /api/t/:tenantSlug/admin/tenant-dek-rotation
 *     Generates a fresh DEK, atomically swaps `Tenant.encryptedDek`
 *     into `Tenant.previousEncryptedDek`, and enqueues a
 *     `tenant-dek-rotation` BullMQ job that re-encrypts every v2
 *     ciphertext under the new DEK then clears the previous slot.
 *     Returns 202 with the BullMQ job id so the operator can poll.
 *     Audit-logged (`TENANT_DEK_ROTATED`).
 *
 *   GET   /api/t/:tenantSlug/admin/tenant-dek-rotation?jobId=<id>
 *     Reports the current state of a previously-enqueued sweep job.
 *
 * Distinct from `/admin/key-rotation`:
 *   - `/admin/key-rotation` rotates the **master KEK** (operator
 *     stages new env → tenant DEKs are re-wrapped, v1 ciphertexts
 *     re-encrypted under the new master). Gated by `admin.manage`.
 *   - This route rotates the **per-tenant DEK** for a single tenant
 *     — the response to a suspected per-tenant compromise. Gated by
 *     `admin.tenant_lifecycle` (OWNER-only) per the role model in
 *     `src/lib/permissions.ts` and CLAUDE.md's Epic 1 section.
 *
 * Tight rate limit (`API_KEY_CREATE_LIMIT` — 5/hr) because rotation
 * is a high-privilege, expensive operation. Legitimate use cases
 * (responding to a leak) need at most one rotation per tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getQueue } from '@/app-layer/jobs/queue';
import { API_KEY_CREATE_LIMIT } from '@/lib/security/rate-limit-middleware';
import { logEvent } from '@/app-layer/events/audit';
import { prisma } from '@/lib/prisma';
import { rotateTenantDek } from '@/lib/security/tenant-key-manager';

// ─── POST — initiate rotation ──────────────────────────────────────

export const POST = withApiErrorHandling(
    requirePermission('admin.tenant_lifecycle', async (_req: NextRequest, _routeArgs, ctx) => {

        // The DEK swap happens synchronously in `rotateTenantDek`; the
        // sweep job runs async. By the time `rotateTenantDek` returns,
        // new writes already use the new DEK and reads transparently
        // fall back to the previous DEK for stale rows. The job id
        // lets the operator poll for sweep completion.
        const { jobId, tenantId } = await rotateTenantDek({
            tenantId: ctx.tenantId,
            initiatedByUserId: ctx.userId,
            requestId: ctx.requestId,
        });

        // The user-facing audit row — captures attribution for the
        // moment the DEK was swapped (the security-relevant event,
        // distinct from the sweep job's STARTED/COMPLETED entries).
        await logEvent(prisma, ctx, {
            action: 'TENANT_DEK_ROTATED',
            entityType: 'TenantKey',
            entityId: tenantId,
            details: `Per-tenant DEK rotated by admin user ${ctx.userId}`,
            metadata: { jobId, sweepJob: 'tenant-dek-rotation' },
        });

        return NextResponse.json(
            {
                status: 'queued',
                jobId,
                tenantId,
                initiatedByUserId: ctx.userId,
            },
            { status: 202 },
        );
    }),
    {
        rateLimit: {
            config: API_KEY_CREATE_LIMIT,
            scope: 'tenant-dek-rotation-initiate',
        },
    },
);

// ─── GET — poll job status ─────────────────────────────────────────

export const GET = withApiErrorHandling(
    requirePermission('admin.tenant_lifecycle', async (req: NextRequest, _routeArgs, ctx) => {
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

        // Defensive — never leak a sibling tenant's job, even if the
        // operator guessed a job id. Same shape as the master-KEK
        // route's defence in `key-rotation/route.ts`.
        const payload = job.data as { tenantId?: string } | undefined;
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
    }),
);
