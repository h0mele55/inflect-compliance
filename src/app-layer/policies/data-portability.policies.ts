/**
 * Data Portability Policies — RBAC Boundaries for Import/Export
 *
 * Export requires: canExport (or canAdmin)
 * Import requires: canAdmin only (destructive operation)
 *
 * @module policies/data-portability
 */
import { RequestContext } from '../types';
import { assertCanAdmin } from './common';
import { forbidden } from '@/lib/errors/types';

/**
 * Asserts the user can export tenant data bundles.
 * Requires canExport or canAdmin permission.
 */
export function assertCanExport(ctx: RequestContext): void {
    if (!ctx.permissions.canExport && !ctx.permissions.canAdmin) {
        throw forbidden(
            'You do not have permission to export data. ' +
            'Export requires Export or Admin permission.',
        );
    }
}

/**
 * Asserts the user can import tenant data bundles.
 * Strictly requires canAdmin — import is a destructive operation.
 */
export function assertCanImport(ctx: RequestContext): void {
    assertCanAdmin(ctx);
}

/**
 * Asserts the import target tenant matches the user's current tenant context.
 * Prevents admin users from importing data into a different tenant.
 */
export function assertImportTargetMatchesContext(
    ctx: RequestContext,
    targetTenantId: string,
): void {
    if (ctx.tenantId !== targetTenantId) {
        throw forbidden(
            'Import target tenant does not match your current context. ' +
            `Context: ${ctx.tenantId}, target: ${targetTenantId}. ` +
            'Switch to the target tenant before importing.',
        );
    }
}
