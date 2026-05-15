/**
 * R20-PR-C — Airy density + typography ratchet.
 *
 * PR-A laid the language; PR-B applied liquid edges. PR-C is the
 * typographic-rhythm round. Three felt characteristics of
 * "expensive type" land in lockstep:
 *
 *   1. Padding scale revision — md/lg gain horizontal breathing
 *      room. xs/sm stay compact by intent (small buttons want
 *      density, large buttons want air).
 *
 *   2. Per-size tracking — the R19-PR-C flat `tracking-[-0.01em]`
 *      baseline is replaced by a size-conditional scale: xs/sm
 *      open up positive (small text wants OPEN tracking to stay
 *      legible — classic small-caps confidence), md tightens
 *      slightly, lg holds the deepest negative the R19 design
 *      intended (-0.01em headline tracking).
 *
 *   3. Gap rhythm — lg's icon↔label gap widens from 8px to 10px
 *      so the airy-padded lg button doesn't look icon-cramped.
 *
 * Plus form-control parity: `<Label>` carries the same md-tracking
 * as buttons so a focused input + its label share typographic
 * rhythm — the "expensive type" effect lands on the whole form row,
 * not just the buttons.
 *
 * Heights are LOCKED out of this PR. The R20-PR-A ratchet asserts
 * controlSize + button size scales agree at xs/sm/md/lg = h-7/h-8/
 * h-9/h-10, so any size-shift here would have to be paired with a
 * matching control-variants.ts shift — exactly the over-reach this
 * ratchet exists to prevent.
 *
 * Also locks the disabled-state mirror in `button.tsx` — the
 * loading + disabled fallback paths don't route through the cva
 * variant, so their sizes must move in lockstep with
 * button-variants.ts. Drift would manifest as a button that
 * changed dimensions on disable.
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
const LABEL_TSX = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/label.tsx'),
    'utf8',
);

/** Slice the size: { ... } object from the cva config. */
function sizeBlock(): string {
    return VARIANTS.match(/size:\s*\{([\s\S]*?)\},?\s*\}/)?.[1] ?? '';
}

/**
 * Pull the class string assigned to one size key. Tolerates either
 * `xs: "..."` or `xs: ["...", "..."]` shape, though today the
 * sizes are plain strings.
 */
function sizeClasses(size: 'xs' | 'sm' | 'md' | 'lg'): string {
    const re = new RegExp(`${size}:\\s*["']([^"']+)["']`);
    return sizeBlock().match(re)?.[1] ?? '';
}

describe('R20-PR-C — Airy density + typography', () => {
    describe('padding scale — md/lg gain air, xs/sm stay compact', () => {
        it('md horizontal padding is `px-4` (up from R19 `px-3.5`)', () => {
            expect(sizeClasses('md')).toMatch(/\bpx-4\b/);
            expect(sizeClasses('md')).not.toMatch(/\bpx-3\.5\b/);
        });

        it('lg horizontal padding is `px-6` (up from R19 `px-5`)', () => {
            expect(sizeClasses('lg')).toMatch(/\bpx-6\b/);
            expect(sizeClasses('lg')).not.toMatch(/\bpx-5\b/);
        });

        it('xs stays at `px-2.5` — small buttons want density', () => {
            expect(sizeClasses('xs')).toMatch(/\bpx-2\.5\b/);
        });

        it('sm stays at `px-3` — small buttons want density', () => {
            expect(sizeClasses('sm')).toMatch(/\bpx-3\b/);
            expect(sizeClasses('sm')).not.toMatch(/\bpx-3\.5\b/);
        });
    });

    describe('heights stay — the input-parity lockstep from PR-A holds', () => {
        const expected: Record<string, string> = {
            xs: 'h-7',
            sm: 'h-8',
            md: 'h-9',
            lg: 'h-10',
        };
        for (const [size, height] of Object.entries(expected)) {
            it(`${size} height stays at ${height}`, () => {
                expect(sizeClasses(size as 'xs' | 'sm' | 'md' | 'lg')).toMatch(
                    new RegExp(`\\b${height}\\b`),
                );
            });
        }
    });

    describe('per-size tracking — replaces the R19 flat baseline', () => {
        // The R19-PR-C flat tracking on the cva BASE is gone — PR-C
        // pushes tracking to per-size so small text opens up and
        // large text confidently tightens.
        it('the cva base no longer carries flat tracking', () => {
            const base =
                VARIANTS.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
            expect(base).not.toMatch(/tracking-\[-0\.01em\]/);
        });

        it('xs opens up to +0.005em — tiny labels breathe', () => {
            expect(sizeClasses('xs')).toMatch(/tracking-\[0\.005em\]/);
        });

        it('sm opens up to +0.01em — confident small-caps feel', () => {
            expect(sizeClasses('sm')).toMatch(/tracking-\[0\.01em\]/);
        });

        it('md tightens to -0.005em — subtle default-size confidence', () => {
            expect(sizeClasses('md')).toMatch(/tracking-\[-0\.005em\]/);
        });

        it('lg holds the deepest tightening at -0.01em — headline rhythm', () => {
            expect(sizeClasses('lg')).toMatch(/tracking-\[-0\.01em\]/);
        });
    });

    describe('gap rhythm — lg gets +2px breath', () => {
        it('lg gap is `gap-2.5` (up from R19 `gap-tight`)', () => {
            expect(sizeClasses('lg')).toMatch(/\bgap-2\.5\b/);
        });

        it('md gap stays at `gap-tight` (8px is right for default)', () => {
            expect(sizeClasses('md')).toMatch(/\bgap-tight\b/);
        });

        it('xs/sm gaps stay at gap-1 / gap-1.5 — compact by intent', () => {
            expect(sizeClasses('xs')).toMatch(/\bgap-1\b/);
            expect(sizeClasses('sm')).toMatch(/\bgap-1\.5\b/);
        });
    });

    describe('disabled-state mirror in button.tsx moves in lockstep', () => {
        // The loading + disabled fallback paths render a <button>
        // styled via hand-rolled classes (not the cva variant) so
        // they don't pick up the variant-level changes for free.
        // The size mirrors must match the cva scale exactly.
        it('disabled-fallback md (no size) uses `px-4`', () => {
            expect(BUTTON_TSX).toMatch(/!size && "h-9 px-4 gap-tight"/);
        });
        it('disabled-fallback lg uses `px-6` + `gap-2.5`', () => {
            expect(BUTTON_TSX).toMatch(
                /size === "lg" && "h-10 px-6 gap-2.5"/,
            );
        });
        it('disabledTooltip md (no size) uses `px-4`', () => {
            expect(BUTTON_TSX).toMatch(/!size && "h-9 px-4"/);
        });
        it('disabledTooltip lg uses `px-6`', () => {
            expect(BUTTON_TSX).toMatch(/size === "lg" && "h-10 px-6"/);
        });
    });

    describe('form-control typographic parity — <Label> rhymes with button-md', () => {
        it('<Label> carries the same `tracking-[-0.005em]` as button md', () => {
            expect(LABEL_TSX).toMatch(/tracking-\[-0\.005em\]/);
        });
    });
});
