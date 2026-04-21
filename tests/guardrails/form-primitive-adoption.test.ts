/**
 * Epic 55 — form primitive adoption ratchet.
 *
 * Epic 55 ships `<FormField>` and `<FormError>` as the canonical
 * composables for labelled form inputs and field-level error
 * messaging. This ratchet records the app-pages that must carry the
 * primitives and fails when coverage shrinks, so a refactor can't
 * silently drop a labelled control back to ad-hoc `<label>` + raw
 * `<input>`.
 *
 * Adding a new form surface?
 *   - Wrap labelled inputs with `<FormField>`; surface field-level
 *     validation via `<FormError>` or `<FormField error>`.
 *   - Append the repo-root-relative module path to the lists below.
 *
 * Removing instrumentation from an existing surface?
 *   - Remove it from the list in the same commit so the deletion is
 *     visible in review.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

const FORM_FIELD_SURFACES = [
    'src/app/t/[tenantSlug]/(app)/audits/cycles/page.tsx',
    'src/app/t/[tenantSlug]/(app)/controls/ControlDetailSheet.tsx',
    'src/app/t/[tenantSlug]/(app)/controls/NewControlModal.tsx',
    'src/app/t/[tenantSlug]/(app)/evidence/NewEvidenceTextModal.tsx',
    'src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx',
    'src/app/t/[tenantSlug]/(app)/policies/new/page.tsx',
    'src/app/t/[tenantSlug]/(app)/risks/NewRiskModal.tsx',
    'src/app/t/[tenantSlug]/(app)/tasks/new/page.tsx',
    'src/app/t/[tenantSlug]/(app)/vendors/new/page.tsx',
];

const FORM_ERROR_SURFACES = [
    'src/app/t/[tenantSlug]/(app)/controls/NewControlModal.tsx',
    'src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx',
    'src/app/t/[tenantSlug]/(app)/risks/NewRiskModal.tsx',
    'src/app/t/[tenantSlug]/(app)/tasks/new/page.tsx',
];

const MIN_FORM_FIELD = FORM_FIELD_SURFACES.length;
const MIN_FORM_ERROR = FORM_ERROR_SURFACES.length;

describe('Epic 55 — FormField adoption ratchet', () => {
    it.each(FORM_FIELD_SURFACES)(
        '%s imports + uses <FormField>',
        (rel) => {
            const full = path.join(REPO_ROOT, rel);
            expect(fs.existsSync(full)).toBe(true);
            const src = fs.readFileSync(full, 'utf-8');

            expect(src).toMatch(
                /from\s+['"]@\/components\/ui\/form-field['"]/,
            );
            expect(src).toMatch(/<FormField\b/);
        },
    );

    it(
        `at least ${MIN_FORM_FIELD} surfaces carry <FormField> (count can only grow)`,
        () => {
            const instrumented = FORM_FIELD_SURFACES.filter((rel) => {
                const full = path.join(REPO_ROOT, rel);
                if (!fs.existsSync(full)) return false;
                return fs
                    .readFileSync(full, 'utf-8')
                    .includes('<FormField');
            });
            expect(instrumented.length).toBeGreaterThanOrEqual(MIN_FORM_FIELD);
        },
    );
});

describe('Epic 55 — FormError adoption ratchet', () => {
    it.each(FORM_ERROR_SURFACES)(
        '%s imports + uses <FormError>',
        (rel) => {
            const full = path.join(REPO_ROOT, rel);
            expect(fs.existsSync(full)).toBe(true);
            const src = fs.readFileSync(full, 'utf-8');

            expect(src).toMatch(
                /from\s+['"]@\/components\/ui\/form-error['"]/,
            );
            expect(src).toMatch(/<FormError\b/);
        },
    );

    it(
        `at least ${MIN_FORM_ERROR} surfaces carry <FormError> (count can only grow)`,
        () => {
            const instrumented = FORM_ERROR_SURFACES.filter((rel) => {
                const full = path.join(REPO_ROOT, rel);
                if (!fs.existsSync(full)) return false;
                return fs
                    .readFileSync(full, 'utf-8')
                    .includes('<FormError');
            });
            expect(instrumented.length).toBeGreaterThanOrEqual(MIN_FORM_ERROR);
        },
    );
});
