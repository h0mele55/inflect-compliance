import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

/**
 * Automation RBAC.
 *
 * Automation rules can fire side-effects (create tasks, push webhooks,
 * mutate status) on behalf of the tenant — so mutation is deliberately
 * gated at ADMIN. Viewing rules and their execution history requires
 * READ; AUDITOR can view history for investigation but cannot manage.
 *
 * Manual re-fire ("trigger this rule now") is a separate capability from
 * editing rules because it's lower-risk (uses the existing rule config)
 * but still privileged. It's gated at WRITE to keep the common case
 * (EDITOR can manually replay but cannot reconfigure) simple.
 */

export function assertCanReadAutomation(ctx: RequestContext): void {
    if (!ctx.permissions.canRead) {
        throw forbidden(
            'You do not have permission to view automation rules in this context.'
        );
    }
}

export function assertCanManageAutomation(ctx: RequestContext): void {
    if (!ctx.permissions.canAdmin) {
        throw forbidden(
            'You do not have permission to manage automation rules. Requires ADMIN role.'
        );
    }
}

export function assertCanExecuteAutomation(ctx: RequestContext): void {
    if (!ctx.permissions.canWrite) {
        throw forbidden(
            'You do not have permission to trigger automation rules. Requires ADMIN or EDITOR role.'
        );
    }
}

export function assertCanReadAutomationHistory(ctx: RequestContext): void {
    if (!ctx.permissions.canRead && !ctx.permissions.canAudit) {
        throw forbidden(
            'You do not have permission to view automation execution history.'
        );
    }
}
