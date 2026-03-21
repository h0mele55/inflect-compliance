import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

/**
 * Asserts the user has ADMIN permission — required for all onboarding operations.
 */
export function assertCanManageOnboarding(ctx: RequestContext) {
    if (!ctx.permissions.canAdmin) {
        throw forbidden('Only administrators can manage tenant onboarding.');
    }
}
