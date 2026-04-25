/**
 * Unit tests for src/app-layer/usecases/framework/install.ts
 *
 * Wave 4 of GAP-02. Framework pack install is the heaviest write
 * operation in the app — ISO27001 lands ~93 controls + ~470 tasks +
 * ~93 requirement links per tenant in a single transaction. The
 * critical invariants:
 *
 *   1. Idempotency: re-running installPack on a tenant that already
 *      has the pack produces zero new controls (skip-if-code-exists),
 *      but DOES upsert any missing requirement links so a partial
 *      previous install converges.
 *   2. assertCanInstallFrameworkPack gate (admin/editor only).
 *   3. installSingleTemplate is also idempotent and mirrors the
 *      same convergence semantics.
 *   4. bulkMapControls validates EVERY requirement id against the
 *      named framework AND every control id against the caller
 *      tenant — cross-tenant control ids are rejected before any
 *      mapping is written.
 *   5. bulkMapControls / bulkInstallTemplates enforce per-batch
 *      caps (200 / 100) so a hostile call cannot lock the table.
 */

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
    prisma: {
        frameworkPack: { findUnique: jest.fn() },
        framework: { findFirst: jest.fn(), findUnique: jest.fn() },
        frameworkRequirement: { findMany: jest.fn() },
        controlTemplate: { findUnique: jest.fn(), findMany: jest.fn() },
    },
}));

jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
    previewPackInstall,
    installPack,
    installSingleTemplate,
    bulkMapControls,
    bulkInstallTemplates,
} from '@/app-layer/usecases/framework/install';
import { runInTenantContext } from '@/lib/db-context';
import { prisma } from '@/lib/prisma';
import { logEvent } from '@/app-layer/events/audit';
import { makeRequestContext } from '../../helpers/make-context';

const mockRunInTx = runInTenantContext as jest.MockedFunction<typeof runInTenantContext>;
const mockPackFind = prisma.frameworkPack.findUnique as jest.MockedFunction<typeof prisma.frameworkPack.findUnique>;
const mockFrameworkFindFirst = prisma.framework.findFirst as jest.MockedFunction<typeof prisma.framework.findFirst>;
const mockReqFindMany = prisma.frameworkRequirement.findMany as jest.MockedFunction<typeof prisma.frameworkRequirement.findMany>;
const mockTemplateFindUnique = prisma.controlTemplate.findUnique as jest.MockedFunction<typeof prisma.controlTemplate.findUnique>;
const mockTemplateFindMany = prisma.controlTemplate.findMany as jest.MockedFunction<typeof prisma.controlTemplate.findMany>;
const mockLog = logEvent as jest.MockedFunction<typeof logEvent>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('previewPackInstall', () => {
    it('rejects READER — wait, READER can VIEW frameworks per policy', async () => {
        // assertCanViewFrameworks allows everyone with canRead.
        mockPackFind.mockResolvedValueOnce({
            key: 'iso27001-2022',
            name: 'ISO 27001:2022',
            framework: { key: 'ISO27001', name: 'ISO', version: '2022' },
            templateLinks: [],
        } as never);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) =>
            fn({ control: { findMany: jest.fn().mockResolvedValue([]) } } as never),
        );

        await expect(
            previewPackInstall(makeRequestContext('READER'), 'iso27001-2022'),
        ).resolves.toBeDefined();
    });

    it('throws notFound when pack does not exist', async () => {
        mockPackFind.mockResolvedValueOnce(null);

        await expect(
            previewPackInstall(makeRequestContext('ADMIN'), 'no-such-pack'),
        ).rejects.toThrow(/Pack not found/);
    });

    it('counts new vs already-installed controls correctly', async () => {
        mockPackFind.mockResolvedValueOnce({
            key: 'iso27001-2022',
            name: 'ISO 27001:2022',
            framework: { key: 'ISO27001', name: 'ISO', version: '2022' },
            templateLinks: [
                { template: { code: 'A.5.1', title: 'X', tasks: [], requirementLinks: [] } },
                { template: { code: 'A.5.2', title: 'Y', tasks: [], requirementLinks: [] } },
                { template: { code: 'A.5.3', title: 'Z', tasks: [], requirementLinks: [] } },
            ],
        } as never);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) =>
            fn({
                control: {
                    findMany: jest.fn().mockResolvedValue([
                        { code: 'A.5.1' }, // already installed
                    ]),
                },
            } as never),
        );

        const result = await previewPackInstall(
            makeRequestContext('ADMIN'),
            'iso27001-2022',
        );

        expect(result.totalTemplates).toBe(3);
        expect(result.newControls).toBe(2);
        expect(result.existingControls).toBe(1);
    });
});

