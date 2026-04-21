import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAuditLogs } from '@/app-layer/usecases/auditLog';
import { Shield, CreditCard, KeyRound, ShieldCheck, ShieldPlus, Users, CloudCog, Plug, Palette } from 'lucide-react';
import Link from 'next/link';
import { AdminClient } from './AdminClient';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export const dynamic = 'force-dynamic';

/**
 * Admin — Server Component wrapper.
 * Fetches audit log server-side, renders navigation links server-side,
 * delegates only tab switching to client island.
 */
export default async function AdminPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    // Translations and tenant context are independent — fetch in parallel
    const [t, tc, ctx] = await Promise.all([
        getTranslations('admin'),
        getTranslations('common'),
        getTenantCtx({ tenantSlug }),
    ]);

    let auditLog: unknown[] = [];
    try {
        auditLog = await listAuditLogs(ctx);
    } catch {
        // User may not have AUDITOR/ADMIN role — gracefully degrade
        auditLog = [];
    }

    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    const templateKeys = [
        'infoSecurity', 'accessControl', 'incidentResponse', 'acceptableUse',
        'supplierSecurity', 'backup', 'changeManagement', 'cryptography', 'logging',
    ] as const;

    const templateLabels: Record<string, string> = {};
    for (const key of templateKeys) {
        templateLabels[key] = t(`templates.${key}`);
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{t('title')}</h1>
                <div className="flex items-center gap-3 glass-card px-4 py-2" id="admin-theme-section">
                    <Palette className="w-4 h-4 text-content-muted" />
                    <span className="text-sm text-content-muted">Theme</span>
                    <ThemeToggle id="admin-theme-toggle" />
                </div>
            </div>

            {/* Navigation links — server-rendered, no JS needed */}
            <div className="flex gap-2 flex-wrap">
                {/* Tab buttons are rendered inside the client island below */}
            </div>

            {/* Navigation pills — pure server-rendered links */}
            <div className="flex gap-2 flex-wrap">
                <Link
                    href={tenantHref('/admin/members')}
                    className="btn btn-secondary"
                    id="members-pill-btn"
                >
                    <Users className="w-3.5 h-3.5" />
                    Members &amp; Roles
                </Link>
                <Link
                    href={tenantHref('/admin/rbac')}
                    className="btn btn-secondary"
                    id="rbac-pill-btn"
                >
                    <Shield className="w-3.5 h-3.5" />
                    Roles &amp; Access
                </Link>
                <Link
                    href={tenantHref('/admin/roles')}
                    className="btn btn-secondary"
                    id="custom-roles-pill-btn"
                >
                    <ShieldPlus className="w-3.5 h-3.5" />
                    Custom Roles
                </Link>
                <Link
                    href={tenantHref('/admin/api-keys')}
                    className="btn btn-secondary"
                    id="api-keys-pill-btn"
                >
                    <KeyRound className="w-3.5 h-3.5" />
                    API Keys
                </Link>
                <Link
                    href={tenantHref('/admin/billing')}
                    className="btn btn-secondary"
                    id="billing-pill-btn"
                >
                    <CreditCard className="w-3.5 h-3.5" />
                    Billing
                </Link>
                <Link
                    href={tenantHref('/admin/sso')}
                    className="btn btn-secondary"
                    id="sso-pill-btn"
                >
                    <KeyRound className="w-3.5 h-3.5" />
                    SSO &amp; Identity
                </Link>
                <Link
                    href={tenantHref('/admin/scim')}
                    className="btn btn-secondary"
                    id="scim-pill-btn"
                >
                    <CloudCog className="w-3.5 h-3.5" />
                    SCIM Provisioning
                </Link>
                <Link
                    href={tenantHref('/admin/integrations')}
                    className="btn btn-secondary"
                    id="integrations-pill-btn"
                >
                    <Plug className="w-3.5 h-3.5" />
                    Integrations
                </Link>
                <Link
                    href={tenantHref('/admin/security')}
                    className="btn btn-secondary"
                    id="security-pill-btn"
                >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Security &amp; MFA
                </Link>
            </div>

            {/* Interactive tabs — client island */}
            <AdminClient
                auditLog={JSON.parse(JSON.stringify(auditLog))}
                tenantSlug={tenantSlug}
                translations={{
                    title: t('title'),
                    auditLog: t('auditLog'),
                    policyTemplates: t('policyTemplates'),
                    time: t('time'),
                    user: t('user'),
                    action: t('action'),
                    entity: t('entity'),
                    details: t('details'),
                    noEntries: t('noEntries'),
                    templateDescription: t('templateDescription'),
                    clickToUse: t('clickToUse'),
                    templateLabels,
                }}
            />
        </div>
    );
}
