/**
 * Audit Readiness Policies
 * Authorization checks for audit cycles, packs, shares, and auditor access.
 */
import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

export function assertCanManageAuditCycles(ctx: RequestContext) {
    if (!['ADMIN', 'EDITOR'].includes(ctx.role)) {
        throw forbidden('Only ADMIN or EDITOR can manage audit cycles');
    }
}

export function assertCanManageAuditPacks(ctx: RequestContext) {
    if (!['ADMIN', 'EDITOR'].includes(ctx.role)) {
        throw forbidden('Only ADMIN or EDITOR can manage audit packs');
    }
}

export function assertCanFreezePack(ctx: RequestContext) {
    if (ctx.role !== 'ADMIN') {
        throw forbidden('Only ADMIN can freeze audit packs');
    }
}

export function assertCanSharePack(ctx: RequestContext) {
    if (ctx.role !== 'ADMIN') {
        throw forbidden('Only ADMIN can share audit packs');
    }
}

export function assertCanViewPack(ctx: RequestContext) {
    if (!['ADMIN', 'EDITOR', 'READER', 'AUDITOR'].includes(ctx.role)) {
        throw forbidden('Cannot view audit packs');
    }
}

export function assertCanManageAuditors(ctx: RequestContext) {
    if (ctx.role !== 'ADMIN') {
        throw forbidden('Only ADMIN can manage auditor accounts');
    }
}
