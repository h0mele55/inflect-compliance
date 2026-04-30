/**
 * Structural ratchet: evidence-import is wired into the canonical job
 * pipeline (Epic 43.3).
 *
 * Locks three invariants:
 *   1. The job name + payload type are present on JobPayloadMap.
 *   2. JOB_DEFAULTS carries the non-retry posture (one attempt).
 *   3. The executor-registry registers the executor.
 *
 * If a future refactor moved the registration off the canonical
 * registry (e.g. inlined into the worker only), the worker would
 * still pick it up but the registry-based routing other tenants
 * rely on would break silently.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Epic 43.3 — evidence-import job registration', () => {
    const types = read('src/app-layer/jobs/types.ts');
    const registry = read('src/app-layer/jobs/executor-registry.ts');
    const route = read(
        'src/app/api/t/[tenantSlug]/evidence/imports/route.ts',
    );
    const statusRoute = read(
        'src/app/api/t/[tenantSlug]/evidence/imports/[jobId]/route.ts',
    );

    it('JobPayloadMap includes evidence-import with EvidenceImportPayload', () => {
        expect(types).toContain("'evidence-import': EvidenceImportPayload");
        expect(types).toMatch(/export interface EvidenceImportPayload\b/);
    });

    it('JOB_DEFAULTS uses single-attempt non-retry posture', () => {
        // Because partial extraction can't be trivially undone, we
        // refuse to auto-retry — an operator re-runs after fixing.
        expect(types).toMatch(
            /'evidence-import':\s*\{[\s\S]*?attempts:\s*1[\s\S]*?\}/,
        );
    });

    it('executor-registry registers evidence-import', () => {
        expect(registry).toMatch(
            /executorRegistry\.register\(\s*['"]evidence-import['"]/,
        );
        expect(registry).toContain("await import('./evidence-import')");
    });

    it('POST route enqueues the job with the staging-key payload', () => {
        expect(route).toMatch(
            /enqueue\(\s*['"]evidence-import['"][\s\S]*stagingPathKey/,
        );
        expect(route).toContain('stagingFileRecordId');
        expect(route).toContain('initiatedByUserId');
        expect(route).toContain('tenantId');
    });

    it('POST route enforces the upload permission', () => {
        // Permission gate is the same one the dropzone respects in
        // single-file mode — keeps the auth surface uniform.
        expect(route).toContain('appPermissions.evidence.upload');
    });

    it('POST route caps the staged archive size before enqueueing', () => {
        // Belt + braces: the worker re-checks at runtime, but the
        // 100 MB boundary at the HTTP layer keeps the zip-bomb pre-
        // filter from ever loading a multi-GB file into memory.
        expect(route).toContain('MAX_ARCHIVE_BYTES');
        expect(route).toMatch(/100 \* 1024 \* 1024/);
    });

    it('GET status route filters by tenantId on the job payload', () => {
        // Cross-tenant id probing protection.
        expect(statusRoute).toContain('payloadTenantId');
        expect(statusRoute).toContain('ctx.tenantId');
    });
});
