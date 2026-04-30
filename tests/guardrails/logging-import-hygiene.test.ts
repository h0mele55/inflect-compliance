/**
 * Logging & Import Hygiene Guardrails
 *
 * Prevents regression of:
 *   1. console.* in backend server code (must use structured logger)
 *   2. Unnecessary dynamic require() in production code
 *   3. Ensures edge-logger is used for edge-safe files
 *
 * Allowlisted exceptions are documented inline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const SRC_DIR = path.resolve(__dirname, '../../src');

// ─── Helpers ────────────────────────────────────────────────────────

function readSrcFile(relativePath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relativePath), 'utf-8');
}

async function getFiles(pattern: string): Promise<string[]> {
    return glob(pattern, { cwd: SRC_DIR, posix: true });
}

// ─── Console.* Guardrail ────────────────────────────────────────────

describe('No console.* in backend server code', () => {
    /**
     * Files explicitly allowed to use console.*:
     * - edge-logger.ts: IS the console-based logger for edge runtime
     * - api-client.ts: client-side file, dev-only validation warning
     * - error.tsx / global-error.tsx: React error boundaries (browser-only)
     * - Client components (*.tsx with 'use client'): browser-side
     */
    const CONSOLE_ALLOWLIST = new Set([
        'lib/observability/edge-logger.ts',   // Edge runtime console adapter
        'lib/api-client.ts',                   // Client-side dev validation
        'instrumentation.ts',                  // Pre-init bootstrap (R-6 startup abort runs before logger)
    ]);

    // Dub-ported modules use console.* by upstream design
    const CONSOLE_ALLOWLIST_PREFIXES = [
        'lib/dub-utils/',
        'components/ui/charts/',
        'components/ui/hooks/',
        'components/ui/filter/',
        'components/ui/file-upload.tsx',
    ];

    // Client components (browser-side) are always allowed
    function isClientComponent(content: string): boolean {
        // Check first non-empty line for 'use client'
        const firstLine = content.split('\n').find(l => l.trim().length > 0);
        return firstLine?.includes("'use client'") || firstLine?.includes('"use client"') || false;
    }

    it('no console.log/warn/error/info in server-side src/ files', async () => {
        const tsFiles = await getFiles('**/*.{ts,tsx}');
        const violations: string[] = [];

        for (const file of tsFiles) {
            if (CONSOLE_ALLOWLIST.has(file)) continue;
            if (CONSOLE_ALLOWLIST_PREFIXES.some(p => file.startsWith(p))) continue;
            // Skip node_modules just in case
            if (file.includes('node_modules')) continue;

            const content = readSrcFile(file);

            // Skip client components
            if (isClientComponent(content)) continue;

            // Check for console.* calls
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (/console\.(log|warn|error|info|debug)\(/.test(line)) {
                    // Allow if eslint-disable-line no-console is present
                    if (line.includes('eslint-disable-line no-console')) continue;
                    // Allow if inside a comment
                    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
                    violations.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            }
        }

        if (violations.length > 0) {
            fail(
                `Found ${violations.length} console.* call(s) in server code ` +
                `(use logger from @/lib/observability/logger instead):\n` +
                violations.map(v => `  ${v}`).join('\n'),
            );
        }
    });
});

// ─── Dynamic require() Guardrail ────────────────────────────────────

