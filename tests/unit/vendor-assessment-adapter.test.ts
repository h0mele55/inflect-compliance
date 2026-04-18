/**
 * Vendor Assessment Lifecycle Adapter — Repository Contract Tests
 *
 * Validates the VendorAssessmentEditableAdapter class:
 * 1. Constructor accepts tenantId and userId
 * 2. Implements EditableRepository<VendorAssessmentPayload>
 * 3. loadState/saveState type contracts
 * 4. Integration with usecase layer (publishWithAudit, etc.)
 *
 * Since the adapter interacts with Prisma, we test at two levels:
 *
 * A) **Contract tests**: Verify the adapter satisfies the EditableRepository
 *    interface and can be passed to the generic usecase functions.
 *
 * B) **Mock-Prisma tests**: Verify loadState/saveState call the right
 *    Prisma methods with correct arguments using a mock db.
 */

import type { EditableState } from '@/app-layer/domain/editable-lifecycle.types';
import type { EditableRepository } from '@/app-layer/usecases/editable-lifecycle-usecase';
import {
    VendorAssessmentEditableAdapter,
    assessmentStatusToPhase,
    phaseToAssessmentStatus,
    VENDOR_ASSESSMENT_AUDIT_CONFIG,
    type VendorAssessmentPayload,
} from '@/app-layer/services/vendor-assessment-lifecycle-adapter';

// ─── Mock Fixtures ───────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const ASSESSMENT_ID = 'assess-1';

const DRAFT_ASSESSMENT = {
    id: ASSESSMENT_ID,
    tenantId: TENANT_ID,
    vendorId: 'vendor-1',
    templateId: 'tmpl-1',
    status: 'DRAFT' as const,
    startedAt: new Date('2026-01-01'),
    submittedAt: null,
    decidedAt: null,
    requestedByUserId: USER_ID,
    decidedByUserId: null,
    score: null,
    riskRating: null,
    notes: null,
    nextReviewAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    template: {
        id: 'tmpl-1',
        key: 'vendor-security-v1',
        name: 'Vendor Security Questionnaire',
        description: null,
        version: 1,
        isGlobal: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    answers: [
        {
            id: 'ans-1',
            tenantId: TENANT_ID,
            assessmentId: ASSESSMENT_ID,
            questionId: 'q1',
            answerJson: { selected: 'yes' },
            computedPoints: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
            question: { id: 'q1' },
        },
    ],
};

const APPROVED_ASSESSMENT = {
    ...DRAFT_ASSESSMENT,
    status: 'APPROVED' as const,
    decidedAt: new Date('2026-01-15'),
    decidedByUserId: 'reviewer-1',
    score: 10,
    riskRating: 'MEDIUM',
};

// ─── Mock Prisma DB ──────────────────────────────────────────────────

function makeMockDb(assessment: typeof DRAFT_ASSESSMENT | typeof APPROVED_ASSESSMENT | null) {
    const updateManyCalls: any[] = [];
    const upsertCalls: any[] = [];

    return {
        db: {
            vendorAssessment: {
                findFirst: jest.fn().mockResolvedValue(assessment),
                updateMany: jest.fn().mockImplementation((args: any) => {
                    updateManyCalls.push(args);
                    return Promise.resolve({ count: 1 });
                }),
            },
            vendorAssessmentAnswer: {
                upsert: jest.fn().mockImplementation((args: any) => {
                    upsertCalls.push(args);
                    return Promise.resolve({});
                }),
            },
        } as any,
        updateManyCalls,
        upsertCalls,
    };
}

// ═════════════════════════════════════════════════════════════════════
// 1. Contract Validation
// ═════════════════════════════════════════════════════════════════════

describe('VendorAssessmentEditableAdapter — Contract', () => {
    it('implements EditableRepository interface', () => {
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        // Type check — if this compiles, the contract is satisfied
        const repo: EditableRepository<VendorAssessmentPayload> = adapter;
        expect(typeof repo.loadState).toBe('function');
        expect(typeof repo.saveState).toBe('function');
    });

    it('constructor stores tenantId and userId', () => {
        const adapter = new VendorAssessmentEditableAdapter('t1', 'u1');
        expect(adapter).toBeDefined();
    });

    it('audit config matches domain convention', () => {
        expect(VENDOR_ASSESSMENT_AUDIT_CONFIG.entityType).toBe('VendorAssessment');
        expect(VENDOR_ASSESSMENT_AUDIT_CONFIG.actionPrefix).toBe('ASSESSMENT');
    });
});

// ═════════════════════════════════════════════════════════════════════
// 2. loadState
// ═════════════════════════════════════════════════════════════════════

describe('VendorAssessmentEditableAdapter — loadState', () => {
    it('returns null for non-existent assessment', async () => {
        const { db } = makeMockDb(null);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const result = await adapter.loadState(db, 'nonexistent');
        expect(result).toBeNull();
    });

    it('loads DRAFT assessment into draft slot', async () => {
        const { db } = makeMockDb(DRAFT_ASSESSMENT);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state = await adapter.loadState(db, ASSESSMENT_ID);

        expect(state).not.toBeNull();
        expect(state!.phase).toBe('DRAFT');
        expect(state!.currentVersion).toBe(1);
        expect(state!.draft).not.toBeNull();
        expect(state!.published).toBeNull();
        expect(state!.history).toEqual([]);
    });

    it('extracts correct payload from draft assessment', async () => {
        const { db } = makeMockDb(DRAFT_ASSESSMENT);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state = await adapter.loadState(db, ASSESSMENT_ID);

        expect(state!.draft!.templateKey).toBe('vendor-security-v1');
        expect(state!.draft!.templateName).toBe('Vendor Security Questionnaire');
        expect(state!.draft!.answers).toHaveLength(1);
        expect(state!.draft!.answers[0].questionId).toBe('q1');
        expect(state!.draft!.answers[0].answerJson).toEqual({ selected: 'yes' });
        expect(state!.draft!.answers[0].computedPoints).toBe(10);
    });

    it('loads APPROVED assessment into published slot', async () => {
        const { db } = makeMockDb(APPROVED_ASSESSMENT);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state = await adapter.loadState(db, ASSESSMENT_ID);

        expect(state!.phase).toBe('PUBLISHED');
        expect(state!.currentVersion).toBe(2);
        expect(state!.draft).toBeNull();
        expect(state!.published).not.toBeNull();
        expect(state!.published!.score).toBe(10);
        expect(state!.published!.riskRating).toBe('MEDIUM');
    });

    it('queries with tenantId filter (RLS safety)', async () => {
        const { db } = makeMockDb(DRAFT_ASSESSMENT);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        await adapter.loadState(db, ASSESSMENT_ID);

        expect(db.vendorAssessment.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: ASSESSMENT_ID, tenantId: TENANT_ID },
            }),
        );
    });

    it('includes template and answers in query', async () => {
        const { db } = makeMockDb(DRAFT_ASSESSMENT);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        await adapter.loadState(db, ASSESSMENT_ID);

        expect(db.vendorAssessment.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                include: expect.objectContaining({
                    template: true,
                    answers: expect.any(Object),
                }),
            }),
        );
    });

    it('maps IN_REVIEW status to DRAFT phase', async () => {
        const inReview = { ...DRAFT_ASSESSMENT, status: 'IN_REVIEW' as const };
        const { db } = makeMockDb(inReview as any);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state = await adapter.loadState(db, ASSESSMENT_ID);
        expect(state!.phase).toBe('DRAFT');
        expect(state!.draft).not.toBeNull();
    });

    it('maps REJECTED status to DRAFT phase', async () => {
        const rejected = { ...DRAFT_ASSESSMENT, status: 'REJECTED' as const };
        const { db } = makeMockDb(rejected as any);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state = await adapter.loadState(db, ASSESSMENT_ID);
        expect(state!.phase).toBe('DRAFT');
    });
});

