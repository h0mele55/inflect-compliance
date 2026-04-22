/**
 * Unit Test: triggerFilterJson evaluation.
 *
 * `matchesFilter` is the single gate between "rule subscribed to this
 * event" and "this specific payload instance fires it". The contract
 * here is deliberately strict — richer matching should land as a
 * versioned DSL, not as a looser implementation of this function.
 */

import { matchesFilter } from '@/app-layer/automation/filters';
import type { AutomationDomainEvent } from '@/app-layer/automation/event-contracts';

function riskEvent(
    data: { title: string; score: number; category: string | null }
): AutomationDomainEvent {
    return {
        event: 'RISK_CREATED',
        tenantId: 't',
        entityType: 'Risk',
        entityId: 'r-1',
        actorUserId: null,
        emittedAt: new Date(),
        data,
    };
}

describe('matchesFilter', () => {
    it('null filter matches any event', () => {
        const evt = riskEvent({ title: 't', score: 10, category: 'SEC' });
        expect(matchesFilter(evt, null)).toBe(true);
        expect(matchesFilter(evt, undefined)).toBe(true);
    });

    it('empty filter matches any event', () => {
        const evt = riskEvent({ title: 't', score: 10, category: null });
        expect(matchesFilter(evt, {})).toBe(true);
    });

    it('single-key equality match', () => {
        const evt = riskEvent({ title: 't', score: 10, category: 'SEC' });
        expect(matchesFilter(evt, { category: 'SEC' })).toBe(true);
        expect(matchesFilter(evt, { category: 'COMP' })).toBe(false);
    });

    it('multi-key match is AND', () => {
        const evt = riskEvent({ title: 't', score: 10, category: 'SEC' });
        expect(matchesFilter(evt, { category: 'SEC', score: 10 })).toBe(true);
        expect(matchesFilter(evt, { category: 'SEC', score: 9 })).toBe(false);
    });

    it('unknown filter key fails closed', () => {
        const evt = riskEvent({ title: 't', score: 10, category: 'SEC' });
        expect(matchesFilter(evt, { nope: 'x' })).toBe(false);
    });

    it('only looks at event.data, not metadata', () => {
        const evt = riskEvent({ title: 't', score: 10, category: 'SEC' });
        // tenantId is metadata, not filter-addressable
        expect(matchesFilter(evt, { tenantId: 't' })).toBe(false);
    });

    it('boolean + number equality', () => {
        const evt: AutomationDomainEvent = {
            event: 'TEST_RUN_COMPLETED',
            tenantId: 't',
            entityType: 'ControlTestRun',
            entityId: 'r-1',
            actorUserId: null,
            emittedAt: new Date(),
            data: { testPlanId: 'p', result: 'PASS' },
        };
        expect(matchesFilter(evt, { result: 'PASS' })).toBe(true);
        expect(matchesFilter(evt, { result: 'FAIL' })).toBe(false);
    });
});
