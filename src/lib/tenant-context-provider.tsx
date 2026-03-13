'use client';

import { createContext, useContext, useCallback } from 'react';
import type { Role } from '@prisma/client';

// ─── Tenant context ───

export interface TenantContextValue {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    role: Role;
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
    value,
    children,
}: {
    value: TenantContextValue;
    children: React.ReactNode;
}) {
    return (
        <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
    );
}

export function useTenantContext(): TenantContextValue {
    const ctx = useContext(TenantContext);
    if (!ctx) {
        throw new Error('useTenantContext must be used within a TenantProvider');
    }
    return ctx;
}

/**
 * Build a tenant-scoped href: `/t/<slug>/<path>`
 */
export function useTenantHref() {
    const { tenantSlug } = useTenantContext();
    return useCallback(
        (path: string) => `/t/${tenantSlug}${path.startsWith('/') ? path : `/${path}`}`,
        [tenantSlug]
    );
}

/**
 * Build a tenant-scoped API URL: `/api/t/<slug>/<path>`
 */
export function useTenantApiUrl() {
    const { tenantSlug } = useTenantContext();
    return useCallback(
        (path: string) => `/api/t/${tenantSlug}${path.startsWith('/') ? path : `/${path}`}`,
        [tenantSlug]
    );
}