// ═════════════════════════════════════════════════════════════════════
// 3. saveState
// ═════════════════════════════════════════════════════════════════════

describe('VendorAssessmentEditableAdapter — saveState', () => {
    const publishedPayload: VendorAssessmentPayload = {
        templateKey: 'vendor-security-v1',
        templateName: 'Vendor Security Questionnaire',
        answers: [
            { questionId: 'q1', answerJson: { selected: 'yes' }, computedPoints: 10 },
            { questionId: 'q2', answerJson: { selected: 'no' }, computedPoints: 0 },
        ],
        score: 10,
        riskRating: 'MEDIUM',
        notes: 'Reviewed and approved',
    };

    it('updates status on publish', async () => {
        const { db, updateManyCalls } = makeMockDb(null);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state: EditableState<VendorAssessmentPayload> = {
            phase: 'PUBLISHED',
            currentVersion: 2,
            draft: null,
            published: publishedPayload,
            publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
        };

        await adapter.saveState(db, ASSESSMENT_ID, state);

        expect(updateManyCalls).toHaveLength(1);
        expect(updateManyCalls[0].where).toEqual({ id: ASSESSMENT_ID, tenantId: TENANT_ID });
        expect(updateManyCalls[0].data.status).toBe('APPROVED');
        expect(updateManyCalls[0].data.score).toBe(10);
        expect(updateManyCalls[0].data.riskRating).toBe('MEDIUM');
        expect(updateManyCalls[0].data.decidedByUserId).toBe(USER_ID);
        expect(updateManyCalls[0].data.decidedAt).toBeInstanceOf(Date);
    });

    it('upserts all answers on publish', async () => {
        const { db, upsertCalls } = makeMockDb(null);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state: EditableState<VendorAssessmentPayload> = {
            phase: 'PUBLISHED',
            currentVersion: 2,
            draft: null,
            published: publishedPayload,
            publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
        };

        await adapter.saveState(db, ASSESSMENT_ID, state);

        expect(upsertCalls).toHaveLength(2); // 2 answers
        expect(upsertCalls[0].where.assessmentId_questionId.questionId).toBe('q1');
        expect(upsertCalls[1].where.assessmentId_questionId.questionId).toBe('q2');
    });

    it('updates status and answers on draft save', async () => {
        const { db, updateManyCalls, upsertCalls } = makeMockDb(null);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state: EditableState<VendorAssessmentPayload> = {
            phase: 'DRAFT',
            currentVersion: 1,
            draft: publishedPayload,
            published: null,
            publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
        };

        await adapter.saveState(db, ASSESSMENT_ID, state);

        expect(updateManyCalls).toHaveLength(1);
        expect(updateManyCalls[0].data.status).toBe('DRAFT');
        expect(upsertCalls).toHaveLength(2); // draft answers
    });

    it('updates only status for status-only transitions', async () => {
        const { db, updateManyCalls, upsertCalls } = makeMockDb(null);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        // Archived state (no draft or published)
        const state: EditableState<VendorAssessmentPayload> = {
            phase: 'ARCHIVED',
            currentVersion: 2,
            draft: null,
            published: null,
            publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
        };

        await adapter.saveState(db, ASSESSMENT_ID, state);

        expect(updateManyCalls).toHaveLength(1);
        expect(updateManyCalls[0].data.status).toBe('APPROVED'); // ARCHIVED → APPROVED
        expect(upsertCalls).toHaveLength(0); // no answered upserted
    });

    it('uses tenantId in all write operations', async () => {
        const { db, updateManyCalls, upsertCalls } = makeMockDb(null);
        const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

        const state: EditableState<VendorAssessmentPayload> = {
            phase: 'PUBLISHED',
            currentVersion: 2,
            draft: null,
            published: publishedPayload,
            publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
        };

        await adapter.saveState(db, ASSESSMENT_ID, state);

        // Assessment update uses tenantId
        expect(updateManyCalls[0].where.tenantId).toBe(TENANT_ID);
        // Answer upserts use tenantId
        expect(upsertCalls[0].create.tenantId).toBe(TENANT_ID);
    });
});

