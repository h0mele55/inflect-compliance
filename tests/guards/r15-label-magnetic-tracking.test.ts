/**
 * Roadmap-15 PR-8 — Magnetic letter spacing on hover.
 *
 * The R12/R13 row hovers brighten the label's text colour
 * (`text-content-emphasis`) and the band reveals at the left
 * edge. The label's TYPOGRAPHY stays untouched — same tracking,
 * same weight, same kerning at every state.
 *
 * R15-PR8 adds a third typographic dimension to the hover state:
 * the label's `letter-spacing` opens from `tracking-normal` (0em)
 * to `tracking-wide` (0.025em) over 200ms ease-out. The eye reads
 * the letters subtly "leaning toward" the cursor — magnetic
 * attraction in the language of typography.
 *
 * Why 0.025em (the `tracking-wide` token)?
 *
 *   - Smaller (0.01em / `tracking-tight`) is invisible at small
 *     text sizes — the change has to be perceptible or it's not
 *     worth the animation cost.
 *   - Larger (0.05em / `tracking-wider`) opens the letters TOO
 *     far for body-size dense-nav text; the label starts to read
 *     as "spread" rather than "elegant".
 *   - 0.025em is the sweet spot — the same tracking premium UI
 *     designs reach for when they want letters to feel "breathing"
 *     in a focused state.
 *
 * Geometry safety:
 *
 *   - The label sits inside a `truncate` parent. The 0.025em
 *     opening adds ~3px of width to a typical 100px label. The
 *     `truncate` semantics still hold — the label still fits in
 *     the same row width bucket and still ellipsis-truncates on
 *     overflow.
 *   - No transform, no scale, no translate — the motion language
 *     contract is preserved. `letter-spacing` is a pure typographic
 *     property; it doesn't trigger compositor work.
 *
 * Mechanism:
 *
 *   - NAV_ITEM_BASE adds the Tailwind `group` class to the row's
 *     `<Link>` so child elements can react to hover-on-parent.
 *   - The label `<span>` carries `tracking-normal` (rest) +
 *     `group-hover:tracking-wide` (engaged) +
 *     `transition-[letter-spacing] duration-200 ease-out`.
 *   - 200ms tempo matches the R12-PR5 band reveal — the letters
 *     and the band breathe together at the same cadence.
 *
 * What this ratchet does NOT police:
 *
 *   - The exact tracking value (0.025em / `tracking-wide`). A
 *     future tune to 0.02em or 0.03em is fine within "subtle
 *     opening, not a spread".
 *   - The transition duration (200ms). 150–250ms reads as the
 *     same intent.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NAV_ITEM_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/nav-item.tsx'),
    'utf8',
);

describe('Roadmap-15 PR-8 — magnetic letter spacing', () => {
    describe('NAV_ITEM_BASE — `group` class for child hover targeting', () => {
        it('includes the Tailwind `group` utility', () => {
            // Without `group`, the child `<span>` can't see hover
            // events on the parent `<Link>`. `group-hover:` requires
            // the parent to have the `group` class.
            const baseRegion = NAV_ITEM_SRC.match(
                /export\s+const\s+NAV_ITEM_BASE\s*=\s*\[[\s\S]+?\]\.join\(/,
            );
            expect(baseRegion).not.toBeNull();
            // Match `group` as a whole-word class (not as part of
            // a longer token like `group-hover` or `group/foo`).
            expect(baseRegion![0]).toMatch(/['"]([^'"]*\s)?group(\s|['"])/);
        });
    });

    describe('label span — tracking + transition wiring', () => {
        it('label span sets `tracking-normal` as the rest state', () => {
            // The rest tracking MUST be declared explicitly. Default
            // browser tracking depends on font + rendering engine;
            // pinning `tracking-normal` ensures the rest baseline
            // is identical across environments. Without an explicit
            // rest value, the hover-state transition can have a
            // hard jump.
            expect(NAV_ITEM_SRC).toMatch(
                /<span\s+className="[^"]*\btracking-normal\b[^"]*"[^>]*>\s*\{label\}/,
            );
        });

        it('label span engages `tracking-wide` on parent hover', () => {
            // `group-hover:tracking-wide` opens letter-spacing to
            // 0.025em when the row's `<Link>` is hovered. The
            // group-hover variant requires the parent to have the
            // `group` class — locked separately above.
            expect(NAV_ITEM_SRC).toMatch(
                /<span\s+className="[^"]*\bgroup-hover:tracking-wide\b[^"]*"[^>]*>\s*\{label\}/,
            );
        });

        it('label span transitions letter-spacing at 200ms ease-out', () => {
            // The transition property list MUST name `letter-spacing`
            // explicitly. `transition-all` would also work but
            // breaks the codebase rule of "name the property".
            // 200ms matches the R12-PR5 band reveal tempo so the
            // label opens at the same cadence as the band.
            // No trailing `\b` after `\]` — the closing bracket
            // is non-word and the next char is a space (also
            // non-word), so `\b` fails between two non-word chars.
            // The bracketed token is unambiguous on its own.
            expect(NAV_ITEM_SRC).toMatch(
                /<span\s+className="[^"]*\btransition-\[letter-spacing\][^"]*"[^>]*>\s*\{label\}/,
            );
            expect(NAV_ITEM_SRC).toMatch(
                /<span\s+className="[^"]*\bduration-200\b[^"]*\bease-out\b[^"]*"[^>]*>\s*\{label\}/,
            );
        });

        it('label span keeps `truncate` (geometry safety)', () => {
            // The 0.025em opening adds ~3px to a typical 100px
            // label. `truncate` still handles overflow correctly.
            // A regression that drops `truncate` would let long
            // labels overflow the row.
            expect(NAV_ITEM_SRC).toMatch(
                /<span\s+className="[^"]*\btruncate\b[^"]*"[^>]*>\s*\{label\}/,
            );
        });
    });

    describe('motion language safety', () => {
        it('label span uses NO transform / scale / translate', () => {
            // `letter-spacing` is a pure typographic property; it
            // doesn't trigger compositor work. A regression that
            // adds `group-hover:scale-105` to the label would
            // re-layout the row on every hover and violate the
            // motion-language contract.
            const spanMatch = NAV_ITEM_SRC.match(
                /<span\s+className="([^"]+)"[^>]*>\s*\{label\}/,
            );
            expect(spanMatch).not.toBeNull();
            const classes = spanMatch![1];
            expect(classes).not.toMatch(/group-hover:scale-/);
            expect(classes).not.toMatch(/group-hover:translate-/);
            expect(classes).not.toMatch(/group-hover:-translate-/);
            expect(classes).not.toMatch(/hover:scale-/);
            expect(classes).not.toMatch(/hover:translate-/);
        });
    });
});
