/**
 * CI Regression Guard: Prevents accidental direct prisma/logAudit usage in route handlers.
 *
 * This test scans source files and FAILS if:
 * - Repositories import global prisma (except allowlisted)
 * - Usecases import global prisma (except allowlisted)
 * - ANY route handler (tenant-scoped or legacy) contains direct prisma usage
 * - ANY route handler contains logAudit calls (should be in usecases/events)
 * - ANY business route handler contains requireRole calls (should be in policies)
 *
 * RUN: npx jest tests/unit/no-direct-prisma.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');

function readFilesInDir(dir: string, ext = '.ts'): { name: string; content: string; relPath: string }[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith(ext))
        .map((f) => ({
            name: f,
            content: fs.readFileSync(path.join(dir, f), 'utf8'),
            relPath: path.join(dir, f).replace(SRC_ROOT, 'src'),
        }));
}

function walkDir(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        } else if (entry.name.endsWith('.ts')) {
            results.push(fullPath);
        }
    }
    return results;
}

function getNonCommentLines(content: string): string[] {
    return content.split('\n').filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    });
}

describe('CI Guard: No direct prisma in tenant-scoped code', () => {
    // ─── Repositories ───
    const REPO_ALLOWLIST = ['ClauseRepository.ts', 'RiskTemplateRepository.ts', 'SsoConfigRepository.ts', 'IdentityLinkRepository.ts'];

    const repos = readFilesInDir(path.join(SRC_ROOT, 'app-layer/repositories'));

    for (const file of repos) {
        if (REPO_ALLOWLIST.includes(file.name)) continue;

        it(`${file.name} must NOT import global prisma`, () => {
            const hasPrismaImport =
                file.content.includes("from '@/lib/prisma'") ||
                file.content.includes('from "@/lib/prisma"') ||
                file.content.includes("from '../../lib/prisma'") ||
                file.content.includes('from "../../lib/prisma"');

            expect(hasPrismaImport).toBe(false);
        });
    }

    // ─── Usecases ───
    const USECASE_ALLOWLIST: string[] = [
        'sso.ts', 'mfa.ts', 'mfa-enrollment.ts', 'mfa-challenge.ts',
        'session-security.ts', 'webhook-processor.ts', 'scim-users.ts',
        'framework.ts', 'audit-hardening.ts',
        // Epic 1, PR 3 — redeemInvite and previewInviteByToken operate without
        // a tenant-scoped RequestContext (the caller is not yet a tenant member),
        // so they use the global prisma client directly. RLS policies are
        // bypassed intentionally here since the user has no tenant session.
        'tenant-invites.ts',
        // Epic 1, PR 2 — createTenantWithOwner + transferTenantOwnership run
        // under platform-admin auth with NO user RequestContext. Tenant is
        // being created or its ownership is changing; RLS doesn't apply
        // (Tenant itself is not in TENANT_SCOPED_MODELS).
        'tenant-lifecycle.ts',
    ];

    const usecases = readFilesInDir(path.join(SRC_ROOT, 'app-layer/usecases'));

    for (const file of usecases) {
        if (USECASE_ALLOWLIST.includes(file.name)) continue;

        it(`${file.name} must NOT import global prisma`, () => {
            const hasPrismaImport =
                file.content.includes("from '@/lib/prisma'") ||
                file.content.includes('from "@/lib/prisma"');

            expect(hasPrismaImport).toBe(false);
        });
    }

    // ─── Usecases must use runInTenantContext, not raw withTenantDb ───
    // Exception: background-job modules that accept raw tenantId (no RequestContext)
    // legitimately use the lower-level withTenantDb wrapper. RLS is still enforced.
    const WITH_TENANT_DB_ALLOWLIST = ['evidence-maintenance.ts'];

    for (const file of usecases) {
        if (WITH_TENANT_DB_ALLOWLIST.includes(file.name)) continue;

        it(`${file.name} must use runInTenantContext (not raw withTenantDb)`, () => {
            const hasWithTenantDb = file.content.includes('withTenantDb(');
            expect(hasWithTenantDb).toBe(false);
        });
    }

    // ─── ALL route handlers (tenant-scoped + legacy) ───
    // Auth routes are explicitly excluded — they handle registration/login with global tables
    const ROUTE_DIR_ALLOWLIST = ['auth', 'health', 'staging', 'scim', 'integrations'];

    const apiDir = path.join(SRC_ROOT, 'app/api');
    const allRouteFiles = walkDir(apiDir).filter((f) => f.endsWith('route.ts'));

    for (const filePath of allRouteFiles) {
        const relPath = filePath.replace(SRC_ROOT + path.sep, '');

        // Skip allowlisted auth routes
        const pathParts = relPath.split(path.sep);
        const isAllowlisted = ROUTE_DIR_ALLOWLIST.some((dir) =>
            pathParts.includes(dir)
        );
        if (isAllowlisted) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const nonCommentLines = getNonCommentLines(content);

        it(`route ${relPath} must NOT call prisma directly`, () => {
            const violations = nonCommentLines.filter((line) =>
                /\bprisma\.\w+\b/.test(line) &&
                !line.includes('customPrisma') &&
                !line.includes('globalPrisma')
            );
            expect(violations).toEqual([]);
        });

        it(`route ${relPath} must NOT call logAudit directly`, () => {
            const violations = nonCommentLines.filter((line) =>
                /\blogAudit\s*\(/.test(line)
            );
            expect(violations).toEqual([]);
        });

        it(`route ${relPath} must NOT call requireRole directly`, () => {
            const violations = nonCommentLines.filter((line) =>
                /\brequireRole\s*\(/.test(line)
            );
            expect(violations).toEqual([]);
        });
    }
});