// ═════════════════════════════════════════════════════════════════════
// 4. Phase Mapping Consistency
// ═════════════════════════════════════════════════════════════════════

describe('Phase mapping round-trip consistency', () => {
    it('DRAFT → DRAFT → DRAFT', () => {
        const phase = assessmentStatusToPhase('DRAFT');
        const status = phaseToAssessmentStatus(phase);
        expect(status).toBe('DRAFT');
    });

    it('APPROVED → PUBLISHED → APPROVED', () => {
        const phase = assessmentStatusToPhase('APPROVED');
        const status = phaseToAssessmentStatus(phase);
        expect(status).toBe('APPROVED');
    });

    it('IN_REVIEW → DRAFT → DRAFT (lossy, intentional)', () => {
        const phase = assessmentStatusToPhase('IN_REVIEW');
        const status = phaseToAssessmentStatus(phase);
        // This is intentionally lossy: IN_REVIEW maps to DRAFT phase,
        // and DRAFT phase maps back to DRAFT status (not IN_REVIEW).
        // The approval workflow handles IN_REVIEW separately.
        expect(status).toBe('DRAFT');
    });

    it('REJECTED → DRAFT → DRAFT (lossy, intentional)', () => {
        const phase = assessmentStatusToPhase('REJECTED');
        const status = phaseToAssessmentStatus(phase);
        expect(status).toBe('DRAFT');
    });
});

// ═════════════════════════════════════════════════════════════════════
// 5. History Persistence (GAP-5)
// ═════════════════════════════════════════════════════════════════════

