import type { Role } from '@prisma/client';
import type { PermissionSet } from '@/lib/permissions';

export interface RequestContext {
    /** Unique request identifier for log correlation */
    requestId: string;

    /** The authenticated user ID */
    userId: string;

    /** The resolved tenant ID */
    tenantId: string;

    /** The resolved tenant slug (if available from route) */
    tenantSlug?: string;

    /** The effective role of the user within this tenant */
    role: Role;

    /** Effective permissions derived from the role */
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };

    /** Granular UI permission set — custom role–aware when customRoleId is present */
    appPermissions: PermissionSet;

    /** Present when the request was authenticated via API key (M2M) */
    apiKeyId?: string;

    /** Scopes granted to the API key (e.g. ["controls:read", "evidence:write"]) */
    apiKeyScopes?: string[];
}

export interface PaginatedResult<T> {
    data: T[];
    metadata: {
        total: number;
        page: number;
        limit: number;
        hasMore: boolean;
    };
}
