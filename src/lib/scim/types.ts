/**
 * SCIM 2.0 Response Shapes
 *
 * Standards-aligned response types for SCIM endpoints.
 * Based on RFC 7643 (Core Schema) and RFC 7644 (Protocol).
 */

export const SCIM_SCHEMAS = {
    User: 'urn:ietf:params:scim:schemas:core:2.0:User',
    ListResponse: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
    Error: 'urn:ietf:params:scim:api:messages:2.0:Error',
    PatchOp: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
    ServiceProviderConfig: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
} as const;

export interface ScimUser {
    schemas: string[];
    id: string;
    externalId?: string;
    userName: string;   // email
    name?: {
        formatted?: string;
        familyName?: string;
        givenName?: string;
    };
    displayName?: string;
    emails?: Array<{
        value: string;
        type: string;
        primary: boolean;
    }>;
    active: boolean;
    meta: {
        resourceType: 'User';
        created: string;
        lastModified: string;
        location: string;
    };
}

export interface ScimListResponse<T> {
    schemas: string[];
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
    Resources: T[];
}

export interface ScimError {
    schemas: string[];
    status: string;
    scimType?: string;
    detail: string;
}

export interface ScimPatchOp {
    schemas: string[];
    Operations: Array<{
        op: 'add' | 'remove' | 'replace';
        path?: string;
        value?: unknown;
    }>;
}

/**
 * Build a SCIM error response object.
 */
export function scimError(status: number, detail: string, scimType?: string): ScimError {
    return {
        schemas: [SCIM_SCHEMAS.Error],
        status: String(status),
        ...(scimType && { scimType }),
        detail,
    };
}

/**
 * Build a SCIM ListResponse wrapper.
 */
export function scimListResponse<T>(resources: T[], total: number, startIndex = 1): ScimListResponse<T> {
    return {
        schemas: [SCIM_SCHEMAS.ListResponse],
        totalResults: total,
        startIndex,
        itemsPerPage: resources.length,
        Resources: resources,
    };
}

/**
 * Build a SCIM ServiceProviderConfig response.
 */
export function scimServiceProviderConfig(baseUrl: string) {
    return {
        schemas: [SCIM_SCHEMAS.ServiceProviderConfig],
        documentationUri: `${baseUrl}/docs/scim`,
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
            {
                type: 'oauthbearertoken',
                name: 'OAuth Bearer Token',
                description: 'Authentication via tenant-scoped SCIM bearer token',
                specUri: 'https://tools.ietf.org/html/rfc6750',
                primary: true,
            },
        ],
        meta: {
            resourceType: 'ServiceProviderConfig',
            location: `${baseUrl}/api/scim/v2/ServiceProviderConfig`,
        },
    };
}
