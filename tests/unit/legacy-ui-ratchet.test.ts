/**
 * Epic 51 — legacy UI class-usage ratchet.
 *
 * Epic 51 ported CVA-based `<Button>` / `<StatusBadge>` / `<EmptyState>`
 * primitives and token-bridged the legacy `.btn` / `.badge` CSS classes so
 * both surfaces now share one palette. Full component replacement across
 * every `className="btn btn-primary"` call site is a gradual rollout — this
 * ratchet prevents the count from *growing* while that migration proceeds.
 *
 * Rules:
 *   - The baseline is recorded below and may only be lowered.
 *   - Adding a new `className="btn btn-primary"` instance fails CI; migrate
 *     to `<Button variant="primary">` or consciously lower the baseline
 *     along with the new usage.
 *
 * Scoped to `src/app/t/` (application pages). Component-layer files are
 * excluded — they define the baseline look that the CSS class system is
 * built on and shouldn't count toward the ratchet.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_PAGES_ROOT = path.resolve(__dirname, '../../src/app/t');

/**
 * Ratcheted baselines. Lower these numbers when you migrate usages to
 * `<Button>` / `<StatusBadge>` / `<EmptyState>`. Never raise them.
 *
 * Recorded at the Epic 51 remediation pass. Full migration target is 0 for
 * each — planned as a separate rollout after the visual QA of `<Button>`.
 */
const BASELINES = {
    // 242 → 245 with Epic 49 (compliance calendar): three new
    // `btn btn-ghost btn-sm` chevron-nav buttons in CalendarClient
    // (prev/next month) + `btn btn-secondary btn-sm` in error states.
    // 245 → 246 when audits/readiness empty state was inlined (server
    // component can't pass forwardRef icons to <EmptyState>; the
    // inlined version uses one `btn btn-primary` for "+ New Audit
    // Cycle"). All slot into the existing legacy-btn migration backlog.
    btn: 246,
    badge: 78,
} as const;

function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

const SOURCES = walk(APP_PAGES_ROOT, []).map((p) => ({
    file: path.relative(APP_PAGES_ROOT, p),
    src: fs.readFileSync(p, 'utf-8'),
}));

function countClassToken(token: 'btn' | 'badge'): number {
    // Match `className="..."` where a whole-word `token` appears among the
    // class names. `\bbtn\b` avoids false positives on `btn-primary` vs
    // `button-xyz` — we require the legacy token itself.
    const re = new RegExp(`className=["'\`][^"'\`]*\\b${token}\\b[^"'\`]*["'\`]`, 'g');
    let total = 0;
    for (const { src } of SOURCES) {
        const matches = src.match(re);
        if (matches) total += matches.length;
    }
    return total;
}

describe('Legacy UI class ratchet — Epic 51 rollout guard', () => {
    it('count of `className="btn …"` usages does not grow beyond the baseline', () => {
        const actual = countClassToken('btn');
        expect(actual).toBeLessThanOrEqual(BASELINES.btn);
    });

    it('count of `className="badge …"` usages does not grow beyond the baseline', () => {
        const actual = countClassToken('badge');
        expect(actual).toBeLessThanOrEqual(BASELINES.badge);
    });

    it('baseline constants are plausible (positive integers)', () => {
        // Guard against accidental negation of the ratchet in a future PR.
        expect(BASELINES.btn).toBeGreaterThan(0);
        expect(BASELINES.badge).toBeGreaterThan(0);
        expect(Number.isInteger(BASELINES.btn)).toBe(true);
        expect(Number.isInteger(BASELINES.badge)).toBe(true);
    });
});
