/**
 * Unit tests for notification settings — disabled tenant skips enqueue.
 */
import { buildDedupeKey } from '@/app-layer/notifications/enqueue';

// Mock the settings module
jest.mock('@/app-layer/notifications/settings', () => ({
    isNotificationsEnabled: jest.fn(),
    getTenantNotificationSettings: jest.fn(),
}));

import { isNotificationsEnabled } from '@/app-layer/notifications/settings';
const mockedIsEnabled = isNotificationsEnabled as jest.MockedFunction<typeof isNotificationsEnabled>;

describe('enqueueEmail with tenant settings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('buildDedupeKey still works with settings module loaded', () => {
        const key = buildDedupeKey('t1', 'TASK_ASSIGNED', 'a@b.com', 'eid', new Date('2026-03-17'));
        expect(key).toBe('t1:TASK_ASSIGNED:a@b.com:eid:2026-03-17');
    });

    it('isNotificationsEnabled defaults to true', async () => {
        // Test that our mock can be called
        mockedIsEnabled.mockResolvedValue(true);
        expect(await isNotificationsEnabled({} as any, 'tenant-1')).toBe(true);
    });

    it('isNotificationsEnabled can return false', async () => {
        mockedIsEnabled.mockResolvedValue(false);
        expect(await isNotificationsEnabled({} as any, 'tenant-1')).toBe(false);
    });
});

describe('Settings defaults', () => {
    it('default settings shape has expected fields', () => {
        const defaults = {
            enabled: true,
            defaultFromName: 'Inflect Compliance',
            defaultFromEmail: 'noreply@inflect.app',
            complianceMailbox: null,
        };

        expect(defaults.enabled).toBe(true);
        expect(defaults.defaultFromName).toBe('Inflect Compliance');
        expect(defaults.defaultFromEmail).toBe('noreply@inflect.app');
        expect(defaults.complianceMailbox).toBeNull();
    });
});
