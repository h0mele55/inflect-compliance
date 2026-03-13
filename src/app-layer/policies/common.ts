import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

/**
 * Asserts the user has READ permission in their current context.
 */
export function assertCanRead(ctx: RequestContext) {
    if (!ctx.permissions.canRead) {
        throw forbidden('You do not have permission to view records in this context.');
    }
}

/**
 * Asserts the user has WRITE permission in their current context.
 */
export function assertCanWrite(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to modify records in this context.');
    }
}

/**
 * Asserts the user has ADMIN permission in their current context.
 */
export function assertCanAdmin(ctx: RequestContext) {
    if (!ctx.permissions.canAdmin) {
        throw forbidden('You do not have permission to perform administrative actions in this context.');
    }
}

/**
 * Asserts the user has AUDIT permission in their current context.
 */
export function assertCanAudit(ctx: RequestContext) {
    if (!ctx.permissions.canAudit) {
        throw forbidden('You do not have permission to perform audit actions in this context.');
    }
}