describe('Dynamic require() usage is minimized', () => {
    /**
     * Allowed require() patterns and WHY they're allowed:
     *
     * Circular dependency avoidance (prisma ↔ audit-writer):
     * - prisma.ts → require('./audit/audit-writer')
     * - audit-writer.ts → require('../prisma')
     * - retention-purge.ts → require('./audit/audit-writer')
     * - evidence-maintenance.ts → require('@/lib/audit/audit-writer')
     *
     * Startup-time lazy loading:
     * - mailer.ts → require('@/env') in initMailerFromEnv()
     * - instrumentation.ts → require('./logger') at bootstrap
     *
     * Conditional providers:
     * - storage/index.ts → require('./s3-provider') / require('./local-provider')
     *
     * Large data lazy loading:
     * - framework-provider.ts → require('@/data/...')
     *
     * Conditional health check:
     * - readyz/route.ts → require('@/lib/redis')
     */
    const REQUIRE_ALLOWLIST: Record<string, string[]> = {
        'lib/prisma.ts': ['./audit/audit-writer'],
        'lib/audit/audit-writer.ts': ['../prisma'],
        // Epic B — same circular-import dance as audit-writer.ts.
        // `prisma.ts` registers middleware that lives in the audit
        // chain; org-audit-writer is imported directly by usecases
        // and needs the singleton prisma client at runtime, not at
        // module-load time.
        'lib/audit/org-audit-writer.ts': ['../prisma'],
        'lib/retention-purge.ts': ['./audit/audit-writer'],
        'lib/mailer.ts': ['@/env'],
        'lib/observability/instrumentation.ts': ['./logger'],
        'lib/storage/index.ts': ['./s3-provider', './local-provider'],
        'app-layer/libraries/framework-provider.ts': ['@/data/frameworks', '@/data/clauses'],
        'app-layer/usecases/evidence-maintenance.ts': ['@/lib/audit/audit-writer'],
        'app/api/readyz/route.ts': ['@/lib/redis'],
        // GAP-13 — same conditional Redis check pattern as readyz.
        'app/api/health/route.ts': ['@/lib/redis'],
        // Epic A.1 — `rls-middleware` is imported by `lib/prisma.ts` to
        // install the tripwire at startup; the prisma reference must be
        // lazy to avoid a TDZ cycle.
        'lib/db/rls-middleware.ts': ['@/lib/prisma'],
        // Epic B.2 — the encryption middleware resolves a per-tenant
        // DEK on every query; the key-manager module is lazy-required
        // so the middleware module evaluates without the key-manager
        // graph, mirroring the rls-middleware pattern.
        'lib/db/encryption-middleware.ts': ['@/lib/security/tenant-key-manager'],
    };

    it('no unexpected require() in src/ files', async () => {
        const tsFiles = await getFiles('**/*.ts');
        const violations: string[] = [];

        for (const file of tsFiles) {
            if (file.includes('node_modules')) continue;

            const content = readSrcFile(file);
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Match require('...') or require("...")
                const match = line.match(/require\(['"]([^'"]+)['"]\)/);
                if (!match) continue;

                // Skip comments
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

                const moduleName = match[1];
                const allowed = REQUIRE_ALLOWLIST[file];
                if (allowed && allowed.includes(moduleName)) continue;

                violations.push(`${file}:${i + 1}: require('${moduleName}') — ${line.trim().substring(0, 80)}`);
            }
        }

        if (violations.length > 0) {
            fail(
                `Found ${violations.length} unexpected require() call(s) in src/:\n` +
                violations.map(v => `  ${v}`).join('\n') +
                '\n\nIf this require() is justified, add it to REQUIRE_ALLOWLIST in this test.',
            );
        }
    });
});

// ─── Structured Logger Coverage ─────────────────────────────────────

describe('Structured logger is used across backend', () => {
    it('logger module exports expected API', () => {
        const content = readSrcFile('lib/observability/logger.ts');
        expect(content).toContain('export const logger');
        expect(content).toContain('export function log(');
        expect(content).toContain('export function extractErrorMeta(');
    });

    it('edge-logger module exports expected API', () => {
        const content = readSrcFile('lib/observability/edge-logger.ts');
        expect(content).toContain('export const edgeLogger');
    });

    it('Pino redaction covers sensitive fields', () => {
        const content = readSrcFile('lib/observability/logger.ts');
        for (const field of ['password', 'secret', 'token', 'accessToken', 'refreshToken', 'privateKey']) {
            expect(content).toContain(`'${field}'`);
        }
    });
});
