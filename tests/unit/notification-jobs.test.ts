/**
 * Unit tests for notification jobs — daily evidence expiry sweep and runner.
 */

// Mock the retention-notifications module
jest.mock('@/app-layer/jobs/retention-notifications', () => ({
    runEvidenceRetentionNotifications: jest.fn(),
}));

// Mock processOutbox
jest.mock('@/app-layer/notifications/processOutbox', () => ({
    processOutbox: jest.fn(),
}));

import { runEvidenceRetentionNotifications } from '@/app-layer/jobs/retention-notifications';
import { processOutbox } from '@/app-layer/notifications/processOutbox';
import { runDailyEvidenceExpiryNotifications } from '@/app-layer/jobs/dailyEvidenceExpiry';

const mockedRetention = runEvidenceRetentionNotifications as jest.MockedFunction<typeof runEvidenceRetentionNotifications>;
const mockedOutbox = processOutbox as jest.MockedFunction<typeof processOutbox>;

describe('runDailyEvidenceExpiryNotifications', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedRetention.mockResolvedValue({ scanned: 0, tasksCreated: 0, skippedDuplicate: 0 });
        mockedOutbox.mockResolvedValue({ sent: 0, failed: 0, skipped: 0 });
    });

    it('runs three retention sweeps at 30, 7, and 1 day thresholds', async () => {
        await runDailyEvidenceExpiryNotifications();

        expect(mockedRetention).toHaveBeenCalledTimes(3);
        expect(mockedRetention).toHaveBeenCalledWith(expect.objectContaining({ days: 30 }));
        expect(mockedRetention).toHaveBeenCalledWith(expect.objectContaining({ days: 7 }));
        expect(mockedRetention).toHaveBeenCalledWith(expect.objectContaining({ days: 1 }));
    });

    it('flushes outbox after sweeps', async () => {
        await runDailyEvidenceExpiryNotifications();
        expect(mockedOutbox).toHaveBeenCalledTimes(1);
        expect(mockedOutbox).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
    });

    it('skips outbox when skipOutbox=true', async () => {
        await runDailyEvidenceExpiryNotifications({ skipOutbox: true });
        expect(mockedOutbox).not.toHaveBeenCalled();
    });

    it('passes tenantId to each sweep when provided', async () => {
        await runDailyEvidenceExpiryNotifications({ tenantId: 'tenant-42' });

        for (const call of mockedRetention.mock.calls) {
            expect(call[0]).toHaveProperty('tenantId', 'tenant-42');
        }
    });

    it('returns aggregate results', async () => {
        mockedRetention
            .mockResolvedValueOnce({ scanned: 10, tasksCreated: 2, skippedDuplicate: 1 })
            .mockResolvedValueOnce({ scanned: 5, tasksCreated: 1, skippedDuplicate: 0 })
            .mockResolvedValueOnce({ scanned: 2, tasksCreated: 0, skippedDuplicate: 0 });
        mockedOutbox.mockResolvedValue({ sent: 3, failed: 0, skipped: 0 });

        const result = await runDailyEvidenceExpiryNotifications();

        expect(result.sweeps.days30.tasksCreated).toBe(2);
        expect(result.sweeps.days7.tasksCreated).toBe(1);
        expect(result.sweeps.days1.tasksCreated).toBe(0);
        expect(result.outbox.sent).toBe(3);
    });

    it('is idempotent — duplicate sweeps do not create extra tasks', async () => {
        // First run creates tasks
        mockedRetention.mockResolvedValue({ scanned: 5, tasksCreated: 3, skippedDuplicate: 0 });
        await runDailyEvidenceExpiryNotifications();

        // Second run — existing tasks are skipped
        mockedRetention.mockResolvedValue({ scanned: 5, tasksCreated: 0, skippedDuplicate: 3 });
        const result = await runDailyEvidenceExpiryNotifications();

        expect(result.sweeps.days30.tasksCreated).toBe(0);
        expect(result.sweeps.days30.skippedDuplicate).toBe(3);
    });
});
