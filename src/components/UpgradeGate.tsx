'use client';

import { Lock, ArrowUpRight } from 'lucide-react';
import { useTenantContext, useTenantHref } from '@/lib/tenant-context-provider';
import { hasFeature, FEATURE_LABELS, getRequiredPlan } from '@/lib/entitlements';
import type { FeatureKey } from '@/lib/entitlements';
import Link from 'next/link';

/**
 * Client-side gate for premium features.
 *
 * If the tenant's plan includes the feature, renders children normally.
 * Otherwise, shows a lock icon with upgrade prompt or hides entirely.
 *
 * Usage:
 *   <UpgradeGate feature="PDF_EXPORTS">
 *     <PdfExportButton ... />
 *   </UpgradeGate>
 *
 *   <UpgradeGate feature="AUDIT_PACK_SHARING" mode="hide">
 *     <button>Share</button>
 *   </UpgradeGate>
 */
export function UpgradeGate({
    feature,
    children,
    mode = 'lock',
}: {
    feature: FeatureKey;
    children: React.ReactNode;
    /** 'lock' shows upgrade prompt, 'hide' hides entirely */
    mode?: 'lock' | 'hide';
}) {
    const { plan } = useTenantContext();
    const tenantHref = useTenantHref();

    // No billing configured → all features available (ungated)
    if (!plan || hasFeature(plan, feature)) {
        return <>{children}</>;
    }

    if (mode === 'hide') {
        return null;
    }

    const requiredPlan = getRequiredPlan(feature);
    const label = FEATURE_LABELS[feature];

    return (
        <div className="relative inline-flex items-center gap-2">
            <div className="opacity-40 pointer-events-none select-none">
                {children}
            </div>
            <Link
                href={tenantHref('/admin/billing')}
                className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition whitespace-nowrap"
                title={`${label} requires ${requiredPlan} plan`}
            >
                <Lock className="w-3 h-3" />
                {requiredPlan}
                <ArrowUpRight className="w-3 h-3" />
            </Link>
        </div>
    );
}
