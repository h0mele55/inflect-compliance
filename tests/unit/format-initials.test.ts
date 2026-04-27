/**
 * `formatInitials` — avatar monogram derivation contract.
 *
 * Locks the algorithm so a future "make it smarter" refactor
 * doesn't quietly shift the org-switcher pill output. The function
 * is intentionally small; the predictability is the feature.
 */
import { formatInitials } from '@/lib/format-initials';

describe('formatInitials', () => {
    // ── Multi-word names — first character of each of the first two words ──

    it('takes the first letter of each of the first two words for multi-word names', () => {
        expect(formatInitials('Acme Corp')).toBe('AC');
        expect(formatInitials('GitHub Inc.')).toBe('GI');
        expect(formatInitials('Roundabout Diagnostics')).toBe('RD');
    });

    it('caps multi-word names at the first two words (extra words ignored)', () => {
        expect(formatInitials('Three Word Org')).toBe('TW');
        expect(formatInitials('Five Word Long Organization Name')).toBe('FW');
    });

    // ── Single-word names — first two characters ──

    it('takes the first two characters of a single-word name', () => {
        expect(formatInitials('Acme')).toBe('AC');
        expect(formatInitials('lowercase')).toBe('LO');
    });

    it('returns the only character when the single-word name has length 1', () => {
        expect(formatInitials('A')).toBe('A');
        expect(formatInitials('z')).toBe('Z');
    });

    // ── Whitespace handling ──

    it('trims leading + trailing whitespace', () => {
        expect(formatInitials('  Acme Corp  ')).toBe('AC');
        expect(formatInitials('\tAcme\n')).toBe('AC');
    });

    it('collapses internal whitespace runs (multi-space / tab / newline)', () => {
        expect(formatInitials('Acme   Corp')).toBe('AC');
        expect(formatInitials('Acme\tCorp')).toBe('AC');
        expect(formatInitials('Acme\nCorp')).toBe('AC');
    });

    // ── Casing ──

    it('uppercases the result regardless of input casing', () => {
        expect(formatInitials('acme corp')).toBe('AC');
        expect(formatInitials('aCMe CoRP')).toBe('AC');
        expect(formatInitials('ACME CORP')).toBe('AC');
    });

    // ── Empty / nullish ──

    it('returns "" for empty / whitespace-only / nullish inputs', () => {
        expect(formatInitials('')).toBe('');
        expect(formatInitials('   ')).toBe('');
        expect(formatInitials('\t\n')).toBe('');
        expect(formatInitials(null)).toBe('');
        expect(formatInitials(undefined)).toBe('');
    });

    // ── Numbers + punctuation ──

    it('preserves numbers and punctuation at their position', () => {
        expect(formatInitials('1Password Inc.')).toBe('1I');
        expect(formatInitials("O'Brien Co")).toBe('OC');
        // First two characters of a single-word name including a digit.
        expect(formatInitials('3M')).toBe('3M');
    });

    // ── Multi-codepoint / emoji ──

    it('treats a multi-codepoint emoji as a single initial via Array.from iteration', () => {
        // The emoji 🚀 is a single Unicode code point (U+1F680) but a
        // surrogate pair in UTF-16 — naive `.charAt(0)` returns half of it.
        // Array.from iteration yields the whole emoji as one entry.
        const result = formatInitials('🚀 Mission');
        // The emoji can't be uppercased; toUpperCase() on it is a no-op.
        // The point is it doesn't render as a broken half-surrogate.
        expect(result).toContain('M'); // second word's initial
        // The first char is the emoji as a whole code point.
        expect(Array.from(result)).toHaveLength(2);
    });
});
