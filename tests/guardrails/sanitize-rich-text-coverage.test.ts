/**
 * Guardrail: Epic C.5 — sanitiser coverage.
 *
 * Locks in the invariant that every usecase known to ingest rich-text
 * imports the sanitiser. Catches the case where a future PR adds a
 * new HTML-accepting write path (a tiptap-flavoured comment, a
 * markdown body on a new entity) without wiring `sanitize*` into the
 * usecase layer. Render-time sanitisation alone is not sufficient —
 * the row at rest must already be safe so that PDF export, audit-pack
 * share links, and SDK consumers reading the row verbatim cannot turn
 * a stored payload into XSS.
 *
 * The list below is curated rather than auto-discovered — autodetect
 * would either be too noisy (every usecase imports many helpers) or
 * too narrow (a hand-rolled query that bypasses the repo). The list
 * grows as new write paths land. When you add a usecase that handles
 * user-supplied rich text:
 *   1. Wire `sanitizeRichTextHtml` / `sanitizePlainText` /
 *      `sanitizePolicyContent` into the usecase BEFORE the Prisma write.
 *   2. Add the file to `RICH_TEXT_USECASES` below with a one-line
 *      `field` note for the reviewer.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

interface UsecaseExpectation {
    /** Path relative to repo root. */
    file: string;
    /** Which sanitiser export the file is expected to import. */
    expects: 'sanitizeRichTextHtml' | 'sanitizePlainText' | 'sanitizePolicyContent';
    /** Human-readable note about which field this protects. */
    field: string;
}

const RICH_TEXT_USECASES: ReadonlyArray<UsecaseExpectation> = [
    {
        file: 'src/app-layer/usecases/policy.ts',
        expects: 'sanitizePolicyContent',
        field: 'PolicyVersion.contentText (HTML / MARKDOWN)',
    },
    {
        file: 'src/app-layer/usecases/task.ts',
        expects: 'sanitizePlainText',
        field: 'TaskComment.body via addTaskComment',
    },
    {
        file: 'src/app-layer/usecases/issue.ts',
        expects: 'sanitizePlainText',
        field: 'TaskComment.body via addIssueComment',
    },
    // Epic D.2 — encrypted-field write paths now covered by sanitiser.
    {
        file: 'src/app-layer/usecases/finding.ts',
        expects: 'sanitizePlainText',
        field: 'Finding.{description,rootCause,correctiveAction,verificationNotes} on create + update',
    },
    {
        file: 'src/app-layer/usecases/risk.ts',
        expects: 'sanitizePlainText',
        field: 'Risk.{title,description,category,threat,vulnerability,treatmentOwner,treatmentNotes}',
    },
    {
        file: 'src/app-layer/usecases/vendor.ts',
        expects: 'sanitizePlainText',
        field: 'Vendor.{name,legalName,country,domain,websiteUrl,description,tags[]}, VendorDocument.notes, VendorAssessment.notes',
    },
    {
        file: 'src/app-layer/usecases/audit.ts',
        expects: 'sanitizePlainText',
        field: 'Audit.{title,auditScope,criteria,auditors,auditees,departments} + AuditChecklistItem.notes',
    },
    {
        file: 'src/app-layer/usecases/control-test.ts',
        expects: 'sanitizePlainText',
        field: 'ControlTestPlan.{name,description,steps[]} + ControlTestRun.{notes,findingSummary}',
    },
];

// Ratchet — `RICH_TEXT_USECASES` may only grow. The floor is bumped
// every time a new sanitised write path lands; a future PR that
// silently drops an entry (e.g. by deleting a usecase without
// wiring its replacement) trips this floor with a clear pointer to
// the lost coverage.
//
// History:
//   Epic C.5 — first wave (policy, task, issue)            → 3
//   Epic D.2 — encrypted write paths (finding, risk,
//              vendor, audit, control-test)                → 8
const SANITISER_COVERAGE_FLOOR = 8;

