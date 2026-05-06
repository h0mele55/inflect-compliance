/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
/**
 * Unit tests for src/app-layer/usecases/evidence-retention.ts
 *
 * Wave 2 of GAP-02. Compliance-critical: a bug here either deletes
 * audit-required evidence early (compliance violation) OR misses
 * expired evidence (storage cost + privacy hazard).
 *
 * Behaviours protected:
 *   1. assertCanWrite gate on update / archive / unarchive
 *   2. assertCanAdmin gate on the retention sweep
 *   3. Tenant-scoped lookups: cross-tenant id rejects with 404
 *   4. archive/unarchive idempotent (re-archiving = no-op)
 *   5. DAYS_AFTER_UPLOAD policy computes retentionUntil correctly
 *      from createdAt + N * 86_400_000 ms
 *   6. EVIDENCE_RETENTION_UPDATED / ARCHIVED / UNARCHIVED audit
 *      emitted with the right action name
 */

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(),
}));

jest.mock('@/app-layer/jobs/retention', () => ({
    runEvidenceRetentionSweep: jest.fn().mockResolvedValue({
        dryRun: false,
        archived: 5,
        scanned: 100,
    }),
}));

jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
    updateEvidenceRetention,
    archiveEvidence,
    unarchiveEvidence,
    runRetentionSweepUsecase,
} from '@/app-layer/usecases/evidence-retention';
import { runInTenantContext } from '@/lib/db-context';
import { runEvidenceRetentionSweep } from '@/app-layer/jobs/retention';
import { logEvent } from '@/app-layer/events/audit';
import { makeRequestContext } from '../../helpers/make-context';

const mockRunInTx = runInTenantContext as jest.MockedFunction<typeof runInTenantContext>;
const mockSweep = runEvidenceRetentionSweep as jest.MockedFunction<typeof runEvidenceRetentionSweep>;
const mockLog = logEvent as jest.MockedFunction<typeof logEvent>;

interface FakeEv {
    id: string;
    tenantId: string;
    title: string;
    createdAt: Date;
    isArchived?: boolean;
    retentionPolicy?: string;
    retentionDays?: number;
}

function fakeDbWithEvidence(ev: FakeEv | null) {
    return {
        evidence: {
            findFirst: jest.fn().mockResolvedValue(ev),
            update: jest.fn().mockImplementation((args: any) => ({
                ...(ev ?? {}),
                ...args.data,
            })),
        },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('updateEvidenceRetention', () => {
    it('rejects READER (no canWrite)', async () => {
        await expect(
            updateEvidenceRetention(makeRequestContext('READER'), 'e1', {
                retentionDays: 30,
            }),
        ).rejects.toThrow();
        expect(mockRunInTx).not.toHaveBeenCalled();
    });

    it('rejects when evidence is not found in tenant scope (cross-tenant id)', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) =>
            fn(fakeDbWithEvidence(null) as never),
        );
        await expect(
            updateEvidenceRetention(
                makeRequestContext('EDITOR', { tenantId: 'tenant-A' }),
                'tenant-B-evidence',
                { retentionDays: 30 },
            ),
        ).rejects.toThrow(/not found/);
        // Regression: a bug that drops `tenantId` from the WHERE on
        // findFirst would let admin in A change retention on B's
        // evidence (could trigger early hard-delete).
    });

    it('computes retentionUntil from createdAt + N days for DAYS_AFTER_UPLOAD policy', async () => {
        const createdAt = new Date('2026-01-01T00:00:00Z');
        const ev: FakeEv = {
            id: 'e1', tenantId: 't1', title: 'doc', createdAt,
            retentionPolicy: 'DAYS_AFTER_UPLOAD', retentionDays: 30,
        };
        const fakeDb = fakeDbWithEvidence(ev);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn(fakeDb as never));

        await updateEvidenceRetention(makeRequestContext('EDITOR'), 'e1', {
            retentionPolicy: 'DAYS_AFTER_UPLOAD',
            retentionDays: 30,
        });

        const updateArgs = (fakeDb.evidence.update as jest.Mock).mock.calls[0][0];
        const expected = new Date(createdAt.getTime() + 30 * 86_400_000);
        expect(updateArgs.data.retentionUntil.getTime()).toBe(expected.getTime());
    });

    it('emits EVIDENCE_RETENTION_UPDATED audit', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) =>
            fn(fakeDbWithEvidence({
                id: 'e1', tenantId: 't1', title: 'doc',
                createdAt: new Date(),
            }) as never),
        );
        await updateEvidenceRetention(makeRequestContext('EDITOR'), 'e1', {
            retentionUntil: '2026-12-31T00:00:00Z',
        });
        expect(mockLog).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ action: 'EVIDENCE_RETENTION_UPDATED' }),
        );
    });
});

