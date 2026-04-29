/**
 * Per-tenant DEK rotation — admin API (canonical path).
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
 *
 * GAP-22: an alias of this same handler is exposed at
 * `/admin/rotate-dek` to satisfy the GAP-22 URL spec. Both routes
 * import from `../_lib/rotate-dek-handlers` and wrap independently
 * with `requirePermission` so the api-permission-coverage and
 * admin-route-coverage guardrails see the literal text in each
 * route file (the guardrails are text-match-based).
 */

import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { API_KEY_CREATE_LIMIT } from '@/lib/security/rate-limit-middleware';
import {
    rotateDekPostHandler,
    rotateDekGetHandler,
} from '../_lib/rotate-dek-handlers';

export const POST = withApiErrorHandling(
    requirePermission('admin.tenant_lifecycle', rotateDekPostHandler),
    {
        rateLimit: {
            config: API_KEY_CREATE_LIMIT,
            scope: 'tenant-dek-rotation-initiate',
        },
    },
);

export const GET = withApiErrorHandling(
    requirePermission('admin.tenant_lifecycle', rotateDekGetHandler),
);
