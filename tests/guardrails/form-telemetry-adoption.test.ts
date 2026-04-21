/**
 * Epic 54 — form-telemetry adoption ratchet.
 *
 * Every customer-observable CRUD surface should emit form-lifecycle
 * events via `useFormTelemetry`. This ratchet records the set of
 * surfaces that use the hook and fails when that set shrinks — so a
 * refactor can't quietly drop observability on an already-wired form.
 *
 * Adding a new form? Instrument it with `useFormTelemetry('Surface')`,
 * then add the module path to `EXPECTED_SURFACES` below.
 *
 * Removing an instrumented form? Remove it from the list in the same
 * commit — the ratchet forces the decision to be explicit.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Every app-page file that is required to carry `useFormTelemetry`.
 * Listed as repo-root-relative paths so failures cite the exact file.
 */
const EXPECTED_SURFACES = [
    // Originally instrumented (Epic 54 first pass).
    'src/app/t/[tenantSlug]/(app)/controls/NewControlModal.tsx',
    // Added in the Epic 54 finishing pass.
    'src/app/t/[tenantSlug]/(app)/risks/NewRiskModal.tsx',
    'src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx',
    'src/app/t/[tenantSlug]/(app)/evidence/NewEvidenceTextModal.tsx',
    'src/app/t/[tenantSlug]/(app)/tasks/new/page.tsx',
    'src/app/t/[tenantSlug]/(app)/policies/new/page.tsx',
];

// Minimum number of CRUD surfaces that must be instrumented. The
// count can only go UP — drop the guard by removing an entry from
// `EXPECTED_SURFACES` in the same commit that un-wires a surface, so
// the removal is obvious in review.
const MIN_SURFACE_COUNT = EXPECTED_SURFACES.length;

describe('Epic 54 — useFormTelemetry adoption', () => {
    it.each(EXPECTED_SURFACES)(
        '%s imports and invokes useFormTelemetry',
        (rel) => {
            const full = path.join(REPO_ROOT, rel);
            expect(fs.existsSync(full)).toBe(true);
            const src = fs.readFileSync(full, 'utf-8');

            expect(src).toMatch(
                /from\s+['"]@\/lib\/telemetry\/form-telemetry['"]/,
            );
            expect(src).toMatch(/useFormTelemetry\(\s*['"][^'"]+['"]\s*\)/);
            // Success + error tracking must be wired — not just the hook
            // mounted. `trackSuccess` and `trackError` are the two
            // observable outcomes of a submit.
            expect(src).toMatch(/\.trackSuccess\(/);
            expect(src).toMatch(/\.trackError\(/);
        },
    );

    it(
        `at least ${MIN_SURFACE_COUNT} CRUD surfaces are instrumented ` +
            '(count can only grow)',
        () => {
            const instrumented = EXPECTED_SURFACES.filter((rel) => {
                const full = path.join(REPO_ROOT, rel);
                if (!fs.existsSync(full)) return false;
                return fs
                    .readFileSync(full, 'utf-8')
                    .includes('useFormTelemetry');
            });
            expect(instrumented.length).toBeGreaterThanOrEqual(
                MIN_SURFACE_COUNT,
            );
        },
    );

    it('the global telemetry sink is registered in Providers', () => {
        const src = fs.readFileSync(
            path.join(REPO_ROOT, 'src/app/providers.tsx'),
            'utf-8',
        );
        expect(src).toMatch(/registerFormTelemetrySink/);
    });
});
