/**
 * Unit tests for email enqueue dedupe logic and outbox processing.
 */
import { buildDedupeKey } from '@/app-layer/notifications/enqueue';

describe('buildDedupeKey', () => {
    it('produces the correct format', () => {
        const date = new Date('2026-03-17T10:00:00Z');
        const key = buildDedupeKey('tenant-1', 'TASK_ASSIGNED', 'alice@acme.com', 'task-42', date);
        expect(key).toBe('tenant-1:TASK_ASSIGNED:alice@acme.com:task-42:2026-03-17');
    });

    it('uses current date if none provided', () => {
        const key = buildDedupeKey('tenant-1', 'TASK_ASSIGNED', 'alice@acme.com', 'task-42');
        const today = new Date().toISOString().slice(0, 10);
        expect(key).toContain(today);
    });

    it('produces different keys for different types', () => {
        const date = new Date('2026-03-17');
        const key1 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'a@b.com', 'x', date);
        const key2 = buildDedupeKey('t1', 'EVIDENCE_EXPIRING', 'a@b.com', 'x', date);
        expect(key1).not.toBe(key2);
    });

    it('produces different keys for different tenants', () => {
        const date = new Date('2026-03-17');
        const key1 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'a@b.com', 'x', date);
        const key2 = buildDedupeKey('t2', 'TASK_ASSIGNED', 'a@b.com', 'x', date);
        expect(key1).not.toBe(key2);
    });

    it('produces different keys for different recipients', () => {
        const date = new Date('2026-03-17');
        const key1 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'alice@b.com', 'x', date);
        const key2 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'bob@b.com', 'x', date);
        expect(key1).not.toBe(key2);
    });

    it('produces different keys for different days', () => {
        const key1 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'a@b.com', 'x', new Date('2026-03-17'));
        const key2 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'a@b.com', 'x', new Date('2026-03-18'));
        expect(key1).not.toBe(key2);
    });

    it('produces same key for same inputs on same day', () => {
        const date = new Date('2026-03-17T08:00:00Z');
        const key1 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'a@b.com', 'x', date);
        const date2 = new Date('2026-03-17T22:00:00Z');
        const key2 = buildDedupeKey('t1', 'TASK_ASSIGNED', 'a@b.com', 'x', date2);
        expect(key1).toBe(key2);
    });
});
