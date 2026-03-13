import type { Role } from '@prisma/client';

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
