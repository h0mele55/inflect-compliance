import prisma from '@/lib/prisma';
import { hasFeature, getRequiredPlan, FEATURE_LABELS, type FeatureKey } from './entitlements';

/** Billing plan enum — mirrors Prisma BillingPlan but defined locally to avoid generated-client import issues. */
type BillingPlan = 'FREE' | 'TRIAL' | 'PRO' | 'ENTERPRISE';

// ─── Server-side tenant plan resolver ───

/**
 * Look up the current billing plan for a tenant.
 * Returns null if no billing account exists (billing not configured → ungated).
 * Returns the plan string if a billing account exists.
 */
export async function getTenantPlan(tenantId: string): Promise<BillingPlan | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billingAccount = await (prisma as any).billingAccount.findUnique({
        where: { tenantId },
        select: { plan: true },
    });
    return (billingAccount?.plan as BillingPlan) ?? null;
}

/**
 * Server-side entitlement check.
 * If no billing account exists (plan is null), feature is ungated.
 * Throws a structured error if the tenant's plan doesn't include the feature.
 */
export async function requireFeature(tenantId: string, feature: FeatureKey): Promise<void> {
    const plan = await getTenantPlan(tenantId);
    // No billing configured → all features available
    if (!plan) return;
    if (!hasFeature(plan, feature)) {
        const requiredPlan = getRequiredPlan(feature);
        const error = new Error(
            `Feature "${FEATURE_LABELS[feature]}" requires the ${requiredPlan} plan or higher. Current plan: ${plan}.`
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).code = 'PLAN_REQUIRED';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).status = 403;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).requiredPlan = requiredPlan;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).feature = feature;
        throw error;
    }
}

/**
 * List recent billing events for a tenant.
 * Server-side only — delegates the Prisma call away from route handlers.
 */
export async function listBillingEvents(tenantId: string, limit = 20) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (prisma as any).billingEvent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
            id: true,
            type: true,
            stripeEventId: true,
            createdAt: true,
        },
    });
}
