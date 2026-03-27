/**
 * Guardrail test: Admin API route authorization coverage.
 *
 * Scans all admin-only API route files to ensure they use `requireAdminCtx`
 * (or `requireRoleCtx`/`requireWriteCtx`) instead of raw `getTenantCtx`.
 *
 * This prevents regressions where a new admin route is added without
 * proper server-side admin enforcement.
 *
 * Adding a new admin route? Import `requireAdminCtx` from
 * `@/lib/auth/require-admin` instead of `getTenantCtx` from `@/app-layer/context`.
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───

/**
 * Routes that MUST use requireAdminCtx (or requireWriteCtx/requireRoleCtx).
 *
 * Format: relative path from src/app/api/t/[tenantSlug]/
 * Every route file listed here is checked for the centralized admin guard import.
 */
const ADMIN_ONLY_ROUTES = [
    // /admin/* routes
    'admin/members/route.ts',
    'admin/members/[membershipId]/route.ts',
    'admin/members/[membershipId]/deactivate/route.ts',
    'admin/settings/route.ts',
    'admin/scim/route.ts',
    'admin/integrations/route.ts',
    'admin/integrations/diagnostics/route.ts',

    // Billing routes (admin-only)
    'billing/checkout/route.ts',
    'billing/portal/route.ts',
    'billing/events/route.ts',

    // SSO configuration (admin-only)
    'sso/route.ts',

    // Security management (admin-only mutation/operations)
    'security/sessions/revoke-user/route.ts',
    'security/sessions/revoke-all/route.ts',
    'security/mfa/policy/route.ts',
];

/**
 * The import patterns that indicate proper admin authorization.
 * A route must import at least one of these.
 */
const ADMIN_GUARD_PATTERNS = [
    'requireAdminCtx',
    'requireWriteCtx',
    'requireRoleCtx',
];

const BASE_DIR = path.resolve(
    __dirname,
    '../../src/app/api/t/[tenantSlug]'
);

// ─── Tests ───

describe('Admin API route authorization coverage', () => {
    // Verify each admin route imports the centralized guard
    for (const routePath of ADMIN_ONLY_ROUTES) {
        const displayPath = `api/t/[tenantSlug]/${routePath}`;

        test(`${displayPath} uses centralized admin guard`, () => {
            const fullPath = path.join(BASE_DIR, routePath);

            // Route file must exist
            expect(fs.existsSync(fullPath)).toBe(true);

            const content = fs.readFileSync(fullPath, 'utf-8');

            // Must import at least one admin guard utility
            const hasGuard = ADMIN_GUARD_PATTERNS.some(pattern =>
                content.includes(pattern)
            );

            expect(hasGuard).toBe(true);

            // Must NOT use raw getTenantCtx (which skips role check)
            // Exception: if the file also imports a guard, it may use getTenantCtx
            // for non-admin handlers (e.g. GET that's read-only). We check that
            // the guard import exists — that's the critical assertion.
        });
    }

    // Scan for new admin/* route files not in the allowlist
    test('no admin/* route file exists without being listed in ADMIN_ONLY_ROUTES', () => {
        const adminDir = path.join(BASE_DIR, 'admin');
        if (!fs.existsSync(adminDir)) return;

        const routeFiles: string[] = [];
        function walk(dir: string, prefix: string) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    walk(path.join(dir, entry.name), rel);
                } else if (entry.name === 'route.ts') {
                    routeFiles.push(`admin/${rel}`);
                }
            }
        }
        walk(adminDir, '');

        const missing = routeFiles.filter(
            f => !ADMIN_ONLY_ROUTES.includes(f)
        );

        expect(missing).toEqual([]);
    });

    // Verify no admin route uses raw getTenantCtx without a guard
    test('no admin route uses raw getTenantCtx without an admin guard import', () => {
        const violations: string[] = [];

        for (const routePath of ADMIN_ONLY_ROUTES) {
            const fullPath = path.join(BASE_DIR, routePath);
            if (!fs.existsSync(fullPath)) continue;

            const content = fs.readFileSync(fullPath, 'utf-8');
            const hasGuard = ADMIN_GUARD_PATTERNS.some(p => content.includes(p));
            const usesRawCtx = content.includes('getTenantCtx');

            if (usesRawCtx && !hasGuard) {
                violations.push(routePath);
            }
        }

        expect(violations).toEqual([]);
    });
});
