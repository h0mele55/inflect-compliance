import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { logEvent } from './audit';
import { emitAutomationEvent } from '../automation';

export async function emitOnboardingStarted(db: PrismaTx, ctx: RequestContext) {
    await logEvent(db, ctx, {
        action: 'ONBOARDING_STARTED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        details: 'Tenant onboarding wizard started',
    });
    await emitAutomationEvent(ctx, {
        event: 'ONBOARDING_STARTED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        actorUserId: ctx.userId,
        data: {},
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
    await emitAutomationEvent(ctx, {
        event: 'ONBOARDING_STEP_COMPLETED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        actorUserId: ctx.userId,
        data: { step },
    });
}

export async function emitOnboardingFinished(db: PrismaTx, ctx: RequestContext) {
    await logEvent(db, ctx, {
        action: 'ONBOARDING_FINISHED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        details: 'Tenant onboarding wizard completed',
    });
    await emitAutomationEvent(ctx, {
        event: 'ONBOARDING_FINISHED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        actorUserId: ctx.userId,
        data: {},
    });
}

export async function emitOnboardingRestarted(db: PrismaTx, ctx: RequestContext) {
    await logEvent(db, ctx, {
        action: 'ONBOARDING_RESTARTED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        details: 'Tenant onboarding wizard restarted',
    });
    await emitAutomationEvent(ctx, {
        event: 'ONBOARDING_RESTARTED',
        entityType: 'TenantOnboarding',
        entityId: ctx.tenantId,
        actorUserId: ctx.userId,
        data: {},
    });
}
