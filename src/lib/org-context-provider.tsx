'use client';

import { createContext, useContext, useCallback } from 'react';
import type { OrgRole } from '@prisma/client';
import type { OrgPermissionSet } from '@/lib/permissions';

// ─── Org context (Epic O-4) ──────────────────────────────────────────
//
// Parallel to `TenantContext`. A request resolves to ONE of the two
// providers — never both at once. `/org/[slug]/...` mounts
// `OrgProvider`; `/t/[slug]/...` mounts `TenantProvider`. Drill-down
// from portfolio → tenant detail is a navigation, not a nested
// provider — the new page's layout owns its own context.

export interface OrgContextValue {
    organizationId: string;
    orgSlug: string;
    orgName: string;
    role: OrgRole;
    permissions: OrgPermissionSet;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({
    value,
    children,
}: {
    value: OrgContextValue;
    children: React.ReactNode;
}) {
    return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContext(): OrgContextValue {
    const ctx = useContext(OrgContext);
    if (!ctx) {
        throw new Error('useOrgContext must be used within an OrgProvider');
    }
    return ctx;
}

/** Granular org permission flags for UI rendering logic. */
export function useOrgPermissions(): OrgPermissionSet {
    return useOrgContext().permissions;
}

/** Build an org-scoped href: `/org/<slug>/<path>` */
export function useOrgHref() {
    const { orgSlug } = useOrgContext();
    return useCallback(
        (path: string) => `/org/${orgSlug}${path.startsWith('/') ? path : `/${path}`}`,
        [orgSlug],
    );
}

/** Build an org-scoped API URL: `/api/org/<slug>/<path>` */
export function useOrgApiUrl() {
    const { orgSlug } = useOrgContext();
    return useCallback(
        (path: string) => `/api/org/${orgSlug}${path.startsWith('/') ? path : `/${path}`}`,
        [orgSlug],
    );
}
