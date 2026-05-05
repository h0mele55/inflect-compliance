/**
 * Epic G-3 guardrail — vendor questionnaire schema is intact.
 *
 * Locks the schema foundation that every subsequent G-3 prompt
 * depends on. A future "schema cleanup" PR cannot silently drop
 * one of the three new template models, the lifecycle enum
 * extensions, or the workflow fields on VendorAssessment without
 * bumping the floor in this same diff.
 *
 * Enforced:
 *   1. AnswerType enum carries SCALE + FILE_UPLOAD additions.
 *   2. AssessmentStatus enum carries the G-3 lifecycle values
 *      (SENT, IN_PROGRESS, SUBMITTED, REVIEWED, CLOSED) AND the
 *      legacy values (DRAFT, IN_REVIEW, APPROVED, REJECTED).
 *   3. VendorAssessmentTemplate, VendorAssessmentTemplateSection,
 *      and VendorAssessmentTemplateQuestion models exist with the
 *      load-bearing fields the workflow depends on.
 *   4. VendorAssessment carries the G-3 send/review/close
 *      workflow fields and the templateVersionId pin.
 *   5. VendorAssessmentAnswer carries reviewer override + evidence
 *      FK fields.
 *
 * Mutation-regression proofs live at the bottom — confirm the
 * detector itself isn't vacuous.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const ENUMS_FILE = path.join(REPO_ROOT, 'prisma/schema/enums.prisma');
const VENDOR_FILE = path.join(REPO_ROOT, 'prisma/schema/vendor.prisma');

function read(file: string): string {
    return fs.readFileSync(file, 'utf8');
}

function readModel(text: string, name: string): string {
    const m = text.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!m) {
        throw new Error(
            `model ${name} not found — expected the canonical ` +
                `\`model ${name} { ... }\` block.`,
        );
    }
    return m[1];
}

function readEnum(text: string, name: string): string[] {
    const m = text.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!m) throw new Error(`enum ${name} not found`);
    return m[1]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'))
        .sort();
}

describe('Epic G-3 — vendor questionnaire schema', () => {
    const enumsText = read(ENUMS_FILE);
    const vendorText = read(VENDOR_FILE);

    test('AnswerType includes SCALE + FILE_UPLOAD alongside legacy values', () => {
        const values = readEnum(enumsText, 'AnswerType');
        for (const expected of [
            'YES_NO',
            'TEXT',
            'NUMBER',
            'SCALE',
            'FILE_UPLOAD',
        ]) {
            expect(values).toContain(expected);
        }
    });

    test('AssessmentStatus includes G-3 lifecycle and preserves legacy values', () => {
        const values = readEnum(enumsText, 'AssessmentStatus');
        for (const expected of [
            // Legacy
            'DRAFT',
            'IN_REVIEW',
            'APPROVED',
            'REJECTED',
            // G-3
            'SENT',
            'IN_PROGRESS',
            'SUBMITTED',
            'REVIEWED',
            'CLOSED',
        ]) {
            expect(values).toContain(expected);
        }
    });

    test('VendorAssessmentTemplate model carries the load-bearing fields', () => {
        const body = readModel(vendorText, 'VendorAssessmentTemplate');
        expect(body).toMatch(/\n\s+tenantId\s+String/);
        expect(body).toMatch(/\n\s+key\s+String/);
        expect(body).toMatch(/\n\s+version\s+Int/);
        expect(body).toMatch(/\n\s+isLatestVersion\s+Boolean/);
        expect(body).toMatch(/\n\s+isPublished\s+Boolean/);
        expect(body).toMatch(/\n\s+name\s+String/);
        expect(body).toMatch(/@@unique\(\[tenantId, key, version\]\)/);
    });

    test('VendorAssessmentTemplateSection has ordering + relations', () => {
        const body = readModel(vendorText, 'VendorAssessmentTemplateSection');
        expect(body).toMatch(/\n\s+sortOrder\s+Int/);
        expect(body).toMatch(/\n\s+title\s+String/);
        expect(body).toMatch(/\n\s+templateId\s+String/);
        expect(body).toMatch(
            /@@index\(\[tenantId, templateId, sortOrder\]\)/,
        );
    });

    test('VendorAssessmentTemplateQuestion carries answerType + ordering + weighting', () => {
        const body = readModel(vendorText, 'VendorAssessmentTemplateQuestion');
        expect(body).toMatch(/\n\s+sortOrder\s+Int/);
        expect(body).toMatch(/\n\s+sectionId\s+String/);
        expect(body).toMatch(/\n\s+answerType\s+AnswerType/);
        expect(body).toMatch(/\n\s+required\s+Boolean/);
        expect(body).toMatch(/\n\s+weight\s+Float/);
        expect(body).toMatch(/\n\s+scaleConfigJson\s+Json\?/);
        expect(body).toMatch(/\n\s+optionsJson\s+Json\?/);
    });

    test('VendorAssessment has the G-3 send/review/close workflow fields', () => {
        const body = readModel(vendorText, 'VendorAssessment');
        for (const field of [
            'sentAt',
            'sentByUserId',
            'respondentEmail',
            'externalAccessTokenHash',
            'externalAccessTokenExpiresAt',
            'reviewedAt',
            'reviewedByUserId',
            'reviewerNotes',
            'closedAt',
            'closedByUserId',
            'templateVersionId',
        ]) {
            expect(body).toMatch(new RegExp(`\\n\\s+${field}\\s+`));
        }
        // External token lookup index is mandatory — without it, the
        // external respondent landing page would scan the table.
        expect(body).toMatch(
            /@@index\(\[externalAccessTokenHash\]\)/,
        );
    });

    test('VendorAssessmentAnswer carries reviewer override + evidence FK', () => {
        const body = readModel(vendorText, 'VendorAssessmentAnswer');
        expect(body).toMatch(/\n\s+reviewerOverridePoints\s+Float\?/);
        expect(body).toMatch(/\n\s+reviewerNotes\s+String\?/);
        expect(body).toMatch(/\n\s+evidenceId\s+String\?/);
        expect(body).toMatch(/\n\s+templateQuestionId\s+String\?/);
        // Auto-computed `computedPoints` stays untouched alongside
        // the override — both values must be queryable for audit.
        expect(body).toMatch(/\n\s+computedPoints\s+Float/);
    });

    // ─── Mutation-regression proofs ──────────────────────────────

    test('detector catches a missing G-3 enum value', () => {
        // Surgical mutation — narrow the AssessmentStatus body and
        // strip CLOSED from it. Avoids accidentally matching CLOSED
        // in unrelated enums elsewhere in the file.
        const broken = enumsText.replace(
            /(enum AssessmentStatus \{[\s\S]*?)\n\s+CLOSED([\s\S]*?\n\})/,
            '$1$2',
        );
        const values = readEnum(broken, 'AssessmentStatus');
        expect(values).not.toContain('CLOSED');
    });

    test('detector catches a stripped templateVersionId field', () => {
        const broken = vendorText.replace(
            /\n\s+templateVersionId\s+String\?[^\n]*/,
            '',
        );
        const body = readModel(broken, 'VendorAssessment');
        expect(body).not.toMatch(/\n\s+templateVersionId\s+String\?/);
    });

    test('detector catches a missing template model', () => {
        const broken = vendorText.replace(
            /model VendorAssessmentTemplateSection \{[\s\S]*?\n\}/,
            '',
        );
        expect(() =>
            readModel(broken, 'VendorAssessmentTemplateSection'),
        ).toThrow();
    });
});
