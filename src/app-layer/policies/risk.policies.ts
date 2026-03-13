import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

/**
 * Risk-specific RBAC policies.
 * ADMIN & EDITOR can mutate; all roles can read.
 */

export function assertCanReadRisk(ctx: RequestContext): void {
    if (!ctx.permissions.canRead) {
        throw forbidden('You do not have permission to view risks in this context.');
    }
}

export function assertCanCreateRisk(ctx: RequestContext): void {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to create risks. Requires ADMIN or EDITOR role.');
    }
}

export function assertCanUpdateRisk(ctx: RequestContext): void {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to update risks. Requires ADMIN or EDITOR role.');
    }
}

export function assertCanSetStatus(ctx: RequestContext): void {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to change risk status. Requires ADMIN or EDITOR role.');
    }
}

export function assertCanMapControls(ctx: RequestContext): void {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to map controls to risks. Requires ADMIN or EDITOR role.');
    }
}