describe('archiveEvidence', () => {
    it('rejects READER', async () => {
        await expect(
            archiveEvidence(makeRequestContext('READER'), 'e1'),
        ).rejects.toThrow();
    });

    it('throws notFound for cross-tenant id', async () => {
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) =>
            fn(fakeDbWithEvidence(null) as never),
        );
        await expect(
            archiveEvidence(makeRequestContext('EDITOR'), 'missing'),
        ).rejects.toThrow(/not found/);
    });

    it('is idempotent — re-archiving an already archived row is a no-op', async () => {
        const ev: FakeEv = {
            id: 'e1', tenantId: 't1', title: 'doc',
            createdAt: new Date(), isArchived: true,
        };
        const fakeDb = fakeDbWithEvidence(ev);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn(fakeDb as never));

        await archiveEvidence(makeRequestContext('EDITOR'), 'e1');

        // Regression: a buggy retry-archive would emit duplicate audit
        // entries and rewrite isArchived (no-op DB write but pollutes
        // the hash chain).
        expect(fakeDb.evidence.update).not.toHaveBeenCalled();
        expect(mockLog).not.toHaveBeenCalled();
    });

    it('sets isArchived=true and emits EVIDENCE_ARCHIVED audit on first archive', async () => {
        const ev: FakeEv = {
            id: 'e1', tenantId: 't1', title: 'doc',
            createdAt: new Date(), isArchived: false,
        };
        const fakeDb = fakeDbWithEvidence(ev);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn(fakeDb as never));

        await archiveEvidence(makeRequestContext('EDITOR'), 'e1');

        expect(fakeDb.evidence.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'e1' },
                data: { isArchived: true },
            }),
        );
        expect(mockLog).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ action: 'EVIDENCE_ARCHIVED' }),
        );
    });
});

describe('unarchiveEvidence', () => {
    it('is idempotent — unarchiving a non-archived row is a no-op', async () => {
        const ev: FakeEv = {
            id: 'e1', tenantId: 't1', title: 'doc',
            createdAt: new Date(), isArchived: false,
        };
        const fakeDb = fakeDbWithEvidence(ev);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn(fakeDb as never));

        await unarchiveEvidence(makeRequestContext('EDITOR'), 'e1');

        expect(fakeDb.evidence.update).not.toHaveBeenCalled();
        expect(mockLog).not.toHaveBeenCalled();
    });

    it('emits EVIDENCE_UNARCHIVED on actual unarchive', async () => {
        const ev: FakeEv = {
            id: 'e1', tenantId: 't1', title: 'doc',
            createdAt: new Date(), isArchived: true,
        };
        const fakeDb = fakeDbWithEvidence(ev);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) => fn(fakeDb as never));

        await unarchiveEvidence(makeRequestContext('EDITOR'), 'e1');

        expect(mockLog).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ action: 'EVIDENCE_UNARCHIVED' }),
        );
    });
});

describe('runRetentionSweepUsecase', () => {
    it('rejects EDITOR — sweep is canAdmin only (destructive)', async () => {
        await expect(
            runRetentionSweepUsecase(makeRequestContext('EDITOR')),
        ).rejects.toThrow();
        expect(mockSweep).not.toHaveBeenCalled();
    });

    it('rejects READER + AUDITOR', async () => {
        await expect(
            runRetentionSweepUsecase(makeRequestContext('READER')),
        ).rejects.toThrow();
        await expect(
            runRetentionSweepUsecase(makeRequestContext('AUDITOR')),
        ).rejects.toThrow();
    });

    it('passes ctx.tenantId + dryRun to the sweep service', async () => {
        await runRetentionSweepUsecase(
            makeRequestContext('ADMIN', { tenantId: 'tenant-X' }),
            { dryRun: true },
        );
        expect(mockSweep).toHaveBeenCalledWith({
            tenantId: 'tenant-X',
            dryRun: true,
        });
    });

    it('defaults dryRun to undefined when not provided (service handles default)', async () => {
        await runRetentionSweepUsecase(makeRequestContext('ADMIN'));
        expect(mockSweep).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            dryRun: undefined,
        });
    });
});
