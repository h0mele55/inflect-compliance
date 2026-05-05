import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

// ─── Read ───

export function assertCanReadVendors(ctx: RequestContext) {
    if (!ctx.permissions.canRead) throw forbidden('No read access');
}

// ─── Manage (ADMIN / EDITOR) ───

export function assertCanManageVendors(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) throw forbidden('Only ADMIN or EDITOR can manage vendors');
}

export function assertCanManageVendorDocs(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) throw forbidden('Only ADMIN or EDITOR can manage vendor documents');
}

export function assertCanRunAssessment(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) throw forbidden('Only ADMIN or EDITOR can run vendor assessments');
}

// ─── Approve (ADMIN only) ───

export function assertCanApproveAssessment(ctx: RequestContext) {
    if (!ctx.permissions.canAdmin) throw forbidden('Only ADMIN can approve/reject assessments');
}

// ─── Epic G-3 — Vendor questionnaire template authoring ───

/**
 * Authoring sits at the same tier as vendor management — ADMIN +
 * EDITOR. Reviewer-tier (canAudit) and reader-tier roles cannot
 * edit templates because edits are versioned mutations of the
 * questionnaire surface auditors will see.
 */
export function assertCanManageVendorAssessmentTemplates(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) {
        throw forbidden(
            'Only ADMIN or EDITOR can author vendor assessment templates',
        );
    }
}