describe('installPack — RBAC + idempotency + audit', () => {
    it('rejects READER (canInstallFrameworkPack gate)', async () => {
        await expect(
            installPack(makeRequestContext('READER'), 'iso27001-2022'),
        ).rejects.toThrow();
    });

    it('rejects AUDITOR — auditors view but cannot install', async () => {
        await expect(
            installPack(makeRequestContext('AUDITOR'), 'iso27001-2022'),
        ).rejects.toThrow();
    });

    it('throws notFound for missing pack', async () => {
        mockPackFind.mockResolvedValueOnce(null);

        await expect(
            installPack(makeRequestContext('ADMIN'), 'no-such-pack'),
        ).rejects.toThrow(/Pack not found/);
    });

    it('skips controls that already exist (idempotent) but still upserts requirement links', async () => {
        mockPackFind.mockResolvedValueOnce({
            key: 'iso27001-2022',
            name: 'ISO',
            frameworkId: 'fw-1',
            framework: { key: 'ISO27001' },
            templateLinks: [{
                template: {
                    code: 'A.5.1',
                    title: 'X',
                    description: 'desc',
                    category: 'cat',
                    defaultFrequency: 'ANNUAL',
                    tasks: [{ title: 't1', description: 'd1' }],
                    requirementLinks: [{ requirementId: 'req-1' }],
                },
            }],
        } as never);

        const controlCreate = jest.fn();
        const taskCreate = jest.fn();
        const linkCreate = jest.fn();
        const linkUpsert = jest.fn();

        mockRunInTx.mockImplementationOnce(async (_ctx, fn, _opts) =>
            fn({
                control: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'existing-c' }),
                    create: controlCreate,
                },
                task: { create: taskCreate },
                controlRequirementLink: {
                    create: linkCreate,
                    upsert: linkUpsert,
                },
            } as never),
        );

        const result = await installPack(makeRequestContext('ADMIN'), 'iso27001-2022');

        // Regression: a refactor that re-created controls would
        // duplicate every row on a re-install. Idempotency lets
        // operators re-run installs to converge after a partial
        // failure (network blip, timeout).
        expect(controlCreate).not.toHaveBeenCalled();
        expect(taskCreate).not.toHaveBeenCalled();
        // BUT requirement links still upsert so a partial previous
        // install can converge.
        expect(linkUpsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                controlId_requirementId: {
                    controlId: 'existing-c', requirementId: 'req-1',
                },
            },
        }));
        expect(result.controlsCreated).toBe(0);
    });

    it('emits FRAMEWORK_PACK_INSTALLED audit', async () => {
        mockPackFind.mockResolvedValueOnce({
            key: 'iso27001-2022', name: 'ISO',
            frameworkId: 'fw-1',
            framework: { key: 'ISO27001' },
            templateLinks: [],
        } as never);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn, _opts) =>
            fn({
                control: { findFirst: jest.fn(), create: jest.fn() },
                task: { create: jest.fn() },
                controlRequirementLink: { create: jest.fn(), upsert: jest.fn() },
            } as never),
        );

        await installPack(makeRequestContext('ADMIN'), 'iso27001-2022');

        expect(mockLog).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ action: 'FRAMEWORK_PACK_INSTALLED' }),
        );
    });
});

