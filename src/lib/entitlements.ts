/**
 * Plan Entitlements
 *
 * Single source of truth for which features are available on each billing plan.
 * Used by both server-side gates (API routes) and client-side UI (UpgradeGate component).
 *
 * ─── Feature-to-Plan Mapping ───
 *
 * | Feature                  | FREE | TRIAL | PRO | ENTERPRISE |
 * |--------------------------|------|-------|-----|------------|
 * | PDF_EXPORTS              | ✗    | ✓     | ✓   | ✓          |
 * | AUDIT_PACK_SHARING       | ✗    | ✗     | ✓   | ✓          |
 * | ADVANCED_VENDOR_MGMT     | ✗    | ✗     | ✓   | ✓          |
 * | CUSTOM_INTEGRATIONS      | ✗    | ✗     | ✗   | ✓          |
 */
/** Billing plan enum — mirrors Prisma BillingPlan but defined locally to avoid generated-client import issues. */
type BillingPlan = 'FREE' | 'TRIAL' | 'PRO' | 'ENTERPRISE';

// ─── Feature Keys ───

export const FEATURES = {
    PDF_EXPORTS: 'PDF_EXPORTS',
    AUDIT_PACK_SHARING: 'AUDIT_PACK_SHARING',
    ADVANCED_VENDOR_MGMT: 'ADVANCED_VENDOR_MGMT',
    CUSTOM_INTEGRATIONS: 'CUSTOM_INTEGRATIONS',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

// ─── Plan hierarchy for comparisons ───

const PLAN_LEVEL: Record<BillingPlan, number> = {
    FREE: 0,
    TRIAL: 1,
    PRO: 2,
    ENTERPRISE: 3,
};

// ─── Feature → minimum plan required ───

const FEATURE_MIN_PLAN: Record<FeatureKey, BillingPlan> = {
    PDF_EXPORTS: 'TRIAL',
    AUDIT_PACK_SHARING: 'PRO',
    ADVANCED_VENDOR_MGMT: 'PRO',
    CUSTOM_INTEGRATIONS: 'ENTERPRISE',
};

// ─── Feature labels for UI ───

export const FEATURE_LABELS: Record<FeatureKey, string> = {
    PDF_EXPORTS: 'PDF Exports',
    AUDIT_PACK_SHARING: 'Audit Pack Sharing',
    ADVANCED_VENDOR_MGMT: 'Advanced Vendor Management',
    CUSTOM_INTEGRATIONS: 'Custom Integrations',
};

// ─── Core check ───

/**
 * Check if a plan includes a given feature.
 * Pure function — no DB access.
 */
export function hasFeature(plan: BillingPlan | string, feature: FeatureKey): boolean {
    const currentLevel = PLAN_LEVEL[plan as BillingPlan] ?? 0;
    const requiredPlan = FEATURE_MIN_PLAN[feature];
    const requiredLevel = PLAN_LEVEL[requiredPlan] ?? 0;
    return currentLevel >= requiredLevel;
}

/**
 * Get the minimum plan required for a feature.
 */
export function getRequiredPlan(feature: FeatureKey): BillingPlan {
    return FEATURE_MIN_PLAN[feature];
}

/**
 * Get all features available on a plan.
 */
export function getAvailableFeatures(plan: BillingPlan | string): FeatureKey[] {
    return (Object.keys(FEATURE_MIN_PLAN) as FeatureKey[]).filter(f => hasFeature(plan, f));
}

