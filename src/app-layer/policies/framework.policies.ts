/**
 * Framework Coverage Policies
 */
import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

export function assertCanViewFrameworks(ctx: RequestContext) {
    // All roles can view frameworks and coverage
    if (!ctx.role) throw forbidden('Authentication required');
}

export function assertCanInstallFrameworkPack(ctx: RequestContext) {
    // Epic 1 — OWNER is a superset of ADMIN per CLAUDE.md RBAC.
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw forbidden('Only OWNER or ADMIN can install framework packs');
    }
}
