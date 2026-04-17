/**
 * Scheduled Job Scope Audit — Cross-Job Tenant Isolation Guard
 *
 * This test suite acts as a structural guard to ensure every scheduled
 * job's executor properly propagates tenantId from payload to the
 * underlying service function. If a new job is added without tenant
 * scoping, these tests catch it.
 *
 * Tests verify:
 * 1. Every job payload with tenantId passes it through the executor
 * 2. The executor-registry wiring does not silently drop tenantId
 * 3. Known tenant-scoped services accept tenantId in their API signatures
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ═════════════════════════════════════════════════════════════════════
// 1. Executor Registry — tenantId propagation audit
// ═════════════════════════════════════════════════════════════════════

describe('Executor Registry — tenantId propagation audit', () => {
    const registryPath = resolve(__dirname, '../../src/app-layer/jobs/executor-registry.ts');
    const registrySource = readFileSync(registryPath, 'utf8');

    /**
     * Extract each executor registration block and verify that if the
     * payload type has tenantId, the executor references payload.tenantId.
     */
    test('no executor silently ignores payload.tenantId', () => {
        // Find all register(...) blocks
        const registerPattern = /executorRegistry\.register\('([^']+)',\s*async\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*?)\}\);/g;
        const violations: string[] = [];

        let match;
        while ((match = registerPattern.exec(registrySource)) !== null) {
            const jobName = match[1];
            const paramName = match[2].trim();
            const body = match[3];

            // Skip jobs that don't need tenantId (health-check, sync-pull)
            if (['health-check', 'sync-pull'].includes(jobName)) continue;

            // If the parameter is named _payload, it means tenantId is being ignored
            if (paramName.startsWith('_')) {
                violations.push(
                    `${jobName}: parameter named "${paramName}" — tenantId is likely ignored`
                );
                continue;
            }

            // The body should reference payload.tenantId somewhere
            if (!body.includes('tenantId')) {
                violations.push(
                    `${jobName}: executor body does not reference tenantId`
                );
            }
        }

        expect(violations).toEqual([]);
    });

    /**
     * Verify that no executor uses _payload (underscore-prefixed = unused).
     * This was the exact pattern that caused the policy-review-reminder bug.
     */
    test('no executor uses _payload (unused parameter pattern)', () => {
        const underscorePattern = /executorRegistry\.register\('[^']+',\s*async\s*\(_payload\)/g;
        const matches = registrySource.match(underscorePattern) || [];
        expect(matches).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════
// 2. Service API — tenantId acceptance audit
// ═════════════════════════════════════════════════════════════════════

describe('Service API — tenantId acceptance audit', () => {
    const services = [
        {
            name: 'vendor-renewals',
            path: 'src/app-layer/services/vendor-renewals.ts',
            expectedPattern: /tenantId/,
        },
        {
            name: 'policyReviewReminder',
            path: 'src/app-layer/jobs/policyReviewReminder.ts',
            expectedPattern: /tenantId/,
        },
    ];

    for (const svc of services) {
        test(`${svc.name} accepts tenantId in its API`, () => {
            const source = readFileSync(resolve(__dirname, '../../', svc.path), 'utf8');
            expect(source).toMatch(svc.expectedPattern);
        });
    }

    /**
     * Verify that the vendor-renewals service uses tenantFilter pattern.
     * This ensures the fix is structural, not just a parameter addition.
     */
    test('vendor-renewals service applies tenantFilter to queries', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/app-layer/services/vendor-renewals.ts'),
            'utf8'
        );
        // Must spread tenantFilter into all 4 query where clauses
        const filterApplications = (source.match(/\.\.\.tenantFilter/g) || []).length;
        expect(filterApplications).toBeGreaterThanOrEqual(4);
    });

    /**
     * Verify that policyReviewReminder adds tenantId to its where clause.
     */
    test('policyReviewReminder applies tenantId to query where', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/app-layer/jobs/policyReviewReminder.ts'),
            'utf8'
        );
        expect(source).toMatch(/if\s*\(tenantId\)\s*where\.tenantId\s*=\s*tenantId/);
    });
});

// ═════════════════════════════════════════════════════════════════════
// 3. Schedule definitions — no tenant-scoped job runs without tenantId
// ═════════════════════════════════════════════════════════════════════

describe('Schedule definitions — scope clarity', () => {
    test('scheduled jobs with empty defaultPayload are system-wide by design', () => {
        // This is a documentation guard — all scheduled cron jobs run without
        // tenantId, which means they are system-wide. This is intentional.
        // Tenant-scoped execution only happens via notification-dispatch or
        // direct executor calls with a specific tenantId.
        const schedulesPath = resolve(__dirname, '../../src/app-layer/jobs/schedules.ts');
        const source = readFileSync(schedulesPath, 'utf8');

        // No schedule should hardcode a specific tenantId
        expect(source).not.toMatch(/tenantId:\s*'/);
        expect(source).not.toMatch(/tenantId:\s*"/);
    });
});
