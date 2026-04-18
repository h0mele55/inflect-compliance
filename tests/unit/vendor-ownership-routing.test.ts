export {};
/**
 * Vendor Ownership — Due Item Routing Tests
 *
 * Verifies that:
 * 1. Vendors with ownerUserId create DueItems assigned to the correct user
 * 2. Ownerless vendors correctly have undefined ownerUserId (admin fallback)
 * 3. ownerUserId is selected from all 4 vendor queries
 * 4. The full job→service→DueItem chain preserves vendor owner
 */

const TENANT_A = 'tenant-vendor-owner';
const OWNER_USER_ID = 'user-vendor-owner';

const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
};

const mockVendorFindMany = jest.fn().mockResolvedValue([]);

beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.mock('@/lib/observability/logger', () => ({ logger: mockLogger }));
    jest.mock('@/lib/observability/job-runner', () => ({
        runJob: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    }));
    jest.mock('@/lib/prisma', () => ({
        __esModule: true,
        default: {
            vendor: { findMany: (...args: unknown[]) => mockVendorFindMany(...args) },
        },
    }));
});

// ═════════════════════════════════════════════════════════════════════
// 1. Service Layer — ownerUserId in queries and DueVendor results
// ═════════════════════════════════════════════════════════════════════

describe('findDueVendorsAndEmitEvents — ownerUserId wiring', () => {
    test('all 4 queries select ownerUserId from vendors', async () => {
        const { findDueVendorsAndEmitEvents } = await import(
            '../../src/app-layer/services/vendor-renewals'
        );
        await findDueVendorsAndEmitEvents();

        expect(mockVendorFindMany).toHaveBeenCalledTimes(4);
        for (const call of mockVendorFindMany.mock.calls) {
            const select = call[0]?.select;
            expect(select).toHaveProperty('ownerUserId', true);
        }
    });

    test('DueVendor result carries ownerUserId from DB', async () => {
        const ownedVendor = {
            id: 'v-owned',
            tenantId: TENANT_A,
            name: 'Owned Vendor',
            ownerUserId: OWNER_USER_ID,
            nextReviewAt: new Date('2020-01-01'), // overdue
        };

        mockVendorFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
            // Return the owned vendor for the overdue reviews query
            if (args.where.nextReviewAt && (args.where.nextReviewAt as Record<string, unknown>).lt) {
                return Promise.resolve([ownedVendor]);
            }
            return Promise.resolve([]);
        });

        const { findDueVendorsAndEmitEvents } = await import(
            '../../src/app-layer/services/vendor-renewals'
        );
        const results = await findDueVendorsAndEmitEvents();

        const owned = results.find(r => r.id === 'v-owned');
        expect(owned).toBeDefined();
        expect(owned!.ownerUserId).toBe(OWNER_USER_ID);
    });

    test('ownerless vendor has null ownerUserId in DueVendor', async () => {
        const unownedVendor = {
            id: 'v-unowned',
            tenantId: TENANT_A,
            name: 'Unowned Vendor',
            ownerUserId: null,
            nextReviewAt: new Date('2020-01-01'),
        };

        mockVendorFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
            if (args.where.nextReviewAt && (args.where.nextReviewAt as Record<string, unknown>).lt) {
                return Promise.resolve([unownedVendor]);
            }
            return Promise.resolve([]);
        });

        const { findDueVendorsAndEmitEvents } = await import(
            '../../src/app-layer/services/vendor-renewals'
        );
        const results = await findDueVendorsAndEmitEvents();

        const unowned = results.find(r => r.id === 'v-unowned');
        expect(unowned).toBeDefined();
        expect(unowned!.ownerUserId).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════
// 2. Job Layer — toDueItem wires ownerUserId into DueItem
// ═════════════════════════════════════════════════════════════════════

