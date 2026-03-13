/**
 * Standardized execution helpers that combine ctx building + DB context binding.
 *
 * These are the highest-level entrypoints — routes should use these to execute
 * business logic with full tenant isolation and request correlation.
 *
 * Usage in routes:
 * ```ts
 * import { executeInTenant, executeInLegacy } from '@/app-layer/execute';
 *
 * // Tenant-scoped route (/t/[tenantSlug]/...)
 * export const GET = withApiErrorHandling(async (req, { params }) => {
 *     const result = await executeInTenant(params, req, (ctx, db) =>
 *         MyRepository.list(db, ctx)
 *     );
 *     return NextResponse.json(result);
 * });
 *
 * // Legacy route (/api/...)
 * export const GET = withApiErrorHandling(async (req) => {
 *     const result = await executeInLegacy(req, (ctx, db) =>
 *         MyRepository.list(db, ctx)
 *     );
 *     return NextResponse.json(result);
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { getTenantCtx, getLegacyCtx } from './context';
import { runInTenantContext, type PrismaTx } from '@/lib/db-context';
import type { RequestContext } from './types';

/**
 * Execute a function within tenant context.
 * Builds RequestContext from tenantSlug + runs inside RLS-enforced transaction.
 */
export async function executeInTenant<T>(
    params: { tenantSlug: string },
    req: NextRequest,
    fn: (ctx: RequestContext, db: PrismaTx) => Promise<T>
): Promise<T> {
    const ctx = await getTenantCtx(params, req);
    return runInTenantContext(ctx, (db) => fn(ctx, db));
}

/**
 * Execute a function within legacy route context.
 * Builds RequestContext from session JWT + runs inside RLS-enforced transaction.
 */
export async function executeInLegacy<T>(
    req: NextRequest,
    fn: (ctx: RequestContext, db: PrismaTx) => Promise<T>
): Promise<T> {
    const ctx = await getLegacyCtx(req);
    return runInTenantContext(ctx, (db) => fn(ctx, db));
}

