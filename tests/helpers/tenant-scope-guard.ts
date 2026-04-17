/**
 * Tenant Scope Guard — Reusable Test Utilities
 *
 * Provides assertion helpers for verifying tenant isolation in
 * background jobs and services. Use these in any job/service test
 * to prove tenant scope is preserved end-to-end.
 *
 * PATTERN FOR FUTURE CONTRIBUTORS:
 * When adding a new tenant-scoped job:
 *   1. Accept `tenantId?: string` in the job options
 *   2. Pass it to the service layer
 *   3. Apply it to ALL Prisma where clauses via `if (tenantId) where.tenantId = tenantId`
 *   4. Add a test using `assertAllQueriesScoped()` from this file
 *   5. Verify with `assertNoTenantLeakage()`
 *
 * @module tests/helpers/tenant-scope-guard
 */

/**
 * Assert that every call to a mock Prisma findMany includes tenantId
 * in its where clause.
 *
 * @param mockFn   The jest.fn() that intercepts Prisma findMany calls
 * @param tenantId The expected tenantId in every query
 * @param label    Human-readable label for error messages
 */
export function assertAllQueriesScoped(
    mockFn: jest.Mock,
    tenantId: string,
    label = 'query',
): void {
    const calls = mockFn.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    for (let i = 0; i < calls.length; i++) {
        const where = calls[i][0]?.where;
        expect(where).toBeDefined();
        expect(where).toHaveProperty('tenantId', tenantId);
    }
}

/**
 * Assert that no call to a mock Prisma findMany includes the
 * forbidden tenantId. Proves cross-tenant isolation.
 *
 * @param mockFn          The jest.fn() that intercepts Prisma findMany calls
 * @param forbiddenTenant The tenantId that must NEVER appear
 * @param label           Human-readable label for error messages
 */
export function assertNoTenantLeakage(
    mockFn: jest.Mock,
    forbiddenTenant: string,
    label = 'query',
): void {
    for (const call of mockFn.mock.calls) {
        const where = call[0]?.where;
        if (where?.tenantId) {
            expect(where.tenantId).not.toBe(forbiddenTenant);
        }
    }
}

/**
 * Assert that queries run in system-wide mode (no tenantId filter).
 *
 * @param mockFn The jest.fn() that intercepts Prisma findMany calls
 */
export function assertQueriesUnscoped(
    mockFn: jest.Mock,
): void {
    const calls = mockFn.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
        const where = call[0]?.where;
        expect(where).not.toHaveProperty('tenantId');
    }
}

/**
 * Assert that a result set contains only items from the expected tenant.
 *
 * @param results    Array of objects with tenantId field
 * @param tenantId   The expected tenantId on all results
 */
export function assertResultsBelongToTenant(
    results: Array<{ tenantId: string }>,
    tenantId: string,
): void {
    for (const r of results) {
        expect(r.tenantId).toBe(tenantId);
    }
}

/**
 * Assert that structured logging includes the correct scope marker.
 *
 * @param mockLogger  The mock logger with .info calls
 * @param logMessage  The log message to find
 * @param expected    Expected scope fields
 */
export function assertScopeLogged(
    mockLogger: { info: jest.Mock },
    logMessage: string,
    expected: { scope: 'tenant-scoped' | 'system-wide'; tenantId?: string },
): void {
    const logCall = mockLogger.info.mock.calls.find(
        (c: string[]) => c[0] === logMessage
    );
    expect(logCall).toBeDefined();
    expect(logCall[1]).toMatchObject({ scope: expected.scope });
    if (expected.tenantId) {
        expect(logCall[1]).toHaveProperty('tenantId', expected.tenantId);
    } else {
        expect(logCall[1]).not.toHaveProperty('tenantId');
    }
}