describe('runVendorRenewalCheck — ownerUserId on DueItems', () => {
    test('vendor with ownerUserId → DueItem has ownerUserId', async () => {
        const ownedVendor = {
            id: 'v-owned',
            tenantId: TENANT_A,
            name: 'Owned Vendor',
            ownerUserId: OWNER_USER_ID,
            nextReviewAt: new Date('2020-01-01'),
            contractRenewalAt: new Date('2030-01-01'),
        };

        mockVendorFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
            if (args.where.nextReviewAt && (args.where.nextReviewAt as Record<string, unknown>).lt) {
                return Promise.resolve([ownedVendor]);
            }
            return Promise.resolve([]);
        });

        const { runVendorRenewalCheck } = await import(
            '../../src/app-layer/jobs/vendor-renewal-check'
        );
        const { items } = await runVendorRenewalCheck();

        const item = items.find(i => i.entityId === 'v-owned');
        expect(item).toBeDefined();
        expect(item!.ownerUserId).toBe(OWNER_USER_ID);
        expect(item!.entityType).toBe('VENDOR');
    });

    test('vendor without ownerUserId → DueItem has undefined ownerUserId (admin fallback)', async () => {
        const unownedVendor = {
            id: 'v-unowned',
            tenantId: TENANT_A,
            name: 'Unowned Vendor',
            ownerUserId: null,
            nextReviewAt: new Date('2020-01-01'),
            contractRenewalAt: new Date('2030-01-01'),
        };

        mockVendorFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
            if (args.where.nextReviewAt && (args.where.nextReviewAt as Record<string, unknown>).lt) {
                return Promise.resolve([unownedVendor]);
            }
            return Promise.resolve([]);
        });

        const { runVendorRenewalCheck } = await import(
            '../../src/app-layer/jobs/vendor-renewal-check'
        );
        const { items } = await runVendorRenewalCheck();

        const item = items.find(i => i.entityId === 'v-unowned');
        expect(item).toBeDefined();
        expect(item!.ownerUserId).toBeUndefined(); // null → undefined → admin fallback
    });

    test('mixed vendors: each DueItem gets the correct owner', async () => {
        const owned = {
            id: 'v-1', tenantId: TENANT_A, name: 'Owned', ownerUserId: OWNER_USER_ID,
            nextReviewAt: new Date('2020-01-01'), contractRenewalAt: new Date('2030-01-01'),
        };
        const unowned = {
            id: 'v-2', tenantId: TENANT_A, name: 'Unowned', ownerUserId: null,
            nextReviewAt: new Date('2020-01-01'), contractRenewalAt: new Date('2030-01-01'),
        };

        mockVendorFindMany.mockImplementation((args: { where: Record<string, unknown> }) => {
            if (args.where.nextReviewAt && (args.where.nextReviewAt as Record<string, unknown>).lt) {
                return Promise.resolve([owned, unowned]);
            }
            return Promise.resolve([]);
        });

        const { runVendorRenewalCheck } = await import(
            '../../src/app-layer/jobs/vendor-renewal-check'
        );
        const { items } = await runVendorRenewalCheck();

        const ownedItem = items.find(i => i.entityId === 'v-1');
        const unownedItem = items.find(i => i.entityId === 'v-2');

        expect(ownedItem!.ownerUserId).toBe(OWNER_USER_ID);
        expect(unownedItem!.ownerUserId).toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════
// 3. Digest routing contract — vendor items route correctly
// ═════════════════════════════════════════════════════════════════════

describe('Digest routing: vendor items with ownerUserId', () => {
    test('vendor with ownerUserId routes to owner, not admin', () => {
        const items = [
            { entityType: 'VENDOR', entityId: 'v-1', tenantId: TENANT_A, name: 'Owned',
              reason: 'Overdue', urgency: 'OVERDUE', dueDate: '2020-01-01', daysRemaining: -100,
              ownerUserId: OWNER_USER_ID },
            { entityType: 'VENDOR', entityId: 'v-2', tenantId: TENANT_A, name: 'Unowned',
              reason: 'Overdue', urgency: 'OVERDUE', dueDate: '2020-01-01', daysRemaining: -100,
              ownerUserId: undefined },
        ];

        // Simulate digest-dispatcher grouping logic
        const owned = new Map<string, typeof items>();
        const unowned: typeof items = [];

        for (const item of items) {
            if (item.ownerUserId) {
                if (!owned.has(item.ownerUserId)) owned.set(item.ownerUserId, []);
                owned.get(item.ownerUserId)!.push(item);
            } else {
                unowned.push(item);
            }
        }

        // Owner gets their vendor
        expect(owned.has(OWNER_USER_ID)).toBe(true);
        expect(owned.get(OWNER_USER_ID)![0].entityId).toBe('v-1');

        // Unowned vendor falls to admin
        expect(unowned.length).toBe(1);
        expect(unowned[0].entityId).toBe('v-2');
    });
});
