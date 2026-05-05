/**
 * Epic G-3 prompt 7 — getReviewView usecase tests.
 *
 * Pins:
 *   • permission gate (canRead)
 *   • notFound when assessment not in tenant
 *   • rejects legacy assessments missing templateVersionId
 *   • returns assessment + template tree + answers + scoring preview
 *   • engine runs with the template's scoringConfigJson
 */

const mockTx = {
    vendorAssessment: { findFirst: jest.fn() },
    vendor: { findUnique: jest.fn() },
    vendorAssessmentTemplate: { findUnique: jest.fn() },
    vendorAssessmentAnswer: { findMany: jest.fn() },
};

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(
        async (_ctx: unknown, fn: (db: unknown) => Promise<unknown>) =>
            fn(mockTx),
    ),
}));

import { getReviewView } from '@/app-layer/usecases/vendor-assessment-review';

function makeCtx(opts: { canRead?: boolean } = {}) {
    return {
        requestId: 'r-1',
        userId: 'u-1',
        tenantId: 'tenant-1',
        role: 'EDITOR' as const,
        permissions: {
            canRead: opts.canRead ?? true,
            canWrite: true,
            canAdmin: true,
            canAudit: false,
            canExport: false,
        },
        appPermissions: {} as never,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockTx.vendorAssessment).forEach((fn) =>
        (fn as jest.Mock).mockReset(),
    );
    Object.values(mockTx.vendor).forEach((fn) =>
        (fn as jest.Mock).mockReset(),
    );
    Object.values(mockTx.vendorAssessmentTemplate).forEach((fn) =>
        (fn as jest.Mock).mockReset(),
    );
    Object.values(mockTx.vendorAssessmentAnswer).forEach((fn) =>
        (fn as jest.Mock).mockReset(),
    );
});

describe('getReviewView', () => {
    test('rejects callers without canRead', async () => {
        await expect(
            getReviewView(makeCtx({ canRead: false }), 'a-1'),
        ).rejects.toThrow(/Read access/);
    });

    test('notFound when assessment is not in tenant', async () => {
        mockTx.vendorAssessment.findFirst.mockResolvedValueOnce(null);
        await expect(
            getReviewView(makeCtx(), 'a-missing'),
        ).rejects.toThrow(/not found/i);
    });

    test('rejects legacy assessment missing templateVersionId', async () => {
        mockTx.vendorAssessment.findFirst.mockResolvedValueOnce({
            id: 'a-1',
            status: 'SUBMITTED',
            vendorId: 'v-1',
            templateVersionId: null,
        });
        await expect(getReviewView(makeCtx(), 'a-1')).rejects.toThrow(
            /not created from a G-3 template/,
        );
    });

    test('returns the unified payload with engine output', async () => {
        mockTx.vendorAssessment.findFirst.mockResolvedValueOnce({
            id: 'a-1',
            status: 'SUBMITTED',
            vendorId: 'v-1',
            templateVersionId: 't-1',
            submittedAt: new Date('2026-05-05T10:00:00Z'),
            reviewedAt: null,
            reviewedByUserId: null,
            reviewerNotes: null,
            riskRating: null,
            closedAt: null,
        });
        mockTx.vendor.findUnique.mockResolvedValueOnce({
            id: 'v-1',
            name: 'Acme',
        });
        mockTx.vendorAssessmentTemplate.findUnique.mockResolvedValueOnce({
            id: 't-1',
            key: 'soc2',
            version: 1,
            name: 'SOC 2',
            description: null,
            isPublished: true,
            scoringConfigJson: { mode: 'SIMPLE_SUM' },
            sections: [
                {
                    id: 's-1',
                    sortOrder: 0,
                    title: 'Security',
                    description: null,
                    questions: [
                        {
                            id: 'q-1',
                            sectionId: 's-1',
                            sortOrder: 0,
                            prompt: 'Encrypt?',
                            answerType: 'YES_NO',
                            required: true,
                            weight: 1,
                            optionsJson: null,
                            scaleConfigJson: null,
                        },
                    ],
                },
            ],
            questions: [
                {
                    id: 'q-1',
                    weight: 1,
                    required: true,
                },
            ],
        });
        mockTx.vendorAssessmentAnswer.findMany.mockResolvedValueOnce([
            {
                questionId: 'q-1',
                answerJson: { value: 'yes' },
                computedPoints: 5,
                reviewerOverridePoints: null,
                reviewerNotes: null,
                evidenceId: null,
            },
        ]);

        const view = await getReviewView(makeCtx(), 'a-1');

        expect(view.assessmentId).toBe('a-1');
        expect(view.status).toBe('SUBMITTED');
        expect(view.vendor).toEqual({ id: 'v-1', name: 'Acme' });
        expect(view.template.name).toBe('SOC 2');
        expect(view.sections).toHaveLength(1);
        expect(view.sections[0].questions).toHaveLength(1);
        expect(view.answers).toHaveLength(1);
        expect(view.scoring.mode).toBe('SIMPLE_SUM');
        expect(view.scoring.score).toBe(5);
        expect(view.scoring.autoSum).toBe(5);
        expect(view.scoring.effectiveSum).toBe(5);
    });

    test('engine respects template scoringConfig (PASS_FAIL_THRESHOLD)', async () => {
        mockTx.vendorAssessment.findFirst.mockResolvedValueOnce({
            id: 'a-1',
            status: 'SUBMITTED',
            vendorId: 'v-1',
            templateVersionId: 't-1',
            submittedAt: null,
            reviewedAt: null,
            reviewedByUserId: null,
            reviewerNotes: null,
            riskRating: null,
            closedAt: null,
        });
        mockTx.vendor.findUnique.mockResolvedValueOnce({
            id: 'v-1',
            name: 'Acme',
        });
        mockTx.vendorAssessmentTemplate.findUnique.mockResolvedValueOnce({
            id: 't-1',
            key: 'k',
            version: 1,
            name: 'X',
            description: null,
            isPublished: true,
            scoringConfigJson: {
                mode: 'PASS_FAIL_THRESHOLD',
                threshold: 10,
            },
            sections: [],
            questions: [{ id: 'q-1', weight: 1, required: false }],
        });
        mockTx.vendorAssessmentAnswer.findMany.mockResolvedValueOnce([
            {
                questionId: 'q-1',
                answerJson: { value: 5 },
                computedPoints: 5,
                reviewerOverridePoints: null,
                reviewerNotes: null,
                evidenceId: null,
            },
        ]);

        const view = await getReviewView(makeCtx(), 'a-1');
        expect(view.scoring.verdict).toBe('FAIL');
        expect(view.scoring.score).toBe(5);
    });
});
