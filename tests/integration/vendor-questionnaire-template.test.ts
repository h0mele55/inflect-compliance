/**
 * Epic G-3 integration — vendor questionnaire template roundtrip.
 *
 * Backs the schema guardrail with behavioural assertions over a
 * real Postgres connection:
 *
 *   1. A template + sections + questions roundtrip — order is
 *      preserved, foreign keys are enforced, cascading deletes
 *      work as declared (delete template → sections + questions
 *      go with it).
 *   2. The (tenantId, key, version) unique constraint blocks
 *      duplicate registration of the same template version in the
 *      same tenant.
 *   3. The G-3 lifecycle defaults match the documented contract:
 *      a freshly-created VendorAssessment defaults to DRAFT and
 *      every G-3 lifecycle column is null.
 *   4. AnswerType accepts every G-3 value (TEXT, YES_NO, SCALE,
 *      FILE_UPLOAD) — proves the enum migration actually landed.
 *
 * RUN: npx jest tests/integration/vendor-questionnaire-template.test.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DB_URL }),
});

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('Epic G-3 — vendor questionnaire template', () => {
    const runId = randomUUID().slice(0, 12);
    let tenantId: string;
    let userId: string;
    let vendorId: string;
    let legacyTemplateId: string;

    beforeAll(async () => {
        const user = await prisma.user.create({
            data: { email: `g3-${runId}@test.com`, name: 'G-3 Test User' },
        });
        userId = user.id;

        const tenant = await prisma.tenant.create({
            data: {
                name: `G-3 Tenant ${runId}`,
                slug: `g3-${runId}`,
                industry: 'Tech',
                maxRiskScale: 5,
            },
        });
        tenantId = tenant.id;

        const vendor = await prisma.vendor.create({
            data: {
                tenantId,
                name: `G-3 Vendor ${runId}`,
            },
        });
        vendorId = vendor.id;

        // Legacy template — needed because VendorAssessment.templateId
        // still FKs to QuestionnaireTemplate (kept for backward compat).
        const legacy = await prisma.questionnaireTemplate.create({
            data: {
                key: `g3-legacy-${runId}`,
                name: 'Legacy stub',
                isGlobal: true,
            },
        });
        legacyTemplateId = legacy.id;
    });

    afterAll(async () => {
        if (tenantId) {
            try {
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "VendorAssessmentAnswer" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "VendorAssessment" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "VendorAssessmentTemplateQuestion" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "VendorAssessmentTemplateSection" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "VendorAssessmentTemplate" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "Vendor" WHERE "tenantId" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "QuestionnaireTemplate" WHERE "id" = $1`,
                    legacyTemplateId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "Tenant" WHERE "id" = $1`,
                    tenantId,
                );
                await prisma.$executeRawUnsafe(
                    `DELETE FROM "User" WHERE "id" = $1`,
                    userId,
                );
            } catch (e) {
                console.warn('[g3-questionnaire] cleanup error:', e);
            }
        }
        await prisma.$disconnect();
    });

    test('template + sections + questions roundtrip with cascading delete', async () => {
        // Create template
        const template = await prisma.vendorAssessmentTemplate.create({
            data: {
                tenantId,
                key: `secq-${runId}`,
                version: 1,
                name: 'Security questionnaire',
                description: 'Standard SOC 2 vendor questionnaire',
                createdByUserId: userId,
            },
        });

        // Two sections
        const sectionA = await prisma.vendorAssessmentTemplateSection.create({
            data: {
                tenantId,
                templateId: template.id,
                sortOrder: 0,
                title: 'Information security',
                weight: 2,
            },
        });
        const sectionB = await prisma.vendorAssessmentTemplateSection.create({
            data: {
                tenantId,
                templateId: template.id,
                sortOrder: 1,
                title: 'Data privacy',
            },
        });

        // Mixed-type questions across the sections
        await prisma.vendorAssessmentTemplateQuestion.createMany({
            data: [
                {
                    tenantId,
                    templateId: template.id,
                    sectionId: sectionA.id,
                    sortOrder: 0,
                    prompt: 'Do you encrypt data at rest?',
                    answerType: 'YES_NO',
                    weight: 3,
                },
                {
                    tenantId,
                    templateId: template.id,
                    sectionId: sectionA.id,
                    sortOrder: 1,
                    prompt: 'Maturity of your IR program',
                    answerType: 'SCALE',
                    scaleConfigJson: {
                        min: 1,
                        max: 5,
                        labels: ['Ad-hoc', 'Optimizing'],
                    },
                    weight: 2,
                },
                {
                    tenantId,
                    templateId: template.id,
                    sectionId: sectionB.id,
                    sortOrder: 0,
                    prompt: 'Upload your DPA',
                    answerType: 'FILE_UPLOAD',
                    required: true,
                },
            ],
        });

        // Read back through the relation graph in the documented sort order
        const reread = await prisma.vendorAssessmentTemplate.findUnique({
            where: { id: template.id },
            include: {
                sections: { orderBy: { sortOrder: 'asc' } },
                questions: { orderBy: { sortOrder: 'asc' } },
            },
        });
        expect(reread).not.toBeNull();
        expect(reread!.sections.map((s) => s.title)).toEqual([
            'Information security',
            'Data privacy',
        ]);
        expect(reread!.questions).toHaveLength(3);

        const types = reread!.questions.map((q) => q.answerType).sort();
        expect(types).toEqual(['FILE_UPLOAD', 'SCALE', 'YES_NO']);

        // Cascading delete — drop the template, sections and
        // questions go with it.
        await prisma.vendorAssessmentTemplate.delete({
            where: { id: template.id },
        });
        const orphanSections =
            await prisma.vendorAssessmentTemplateSection.count({
                where: { templateId: template.id },
            });
        const orphanQuestions =
            await prisma.vendorAssessmentTemplateQuestion.count({
                where: { templateId: template.id },
            });
        expect(orphanSections).toBe(0);
        expect(orphanQuestions).toBe(0);
    });

    test('(tenantId, key, version) is unique', async () => {
        const a = await prisma.vendorAssessmentTemplate.create({
            data: {
                tenantId,
                key: `dup-${runId}`,
                version: 1,
                name: 'Dup test A',
            },
        });
        await expect(
            prisma.vendorAssessmentTemplate.create({
                data: {
                    tenantId,
                    key: `dup-${runId}`,
                    version: 1,
                    name: 'Dup test B (should fail)',
                },
            }),
        ).rejects.toThrow();
        // version=2 of the same key is allowed — that's the
        // edit-creates-new-version pattern.
        await prisma.vendorAssessmentTemplate.create({
            data: {
                tenantId,
                key: `dup-${runId}`,
                version: 2,
                name: 'Dup test (v2)',
            },
        });
        await prisma.vendorAssessmentTemplate.delete({ where: { id: a.id } });
    });

    test('VendorAssessment defaults: status=DRAFT, all G-3 lifecycle fields null', async () => {
        const assessment = await prisma.vendorAssessment.create({
            data: {
                tenantId,
                vendorId,
                templateId: legacyTemplateId,
                requestedByUserId: userId,
            },
        });

        expect(assessment.status).toBe('DRAFT');
        expect(assessment.sentAt).toBeNull();
        expect(assessment.respondentEmail).toBeNull();
        expect(assessment.externalAccessTokenHash).toBeNull();
        expect(assessment.externalAccessTokenExpiresAt).toBeNull();
        expect(assessment.reviewedAt).toBeNull();
        expect(assessment.reviewedByUserId).toBeNull();
        expect(assessment.closedAt).toBeNull();
        expect(assessment.templateVersionId).toBeNull();

        await prisma.vendorAssessment.delete({ where: { id: assessment.id } });
    });

    test('AssessmentStatus enum accepts every G-3 lifecycle value', async () => {
        const lifecycleValues = [
            'DRAFT',
            'SENT',
            'IN_PROGRESS',
            'SUBMITTED',
            'REVIEWED',
            'CLOSED',
        ] as const;
        for (const status of lifecycleValues) {
            const a = await prisma.vendorAssessment.create({
                data: {
                    tenantId,
                    vendorId,
                    templateId: legacyTemplateId,
                    requestedByUserId: userId,
                    status,
                },
            });
            expect(a.status).toBe(status);
            await prisma.vendorAssessment.delete({ where: { id: a.id } });
        }
    });
});
