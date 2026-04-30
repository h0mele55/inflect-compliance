/**
 * Epic E — API Contract Completeness guardrail.
 *
 * Enforces that EVERY route handler under `src/app/api/**\/route.ts`
 * either:
 *   (a) imports + uses `withApiErrorHandling` (the canonical path), OR
 *   (b) appears in `BARE_ROUTE_EXEMPTIONS` with a written reason.
 *
 * Three failure modes the guard catches:
 *
 *   1. **Coverage gap** — a new bare route landed without a written
 *      exemption. Fail with the route path + a pointer to the
 *      exemption file.
 *
 *   2. **Stale exemption (route now wrapped)** — a route was wrapped
 *      but its exemption entry wasn't removed. Dead taxonomy.
 *
 *   3. **Stale exemption (file gone)** — the route file was deleted
 *      without removing its exemption. Garbage collection.
 *
 * The guard also runs an in-memory mutation regression: stripping
 * `withApiErrorHandling` from a known-wrapped route MUST trip the
 * detector. This proves the detector isn't vacuously passing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BARE_ROUTE_EXEMPTIONS } from '@/lib/errors/route-exemptions';

const REPO_ROOT = path.resolve(__dirname, '../..');
const API_ROOT = path.join(REPO_ROOT, 'src/app/api');

const WRAPPER_TOKEN = 'withApiErrorHandling';

function listAllRoutes(): string[] {
    const out: string[] = [];
    function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(abs);
            } else if (entry.name === 'route.ts') {
                out.push(abs);
            }
        }
    }
    walk(API_ROOT);
    return out.sort();
}

function relPath(absPath: string): string {
    return path.relative(API_ROOT, absPath);
}

function isWrapped(content: string): boolean {
    return content.includes(WRAPPER_TOKEN);
}

describe('Epic E — API error-handler coverage guardrail', () => {
    const allRoutes = listAllRoutes();
    const exemptionPaths = new Set(BARE_ROUTE_EXEMPTIONS.map((e) => e.file));

    it('discovers a meaningful number of routes (sanity)', () => {
        // If the API surface drops below this floor we want to know
        // — the detector can't be silently neutered by `find`-rotting
        // its way to zero results. The current API has 270+ routes;
        // 100 is a generous lower bound.
        expect(allRoutes.length).toBeGreaterThan(100);
    });

    it('every bare route is in BARE_ROUTE_EXEMPTIONS', () => {
        const violations: string[] = [];
        for (const abs of allRoutes) {
            const content = fs.readFileSync(abs, 'utf8');
            if (isWrapped(content)) continue;
            const rel = relPath(abs);
            if (!exemptionPaths.has(rel)) {
                violations.push(rel);
            }
        }

        if (violations.length > 0) {
            throw new Error(
                [
                    'API routes missing withApiErrorHandling and not in the exemption registry:',
                    ...violations.map((v) => `  - ${v}`),
                    '',
                    'Fix one of two ways:',
                    '  (a) Wrap the handler with `withApiErrorHandling(...)` from @/lib/errors/api',
                    '      to inherit the standardized ApiErrorResponse contract.',
                    '  (b) If the route legitimately needs a different contract',
                    '      (k8s probe, redirect-only, anti-enumeration, webhook),',
                    '      add an entry to BARE_ROUTE_EXEMPTIONS in',
                    '      src/lib/errors/route-exemptions.ts with a written reason.',
                ].join('\n'),
            );
        }
        expect(violations).toEqual([]);
    });

    it('every exemption file actually exists on disk', () => {
        const missing: string[] = [];
        for (const entry of BARE_ROUTE_EXEMPTIONS) {
            const abs = path.join(API_ROOT, entry.file);
            if (!fs.existsSync(abs)) {
                missing.push(entry.file);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                [
                    'BARE_ROUTE_EXEMPTIONS references files that no longer exist:',
                    ...missing.map((v) => `  - ${v}`),
                    '',
                    'Remove these entries from src/lib/errors/route-exemptions.ts.',
                ].join('\n'),
            );
        }
    });

    it('no exemption is dead (file exists but is now wrapped)', () => {
        const dead: string[] = [];
        for (const entry of BARE_ROUTE_EXEMPTIONS) {
            const abs = path.join(API_ROOT, entry.file);
            if (!fs.existsSync(abs)) continue; // covered by previous test
            const content = fs.readFileSync(abs, 'utf8');
            if (isWrapped(content)) {
                dead.push(entry.file);
            }
        }
        if (dead.length > 0) {
            throw new Error(
                [
                    'BARE_ROUTE_EXEMPTIONS contains entries for routes that ARE wrapped:',
                    ...dead.map((v) => `  - ${v}`),
                    '',
                    'Either remove the exemption (the route is now in canonical contract),',
                    'or remove the wrapper if the bypass is intentional.',
                ].join('\n'),
            );
        }
    });

    it('every exemption carries a non-trivial reason', () => {
        for (const entry of BARE_ROUTE_EXEMPTIONS) {
            // Reason must be substantive — a one-word "TODO" or empty
            // string slipping through review is exactly what this is
            // protecting against.
            expect(entry.reason.length).toBeGreaterThanOrEqual(40);
            expect(entry.category).toBeTruthy();
        }
    });

    it('mutation regression — stripping the wrapper from a known route trips the guard', () => {
        // Pick the smallest known-wrapped route. We don't write to
        // disk; the mutation is in-memory. If the detector still
        // reports "wrapped" on the broken variant, the regex itself
        // is meaningless.
        const target = path.join(API_ROOT, 'auth/ui-config/route.ts');
        const original = fs.readFileSync(target, 'utf8');
        expect(isWrapped(original)).toBe(true);

        const broken = original.replace(/withApiErrorHandling/g, 'noopWrapper');
        expect(isWrapped(broken)).toBe(false);
    });

    it('every wrapped route imports the wrapper from @/lib/errors/api', () => {
        // A route that mentions `withApiErrorHandling` only in a
        // comment / string would pass the wrapped-check but actually
        // be bare. Confirm the wrapper is reached through a real
        // import. Allow either single- or double-quoted form.
        const wrappedNoImport: string[] = [];
        for (const abs of allRoutes) {
            const content = fs.readFileSync(abs, 'utf8');
            if (!isWrapped(content)) continue;
            const hasImport =
                /from\s+['"]@\/lib\/errors\/api['"]/.test(content);
            if (!hasImport) wrappedNoImport.push(relPath(abs));
        }
        if (wrappedNoImport.length > 0) {
            throw new Error(
                [
                    'Routes mention withApiErrorHandling but do not import it from @/lib/errors/api:',
                    ...wrappedNoImport.map((v) => `  - ${v}`),
                ].join('\n'),
            );
        }
    });
});
