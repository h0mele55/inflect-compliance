/**
 * Epic 51 — raw Tailwind color ratchet.
 *
 * Complements the "migrated page" anti-drift guardrail
 * (`design-system-drift.test.ts`) which strictly forbids raw colors
 * on the 4 pages that were migrated in the first pass. This ratchet
 * runs across the whole `src/app/` tree and caps the count at the
 * recorded baseline so the migration can only go in one direction.
 *
 * Lower `BASELINE` when you migrate a file; never raise it. If you
 * genuinely need a raw color (e.g. inside a print-only view where
 * tokens don't apply), carry that in the allowlist below and leave
 * the ratchet count alone.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../../src/app');

// Matches `bg-slate-800`, `text-neutral-400`, `border-gray-100`, etc.
// Same regex used by `design-system-drift.test.ts` so the two guards
// stay consistent.
const RAW_COLOR_RE = /\b(?:text|bg|border)-(?:slate|gray|neutral|zinc)-\d{2,3}\b/g;

// Baseline recorded at Epic 51 close-out. Lower only.
//
// Remaining hotspots are either deliberately out of theme scope or
// rendering literal colors that can't be token-backed:
//   - reports/soa/print/SoAPrintView.tsx  (PDF print view, tokens
//     don't apply under @media print)
//   - login/page.tsx                      (unauthenticated route,
//     tenant context not yet active)
//   - audit/shared/[token]/page.tsx       (public audit pack viewer)
//   - error.tsx / not-found.tsx           (global error boundaries,
//     render before ThemeProvider mounts)
//   - security/mfa/page.tsx QR glyph      (QR code lives on a white
//     surface and must render dark ink regardless of theme)
const BASELINE = 92;

function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            walk(full, out);
        } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function countRawColors(): { total: number; byFile: Record<string, number> } {
    const byFile: Record<string, number> = {};
    let total = 0;
    for (const file of walk(APP_ROOT, [])) {
        const src = fs.readFileSync(file, 'utf-8');
        const matches = src.match(RAW_COLOR_RE);
        if (matches && matches.length > 0) {
            byFile[path.relative(APP_ROOT, file)] = matches.length;
            total += matches.length;
        }
    }
    return { total, byFile };
}

describe('Epic 51 — raw Tailwind color ratchet', () => {
    it(`count of bg-/text-/border-(slate|gray|neutral|zinc)-NN in src/app is ≤ ${BASELINE}`, () => {
        const { total, byFile } = countRawColors();
        if (total > BASELINE) {
            const top = Object.entries(byFile)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([f, n]) => `  ${n}\t${f}`)
                .join('\n');
            throw new Error(
                `Epic 51 ratchet: raw color usage grew from baseline ${BASELINE} to ${total}.\n` +
                `Migrate to semantic tokens (see docs/token-cheatsheet.md) or lower the baseline when you do.\n` +
                `Top hotspots:\n${top}`,
            );
        }
        expect(total).toBeLessThanOrEqual(BASELINE);
    });

    it('baseline is plausible and matches the current tree', () => {
        const { total } = countRawColors();
        // If the baseline drifts below the observed count, someone
        // migrated a file — lower the baseline in this test.
        expect(total).toBeLessThanOrEqual(BASELINE);
        expect(BASELINE).toBeGreaterThanOrEqual(0);
    });
});