describe('Epic C.5 / D.2 — sanitiser coverage guardrail', () => {
    it('lists at least one rich-text usecase (sanity)', () => {
        // Empty list = silent regression. Force the suite to fail
        // loud if the table somehow gets cleared.
        expect(RICH_TEXT_USECASES.length).toBeGreaterThan(0);
    });

    it(`covers at least ${SANITISER_COVERAGE_FLOOR} usecase files (ratchet)`, () => {
        // The list is allowed to GROW (new sanitised write paths land
        // → bump the floor in the same PR) but never to SHRINK without
        // an explicit comment explaining which coverage was retired.
        if (RICH_TEXT_USECASES.length < SANITISER_COVERAGE_FLOOR) {
            throw new Error(
                [
                    `Sanitiser coverage regressed:`,
                    `  RICH_TEXT_USECASES has ${RICH_TEXT_USECASES.length} entries;`,
                    `  the documented floor is ${SANITISER_COVERAGE_FLOOR}.`,
                    ``,
                    `If a usecase was deleted, lower the floor in the SAME PR`,
                    `with a one-line "History" entry above SANITISER_COVERAGE_FLOOR`,
                    `explaining what was retired and why.`,
                    ``,
                    `If a usecase was renamed/moved, update its entry's \`file\`.`,
                ].join('\n'),
            );
        }
    });

    it('every entry corresponds to a real on-disk file (no stale paths)', () => {
        // Catches the "renamed without updating the table" case before
        // it can silently mask a missing sanitiser call.
        const stale: string[] = [];
        for (const u of RICH_TEXT_USECASES) {
            const abs = path.join(REPO_ROOT, u.file);
            if (!fs.existsSync(abs)) {
                stale.push(u.file);
            }
        }
        if (stale.length > 0) {
            throw new Error(
                [
                    `RICH_TEXT_USECASES references files that no longer exist:`,
                    ...stale.map((s) => `  - ${s}`),
                    ``,
                    `If the file was moved, update its entry. If the usecase`,
                    `was retired, remove the entry AND lower the floor.`,
                ].join('\n'),
            );
        }
    });

    test.each(
        RICH_TEXT_USECASES.map((u) => [u.file, u] as const),
    )('%s imports its expected sanitiser', (relPath, expectation) => {
        const abs = path.join(REPO_ROOT, relPath);
        if (!fs.existsSync(abs)) {
            throw new Error(
                [
                    `Rich-text usecase no longer exists: ${relPath}.`,
                    `If the field was moved, update RICH_TEXT_USECASES in this guardrail.`,
                    `If the field was deleted, remove the entry.`,
                ].join('\n'),
            );
        }
        const src = fs.readFileSync(abs, 'utf8');

        // Two acceptable shapes: a named import, OR the function name
        // appearing as a call (covers `await sanitize…(input)`).
        const importRe = new RegExp(
            String.raw`import\s+\{[^}]*\b${expectation.expects}\b[^}]*\}\s+from\s+['"]@/lib/security/sanitize['"]`,
        );
        if (!importRe.test(src)) {
            throw new Error(
                [
                    `Rich-text usecase missing sanitiser import.`,
                    ``,
                    `  File:        ${relPath}`,
                    `  Field:       ${expectation.field}`,
                    `  Expected:    import { ${expectation.expects} } from '@/lib/security/sanitize';`,
                    ``,
                    `Why:`,
                    `  Server-side sanitisation must run BEFORE the row is`,
                    `  persisted. Render-time sanitisation alone leaves the row`,
                    `  dangerous to PDF export, audit-pack share links, and`,
                    `  future SDK consumers reading the row verbatim.`,
                    ``,
                    `Fix:`,
                    `  1. Add the import above.`,
                    `  2. Pipe the user-supplied field through ${expectation.expects}(...)`,
                    `     immediately before the repository call.`,
                    `  3. Re-run this test to confirm.`,
                ].join('\n'),
            );
        }

        // Belt-and-braces: the name should also appear at least once
        // outside the import (i.e. an actual call site). Catches the
        // rare regression where a refactor leaves the import but
        // removes the call.
        const importLine = src.match(importRe)?.[0] ?? '';
        const srcWithoutImport = src.replace(importLine, '');
        const usageRe = new RegExp(String.raw`\b${expectation.expects}\s*\(`);
        if (!usageRe.test(srcWithoutImport)) {
            throw new Error(
                [
                    `Rich-text usecase imports ${expectation.expects} but never calls it.`,
                    ``,
                    `  File:  ${relPath}`,
                    `  Field: ${expectation.field}`,
                    ``,
                    `A dangling import is a silent bypass. Either wire the call`,
                    `back in or remove the import + this guardrail entry.`,
                ].join('\n'),
            );
        }
    });
});