describe('VendorAssessmentEditableAdapter — History Persistence (GAP-5)', () => {
    const HISTORY_ENTRY = {
        version: 1,
        payload: {
            templateKey: 'vendor-security-v1',
            templateName: 'Vendor Security Questionnaire',
            answers: [{ questionId: 'q1', answerJson: { selected: 'yes' }, computedPoints: 10 }],
            score: 8,
            riskRating: 'MEDIUM',
            notes: 'Prior assessment',
        },
        publishedAt: '2026-01-10T00:00:00.000Z',
        publishedBy: 'reviewer-1',
    };

    describe('loadState reads persisted lifecycle columns', () => {
        it('reads lifecycleVersion from assessment', async () => {
            const withVersion = { ...APPROVED_ASSESSMENT, lifecycleVersion: 5 };
            const { db } = makeMockDb(withVersion as any);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state = await adapter.loadState(db, ASSESSMENT_ID);
            expect(state!.currentVersion).toBe(5);
        });

        it('reads lifecycleHistoryJson from assessment', async () => {
            const withHistory = {
                ...APPROVED_ASSESSMENT,
                lifecycleVersion: 3,
                lifecycleHistoryJson: [HISTORY_ENTRY],
            };
            const { db } = makeMockDb(withHistory as any);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state = await adapter.loadState(db, ASSESSMENT_ID);
            expect(state!.history).toHaveLength(1);
            expect(state!.history[0].version).toBe(1);
            expect(state!.history[0].publishedBy).toBe('reviewer-1');
        });

        it('falls back to derived version when lifecycleVersion is missing (legacy)', async () => {
            // Legacy data: no lifecycleVersion column → fallback
            const legacy = { ...APPROVED_ASSESSMENT };
            const { db } = makeMockDb(legacy);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state = await adapter.loadState(db, ASSESSMENT_ID);
            // Falls back to `hasBeenApproved ? 2 : 1`
            expect(state!.currentVersion).toBe(2);
        });

        it('falls back to empty history when lifecycleHistoryJson is null (legacy)', async () => {
            const legacy = { ...DRAFT_ASSESSMENT, lifecycleHistoryJson: null };
            const { db } = makeMockDb(legacy as any);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state = await adapter.loadState(db, ASSESSMENT_ID);
            expect(state!.history).toEqual([]);
        });
    });

    describe('saveState persists lifecycle columns', () => {
        const publishedPayload: VendorAssessmentPayload = {
            templateKey: 'vendor-security-v1',
            templateName: 'Vendor Security Questionnaire',
            answers: [{ questionId: 'q1', answerJson: { selected: 'yes' }, computedPoints: 10 }],
            score: 10,
            riskRating: 'MEDIUM',
            notes: 'Reviewed',
        };

        it('persists lifecycleVersion on publish', async () => {
            const { db, updateManyCalls } = makeMockDb(null);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state: EditableState<VendorAssessmentPayload> = {
                phase: 'PUBLISHED',
                currentVersion: 3,
                draft: null,
                published: publishedPayload,
                publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
            };

            await adapter.saveState(db, ASSESSMENT_ID, state);
            expect(updateManyCalls[0].data.lifecycleVersion).toBe(3);
        });

        it('persists lifecycleVersion on draft update', async () => {
            const { db, updateManyCalls } = makeMockDb(null);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state: EditableState<VendorAssessmentPayload> = {
                phase: 'DRAFT',
                currentVersion: 2,
                draft: publishedPayload,
                published: null,
                publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
            };

            await adapter.saveState(db, ASSESSMENT_ID, state);
            expect(updateManyCalls[0].data.lifecycleVersion).toBe(2);
        });

        it('persists lifecycleVersion on status-only transition', async () => {
            const { db, updateManyCalls } = makeMockDb(null);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state: EditableState<VendorAssessmentPayload> = {
                phase: 'ARCHIVED',
                currentVersion: 4,
                draft: null,
                published: null,
                publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
            };

            await adapter.saveState(db, ASSESSMENT_ID, state);
            expect(updateManyCalls[0].data.lifecycleVersion).toBe(4);
        });

        it('persists history as lifecycleHistoryJson on publish', async () => {
            const { db, updateManyCalls } = makeMockDb(null);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state: EditableState<VendorAssessmentPayload> = {
                phase: 'PUBLISHED',
                currentVersion: 3,
                draft: null,
                published: publishedPayload,
                publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [HISTORY_ENTRY as any],
            };

            await adapter.saveState(db, ASSESSMENT_ID, state);
            expect(updateManyCalls[0].data.lifecycleHistoryJson).toEqual([HISTORY_ENTRY]);
        });

        it('does NOT include lifecycleHistoryJson when history is empty', async () => {
            const { db, updateManyCalls } = makeMockDb(null);
            const adapter = new VendorAssessmentEditableAdapter(TENANT_ID, USER_ID);

            const state: EditableState<VendorAssessmentPayload> = {
                phase: 'PUBLISHED',
                currentVersion: 2,
                draft: null,
                published: publishedPayload,
                publishedBy: 'user-1',
                publishedChangeSummary: null,
                history: [],
            };

            await adapter.saveState(db, ASSESSMENT_ID, state);
            expect(updateManyCalls[0].data.lifecycleHistoryJson).toBeUndefined();
        });
    });
});
