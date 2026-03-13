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
    if (ctx.role !== 'ADMIN') throw forbidden('Only ADMIN can install framework packs');
}
