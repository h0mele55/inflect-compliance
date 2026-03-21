'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useTenantContext, useTenantHref } from '@/lib/tenant-context-provider';

/**
 * Dashboard card that shows "Complete Setup" when onboarding is not complete.
 * Only visible to admins.
 */
export default function OnboardingBanner() {
    const { permissions } = useTenantContext();
    const tenantHref = useTenantHref();

    if (!permissions.canAdmin) return null;

    return (
        <div className="glass-card p-5 border-brand-500/30 bg-gradient-to-r from-brand-600/10 to-purple-600/10">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white">Complete your setup</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Finish the onboarding wizard to configure your compliance workspace.</p>
                </div>
                <Link href={tenantHref('/onboarding')} className="btn btn-primary btn-sm flex-shrink-0" data-testid="onboarding-cta">
                    <Sparkles className="w-3.5 h-3.5" /> Continue Setup
                </Link>
            </div>
        </div>
    );
}