describe('installSingleTemplate — idempotency', () => {
    it('returns alreadyExisted=true without recreating, but ensures requirement links', async () => {
        mockTemplateFindUnique.mockResolvedValueOnce({
            id: 'tpl-1', code: 'A.5.1', title: 'X', description: 'd',
            category: 'c', defaultFrequency: 'ANNUAL',
            tasks: [],
            requirementLinks: [{ requirementId: 'req-1' }, { requirementId: 'req-2' }],
        } as never);

        const linkUpsert = jest.fn();
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) =>
            fn({
                control: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'existing-c' }),
                },
                controlRequirementLink: { upsert: linkUpsert },
            } as never),
        );

        const result = await installSingleTemplate(
            makeRequestContext('ADMIN'),
            'A.5.1',
        );

        expect(result.alreadyExisted).toBe(true);
        expect(result.mappingsCreated).toBe(2);
    });
});

describe('bulkMapControls — cross-tenant + framework-bound validation', () => {
    it('rejects when ANY requirement id does not belong to the named framework', async () => {
        mockFrameworkFindFirst.mockResolvedValueOnce({ id: 'fw-1' } as never);
        mockReqFindMany.mockResolvedValueOnce([
            { id: 'req-valid' }, // only one of the two is valid
        ] as never);

        await expect(
            bulkMapControls(makeRequestContext('ADMIN'), 'ISO27001', [
                { controlId: 'c1', requirementIds: ['req-valid', 'req-invalid'] },
            ]),
        ).rejects.toThrow(/Invalid requirement IDs/);
        // Regression: a refactor that skipped this check would let an
        // admin attach a control to a requirement from another
        // framework — coverage scores and audit packs misreport.
    });

    it('rejects when ANY control id does not belong to the caller tenant (cross-tenant)', async () => {
        mockFrameworkFindFirst.mockResolvedValueOnce({ id: 'fw-1' } as never);
        mockReqFindMany.mockResolvedValueOnce([{ id: 'req-1' }] as never);
        mockRunInTx.mockImplementationOnce(async (_ctx, fn) =>
            fn({
                control: {
                    findMany: jest.fn().mockResolvedValue([
                        // only c1 is mine; tenant-B-control was supplied but is not in the tenant
                        { id: 'c1' },
                    ]),
                },
            } as never),
        );

        await expect(
            bulkMapControls(
                makeRequestContext('ADMIN', { tenantId: 'tenant-A' }),
                'ISO27001',
                [
                    { controlId: 'c1', requirementIds: ['req-1'] },
                    { controlId: 'tenant-B-control', requirementIds: ['req-1'] },
                ],
            ),
        ).rejects.toThrow(/Invalid control IDs/);
    });

    it('enforces the per-batch cap (200 mappings)', async () => {
        const oversized = Array.from({ length: 201 }, (_, i) => ({
            controlId: `c${i}`, requirementIds: ['r1'],
        }));

        await expect(
            bulkMapControls(makeRequestContext('ADMIN'), 'ISO27001', oversized),
        ).rejects.toThrow(/Max 200/);
        // Regression: the cap stops a hostile call from holding the
        // table-write lock long enough to cascade timeouts onto
        // legitimate traffic.
    });
});

describe('bulkInstallTemplates', () => {
    it('rejects READER (canInstallFrameworkPack)', async () => {
        await expect(
            bulkInstallTemplates(makeRequestContext('READER'), ['A.5.1']),
        ).rejects.toThrow();
    });

    it('enforces the per-batch cap (100 templates)', async () => {
        const oversized = Array.from({ length: 101 }, (_, i) => `T-${i}`);

        await expect(
            bulkInstallTemplates(makeRequestContext('ADMIN'), oversized),
        ).rejects.toThrow(/Max 100/);
    });

    it('rejects when any template code is unknown', async () => {
        mockTemplateFindMany.mockResolvedValueOnce([
            { code: 'A.5.1', tasks: [], requirementLinks: [] },
        ] as never);

        await expect(
            bulkInstallTemplates(makeRequestContext('ADMIN'), [
                'A.5.1', 'NO-SUCH',
            ]),
        ).rejects.toThrow(/Templates not found/);
    });
});
