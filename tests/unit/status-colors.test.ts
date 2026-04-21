/**
 * Epic 53 — status color standardisation contract.
 *
 * Pins the cross-entity status tone map. Every status value from the
 * migrated filter-defs must resolve to a non-neutral tone (unless the
 * status is genuinely neutral), and the class strings returned must
 * use the semantic token names so light/dark re-theming keeps
 * working.
 */

import {
    statusColors,
    statusChipClass,
    STATUS_TONE,
    type StatusTone,
} from '@/lib/filters/status-colors';

describe('STATUS_TONE map', () => {
    it('every tone is a known StatusTone', () => {
        const valid: StatusTone[] = [
            'success',
            'info',
            'attention',
            'warning',
            'error',
            'neutral',
        ];
        for (const [status, tone] of Object.entries(STATUS_TONE)) {
            expect(valid).toContain(tone);
            expect(status).toBe(status.toUpperCase());
        }
    });

    it.each([
        ['IMPLEMENTED', 'success'],
        ['APPROVED', 'success'],
        ['DONE', 'success'],
        ['RESOLVED', 'success'],
        ['IN_PROGRESS', 'info'],
        ['MITIGATING', 'info'],
        ['SUBMITTED', 'info'],
        ['OPEN', 'attention'],
        ['DRAFT', 'attention'],
        ['NOT_STARTED', 'attention'],
        ['OVERDUE', 'warning'],
        ['NEEDS_REVIEW', 'warning'],
        ['BLOCKED', 'error'],
        ['REJECTED', 'error'],
        ['EXPIRED', 'error'],
        ['CLOSED', 'neutral'],
        ['ARCHIVED', 'neutral'],
        ['NOT_APPLICABLE', 'neutral'],
    ] as const)('%s → %s tone', (status, tone) => {
        expect(STATUS_TONE[status]).toBe(tone);
    });
});

describe('statusColors()', () => {
    it('returns the right token classes for a known status', () => {
        const { tone, bg, text, border } = statusColors('IMPLEMENTED');
        expect(tone).toBe('success');
        expect(bg).toBe('bg-bg-success');
        expect(text).toBe('text-content-success');
        expect(border).toBe('border-border-success');
    });

    it('falls back to neutral for unknown status', () => {
        const { tone, bg, text } = statusColors('TOTALLY_NEW_STATUS');
        expect(tone).toBe('neutral');
        expect(bg).toBe('bg-bg-subtle');
        expect(text).toBe('text-content-muted');
    });

    it.each([null, undefined, ''])('treats %p as neutral', (input) => {
        const { tone } = statusColors(input as string | null | undefined);
        expect(tone).toBe('neutral');
    });

    it('only uses semantic token classes (no raw slate/emerald/red)', () => {
        // Every class returned must reference the token namespace so the
        // light theme automatically re-colors it.
        const SEMANTIC_RE = /^(bg|text|border)-(bg|content|border|brand)-/;
        for (const status of Object.keys(STATUS_TONE)) {
            const { bg, text, border } = statusColors(status);
            for (const cls of [bg, text, border]) {
                expect(cls).toMatch(SEMANTIC_RE);
            }
        }
    });
});

describe('statusChipClass()', () => {
    it('composes bg + text into a single string', () => {
        expect(statusChipClass('APPROVED')).toBe(
            'bg-bg-success text-content-success',
        );
    });

    it('falls back to the neutral chip for unknown status', () => {
        expect(statusChipClass('NEW_ENUM')).toBe(
            'bg-bg-subtle text-content-muted',
        );
    });
});
