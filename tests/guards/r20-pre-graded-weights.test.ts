/**
 * R20-PR-E — Graded font-weight ladder ratchet.
 *
 * R20-PR-C landed per-size tracking. R20-PR-E adds per-size
 * font-WEIGHT — the "section header" weight (`font-semibold`) is
 * the typographic confidence the button family was missing. The
 * graded ladder mirrors the tracking ladder:
 *
 *   xs  font-medium    (500)  ← dense UI, quiet
 *   sm  font-medium    (500)  ← dense UI, quiet
 *   md  font-semibold  (600)  ← confident default
 *   lg  font-bold      (700)  ← magazine-bold CTA
 *
 * Why GRADED, not UNIFORM. xs/sm live in filter toolbars and dense
 * action menus; bold xs buttons shout at the user. md is the
 * default size — the section-header weight (600) gives it editorial
 * confidence. lg is the featured CTA — bold is the headline weight,
 * the size where "Create Risk" needs to carry the room.
 *
 * Also locks the disabled-state fallback mirror in `button.tsx`,
 * which doesn't route through the cva variant — same lockstep
 * pattern PR-C established for padding/gap.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const VARIANTS = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button-variants.ts'),
    'utf8',
);
const BUTTON_TSX = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button.tsx'),
    'utf8',
);

function sizeBlock(): string {
    return VARIANTS.match(/size:\s*\{([\s\S]*?)\},?\s*\}/)?.[1] ?? '';
}
function sizeClasses(size: 'xs' | 'sm' | 'md' | 'lg'): string {
    const re = new RegExp(`${size}:\\s*["']([^"']+)["']`);
    return sizeBlock().match(re)?.[1] ?? '';
}

describe('R20-PR-E — Graded font-weight ladder', () => {
    describe('the cva BASE no longer pins a flat font-weight', () => {
        it('font-medium is gone from the cva base — weight lives per-size now', () => {
            const base =
                VARIANTS.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
            // Strip comments so the "R20-PR-E" doc reference doesn't
            // count as a violation.
            const stripped = base
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/font-medium\b/);
            expect(stripped).not.toMatch(/font-semibold\b/);
            expect(stripped).not.toMatch(/font-bold\b/);
        });
    });

    describe('per-size weight ladder', () => {
        it('xs is font-medium — dense UI, quiet', () => {
            expect(sizeClasses('xs')).toMatch(/\bfont-medium\b/);
        });

        it('sm is font-medium — dense UI, quiet', () => {
            expect(sizeClasses('sm')).toMatch(/\bfont-medium\b/);
        });

        it('md is font-semibold — the confident default ("section-header" weight)', () => {
            expect(sizeClasses('md')).toMatch(/\bfont-semibold\b/);
        });

        it('lg is font-bold — the featured-CTA headline weight', () => {
            expect(sizeClasses('lg')).toMatch(/\bfont-bold\b/);
        });

        it('the ladder is graded (different weights at different sizes)', () => {
            // A future PR that "simplifies" to uniform weight would
            // strip the grade. This assertion fires first.
            const weights = new Set(
                (['xs', 'sm', 'md', 'lg'] as const).map((s) => {
                    const m = sizeClasses(s).match(/\bfont-(medium|semibold|bold)\b/);
                    return m?.[1] ?? '';
                }),
            );
            // Three distinct values: medium (xs/sm), semibold (md), bold (lg).
            expect(weights.size).toBeGreaterThanOrEqual(3);
        });
    });

    describe('disabled-state fallback mirror in button.tsx', () => {
        // The loading + disabled fallback paths render a <button>
        // styled via hand-rolled classes (not the cva variant). The
        // weight ladder mirrors must match exactly — otherwise a
        // button changes weight when disabled.
        it('disabled-fallback xs/sm carry font-medium', () => {
            expect(BUTTON_TSX).toMatch(/size === "xs" && "[^"]*font-medium\b/);
            expect(BUTTON_TSX).toMatch(/size === "sm" && "[^"]*font-medium\b/);
        });
        it('disabled-fallback md (no size) carries font-semibold', () => {
            expect(BUTTON_TSX).toMatch(/!size && "[^"]*font-semibold\b/);
        });
        it('disabled-fallback lg carries font-bold', () => {
            expect(BUTTON_TSX).toMatch(/size === "lg" && "[^"]*font-bold\b/);
        });
    });
});
