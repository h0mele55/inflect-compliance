/**
 * Unit Test: Automation event catalogue.
 *
 * The catalogue is the producer-side contract — typos in stored rules
 * become silent non-firings, so this file prevents accidental catalogue
 * drift (duplicates, empty strings, key ≠ value).
 */
import {
    AUTOMATION_EVENTS,
    AUTOMATION_EVENT_NAMES,
    isKnownAutomationEvent,
} from '@/app-layer/automation/events';

describe('Automation Events — catalogue integrity', () => {
    it('every key equals its value (prevents accidental divergence)', () => {
        for (const [key, value] of Object.entries(AUTOMATION_EVENTS)) {
            expect(value).toBe(key);
        }
    });

    it('has no empty or whitespace-only entries', () => {
        for (const value of Object.values(AUTOMATION_EVENTS)) {
            expect(value.trim().length).toBeGreaterThan(0);
        }
    });

    it('contains no duplicate names', () => {
        const values = Object.values(AUTOMATION_EVENTS);
        expect(values.length).toBe(new Set(values).size);
    });

    it('AUTOMATION_EVENT_NAMES mirrors the object values', () => {
        expect([...AUTOMATION_EVENT_NAMES].sort()).toEqual(
            Object.values(AUTOMATION_EVENTS).sort()
        );
    });

    describe('isKnownAutomationEvent', () => {
        it('returns true for every catalogue entry', () => {
            for (const v of Object.values(AUTOMATION_EVENTS)) {
                expect(isKnownAutomationEvent(v)).toBe(true);
            }
        });

        it('returns false for an unknown string', () => {
            expect(isKnownAutomationEvent('SOMETHING_MADE_UP')).toBe(false);
            expect(isKnownAutomationEvent('')).toBe(false);
            expect(isKnownAutomationEvent('risk_created')).toBe(false); // case-sensitive
        });
    });
});
