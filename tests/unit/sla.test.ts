import { computeSLADates, isSlaBreach, getSlaStatus } from '../../src/app-layer/services/sla';

describe('SLA Service', () => {
    const baseDate = new Date('2025-01-01T00:00:00Z');

    describe('computeSLADates', () => {
        it('returns correct SLA windows for CRITICAL', () => {
            const sla = computeSLADates('CRITICAL', baseDate);
            expect(sla.triageDueAt).toEqual(new Date('2025-01-01T04:00:00Z')); // +4h
            expect(sla.resolveDueAt).toEqual(new Date('2025-01-02T00:00:00Z')); // +24h
        });

        it('returns correct SLA windows for HIGH', () => {
            const sla = computeSLADates('HIGH', baseDate);
            expect(sla.triageDueAt).toEqual(new Date('2025-01-02T00:00:00Z')); // +24h
            expect(sla.resolveDueAt).toEqual(new Date('2025-01-04T00:00:00Z')); // +72h
        });

        it('returns correct SLA windows for MEDIUM', () => {
            const sla = computeSLADates('MEDIUM', baseDate);
            expect(sla.triageDueAt).toEqual(new Date('2025-01-04T00:00:00Z')); // +72h
            expect(sla.resolveDueAt).toEqual(new Date('2025-01-08T00:00:00Z')); // +168h = 7d
        });

        it('returns correct SLA windows for LOW', () => {
            const sla = computeSLADates('LOW', baseDate);
            expect(sla.triageDueAt).toEqual(new Date('2025-01-08T00:00:00Z')); // +168h = 7d
            expect(sla.resolveDueAt).toEqual(new Date('2025-01-31T00:00:00Z')); // +720h = 30d
        });

        it('returns null for INFO severity', () => {
            const sla = computeSLADates('INFO', baseDate);
            expect(sla.triageDueAt).toBeNull();
            expect(sla.resolveDueAt).toBeNull();
        });

        it('handles unknown severity as INFO', () => {
            const sla = computeSLADates('UNKNOWN', baseDate);
            expect(sla.triageDueAt).toBeNull();
            expect(sla.resolveDueAt).toBeNull();
        });

        it('accepts string dates', () => {
            const sla = computeSLADates('CRITICAL', '2025-01-01T00:00:00Z');
            expect(sla.triageDueAt).toEqual(new Date('2025-01-01T04:00:00Z'));
        });
    });

    describe('isSlaBreach', () => {
        it('returns true when deadline has passed', () => {
            const past = new Date('2024-01-01');
            expect(isSlaBreach(past, new Date('2025-01-01'))).toBe(true);
        });

        it('returns false when deadline is in the future', () => {
            const future = new Date('2026-01-01');
            expect(isSlaBreach(future, new Date('2025-01-01'))).toBe(false);
        });

        it('returns false for null deadline', () => {
            expect(isSlaBreach(null)).toBe(false);
        });

        it('accepts string dates', () => {
            expect(isSlaBreach('2024-01-01T00:00:00Z', new Date('2025-01-01'))).toBe(true);
        });
    });

    describe('getSlaStatus', () => {
        it('returns empty for RESOLVED issues', () => {
            const result = getSlaStatus('CRITICAL', '2020-01-01', 'RESOLVED');
            expect(result.triageBreach).toBe(false);
            expect(result.resolveBreach).toBe(false);
            expect(result.label).toBe('');
        });

        it('returns empty for CLOSED issues', () => {
            const result = getSlaStatus('CRITICAL', '2020-01-01', 'CLOSED');
            expect(result.label).toBe('');
        });

        it('returns empty for INFO severity', () => {
            const result = getSlaStatus('INFO', '2020-01-01', 'OPEN');
            expect(result.label).toBe('');
        });

        it('detects triage breach for OPEN CRITICAL issue', () => {
            // Created 5 hours ago, triage SLA is 4h
            const created = new Date(Date.now() - 5 * 3600000).toISOString();
            const result = getSlaStatus('CRITICAL', created, 'OPEN');
            expect(result.triageBreach).toBe(true);
        });

        it('detects resolve breach for overdue CRITICAL issue', () => {
            // Created 25 hours ago, resolve SLA is 24h
            const created = new Date(Date.now() - 25 * 3600000).toISOString();
            const result = getSlaStatus('CRITICAL', created, 'IN_PROGRESS');
            expect(result.resolveBreach).toBe(true);
            expect(result.label).toBe('SLA Breached');
        });

        it('no breach when within SLA window', () => {
            // Created 1 hour ago, SLA is 24h
            const created = new Date(Date.now() - 1 * 3600000).toISOString();
            const result = getSlaStatus('CRITICAL', created, 'OPEN');
            expect(result.triageBreach).toBe(false);
            expect(result.resolveBreach).toBe(false);
            expect(result.label).toBe('');
        });
    });
});
