import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { logEvent } from './audit';

export async function emitOnboardingStarted(db: PrismaTx, ctx: RequestContext) {
    await logEvent(db, ctx, {
        action: 'ONBOARDING_STARTED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        details: 'Tenant onboarding wizard started',
    });
}

export async function emitOnboardingStepCompleted(db: PrismaTx, ctx: RequestContext, step: string) {
    await logEvent(db, ctx, {
        action: 'ONBOARDING_STEP_COMPLETED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        details: `Onboarding step completed: ${step}`,
        metadata: { step },
    });
}

export async function emitOnboardingFinished(db: PrismaTx, ctx: RequestContext) {
    await logEvent(db, ctx, {
        action: 'ONBOARDING_FINISHED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        details: 'Tenant onboarding wizard completed',
    });
}

export async function emitOnboardingRestarted(db: PrismaTx, ctx: RequestContext) {
    await logEvent(db, ctx, {
        action: 'ONBOARDING_RESTARTED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        details: 'Tenant onboarding wizard restarted',
    });
}
