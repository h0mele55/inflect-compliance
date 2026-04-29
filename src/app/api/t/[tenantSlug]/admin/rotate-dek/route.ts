/**
 * Per-tenant DEK rotation — GAP-22 alias path.
 *
 *   POST  /api/t/:tenantSlug/admin/rotate-dek
 *   GET   /api/t/:tenantSlug/admin/rotate-dek?jobId=<id>
 *
 * Functionally identical to `/admin/tenant-dek-rotation` — both
 * routes wrap the same handler bodies (`../_lib/rotate-dek-handlers`)
 * with their own `requirePermission` + `withApiErrorHandling` so
 * the api-permission-coverage and admin-route-coverage guardrails
 * see the literal text in this file. See the canonical route's
 * file header for the full rationale and behaviour notes.
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
