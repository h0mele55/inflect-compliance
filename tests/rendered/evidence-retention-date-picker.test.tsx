/**
 * Epic 58 — single-date picker rollout tests.
 *
 * Covers the three highest-value form fields migrated from a native
 * `<input type="date">` to the shared `<DatePicker>`:
 *
 *   - Upload Evidence modal's "Retain until" field.
 *   - Evidence list's inline retention-edit.
 *   - Policy detail page's "Next review" field.
 *
 * These are structural contract checks. They fail loudly if a future
 * refactor drops the shared picker (e.g. for a new native input) or
 * breaks the YMD ↔ ISO bridging the retention / policy-review APIs
 * have always consumed. The DatePicker's own behaviour is exercised
 * separately by `tests/rendered/date-pickers.test.tsx` and
 * `tests/rendered/date-picker-ui.test.tsx`.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

const EVIDENCE_UPLOAD =
    'src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx';
const EVIDENCE_CLIENT =
    'src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx';
const POLICY_DETAIL =
    'src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx';

const EVIDENCE_FILES = [EVIDENCE_UPLOAD, EVIDENCE_CLIENT];

describe('Epic 58 — DatePicker imports', () => {
    it.each([EVIDENCE_UPLOAD, EVIDENCE_CLIENT, POLICY_DETAIL])(
        '%s imports the shared DatePicker',
        (file) => {
            const src = read(file);
            expect(src).toMatch(
                /import\s*\{[^}]*\bDatePicker\b[^}]*\}\s*from\s*['"]@\/components\/ui\/date-picker\/date-picker['"]/,
            );
        },
    );

    it.each([EVIDENCE_UPLOAD, EVIDENCE_CLIENT, POLICY_DETAIL])(
        '%s bridges YMD strings with parseYMD / toYMD at the picker edge',
        (file) => {
            const src = read(file);
            expect(src).toMatch(/\bparseYMD\b[^;]*from\s*['"]@\/components\/ui\/date-picker\/date-utils['"]/);
            expect(src).toMatch(/\btoYMD\b[^;]*from\s*['"]@\/components\/ui\/date-picker\/date-utils['"]/);
        },
    );
});

describe('Epic 58 — no native date inputs on evidence surfaces', () => {
    // Evidence is the highest-value rollout surface in Epic 58; both
    // the upload modal and the inline retention edit must use the
    // shared picker, full stop. Any new `<input type="date">` on
    // these two files is a regression.
    it.each(EVIDENCE_FILES)(
        '%s no longer contains <input type="date">',
        (file) => {
            const src = read(file);
            // Match the JSX form specifically so the guardrail comment
            // that mentions the old widget doesn't trip the check.
            expect(src).not.toMatch(/<input\b[^>]*\btype=["']date["']/);
        },
    );
});

describe('Epic 58 — DatePicker call-site invariants', () => {
    interface Site {
        label: string;
        src: string;
        /**
         * Capture the full set of props for a given DatePicker call
         * so the assertions can look at every prop at once rather
         * than scanning slice windows.
         */
        datePickerBlocks: string[];
    }

    function findDatePickerBlocks(src: string): string[] {
        // A crude but dependable parser: find each `<DatePicker`
        // occurrence and capture up to the first self-closing `/>`
        // that follows at the same nesting level. Works because
        // none of our migrated usages nest JSX children.
        const blocks: string[] = [];
        let cursor = 0;
        while (cursor < src.length) {
            const start = src.indexOf('<DatePicker', cursor);
            if (start === -1) break;
            const end = src.indexOf('/>', start);
            if (end === -1) break;
            blocks.push(src.slice(start, end + 2));
            cursor = end + 2;
        }
        return blocks;
    }

    const sites: Site[] = [
        {
            label: 'UploadEvidenceModal',
            src: read(EVIDENCE_UPLOAD),
            datePickerBlocks: [],
        },
        {
            label: 'EvidenceClient',
            src: read(EVIDENCE_CLIENT),
            datePickerBlocks: [],
        },
        {
            label: 'PolicyDetail',
            src: read(POLICY_DETAIL),
            datePickerBlocks: [],
        },
    ];
    for (const s of sites) {
        s.datePickerBlocks = findDatePickerBlocks(s.src);
    }

    it.each(sites)(
        '$label renders at least one <DatePicker /> call',
        ({ datePickerBlocks }) => {
            expect(datePickerBlocks.length).toBeGreaterThan(0);
        },
    );

    it.each(sites)(
        '$label picker(s) declare `clearable` so expiry can be removed',
        ({ datePickerBlocks }) => {
            for (const block of datePickerBlocks) {
                expect(block).toMatch(/\bclearable\b/);
            }
        },
    );

    it.each(sites)(
        '$label picker(s) disable past days via { before: startOfUtcDay(new Date()) }',
        ({ datePickerBlocks }) => {
            for (const block of datePickerBlocks) {
                expect(block).toMatch(
                    /disabledDays=\{\{\s*before:\s*startOfUtcDay\(new Date\(\)\)\s*,?\s*\}\}/,
                );
            }
        },
    );

    it.each(sites)(
        '$label picker(s) are wired through parseYMD / toYMD',
        ({ datePickerBlocks }) => {
            for (const block of datePickerBlocks) {
                expect(block).toMatch(/value=\{parseYMD\(/);
                expect(block).toMatch(/toYMD\(next\)/);
            }
        },
    );
});

describe('Epic 58 — existing API contracts preserved', () => {
    it('Upload Evidence keeps retentionUntil id + YMD → ISO conversion on submit', () => {
        const src = read(EVIDENCE_UPLOAD);
        // E2E selects the retention field by id — must survive the
        // migration (DatePicker forwards `id` to its trigger).
        expect(src).toMatch(/id=["']retention-date-input["']/);
        // Post-migration the modal still converts the stored YMD
        // string to an ISO timestamp for the /retention endpoint.
        expect(src).toMatch(/new Date\(retentionUntil\)\.toISOString\(\)/);
    });

    it('Inline retention edit still posts { retentionUntil: ISO | null, retentionPolicy }', () => {
        const src = read(EVIDENCE_CLIENT);
        expect(src).toMatch(
            /retentionUntil:\s*editRetentionDate\s*\?\s*new Date\(editRetentionDate\)\.toISOString\(\)\s*:\s*null/,
        );
        expect(src).toMatch(/retentionPolicy:\s*editRetentionDate\s*\?\s*['"]FIXED_DATE['"]/);
    });

    it('Policy "Next review" picker retains the canonical field id for the save handler', () => {
        const src = read(POLICY_DETAIL);
        // `nextReview` state + the save handler that posts it are
        // unchanged; only the visible widget migrated.
        expect(src).toMatch(/setNextReview\(/);
        expect(src).toMatch(/id=["']policy-next-review-input["']/);
    });
});
