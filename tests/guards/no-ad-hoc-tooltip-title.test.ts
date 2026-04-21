/**
 * Epic 56 — ad-hoc `title=` ratchet.
 *
 * The `<Tooltip>` primitive (`src/components/ui/tooltip.tsx`) is the
 * canonical way to surface a hover/focus hint on an interactive element
 * in Inflect Compliance. The native HTML `title=` attribute is kept for
 * three specific escape valves only — documented in
 * `docs/tooltip-and-copy-strategy.md`:
 *
 *   1. Truncation fallbacks on `max-w-* truncate` spans.
 *   2. High-density visualisations (heatmaps, progress bars, calendar
 *      cells, permission matrix) — tens to hundreds of elements where
 *      portalising a Radix Tooltip per cell is the wrong cost.
 *   3. Row-select checkboxes with an existing `aria-label`.
 *
 * Everywhere else, `title=` on an HTML element is a regression. This
 * ratchet caps the count of genuine HTML `title=` usages inside
 * `src/app/` so migrations can only go DOWN.
 *
 * React-prop `title=` on components (`<Modal title=…>`, `<Sheet.Header>`,
 * `<Card>`, `<FieldGroup>`, `<NavSection>`, `<TableEmptyState>`,
 * `<Tooltip>`, `<InfoTooltip>`, …) is a semantic prop and ignored.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../../src/app');

// Recorded at Epic 56 close-out. Lower this when you migrate a
// `title=` on an HTML element to `<Tooltip>`. Never raise it.
//
// Known allowlisted escape valves (documented in
// docs/tooltip-and-copy-strategy.md):
//   - controls/[controlId]/page.tsx        syncError truncation fallback
//   - reports/soa/SoAClient.tsx            justification truncation fallback
//   - risks/dashboard/page.tsx             heatmap matrix cell (density)
const BASELINE_HTML_TITLE_ATTRS = 3;

function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            walk(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Scan a file for `title=` that sits inside a lower-case HTML element
 * (`span`, `div`, `button`, `a`, `p`, `input`, `code`, `label`, `li`,
 * `td`, …). A React-prop `title=` on a component starts with a capital
 * letter or contains a dot (`Modal`, `Sheet.Header`, `Modal.Header`).
 *
 * The rule: walk backwards from each `title=` position and find the
 * nearest `<Name` opening. If `Name` starts lowercase and contains no
 * dot, count it.
 */
function countHtmlTitleAttrs(src: string, file: string): Array<{ line: number; tag: string }> {
    const findings: Array<{ line: number; tag: string }> = [];
    const re = /\btitle\s*=\s*(["'{])/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(src)) !== null) {
        const pos = match.index;

        // Skip matches inside a block comment or JSDoc — the strategy
        // doc examples use `title=…` inside `/** … */` comments.
        const lineStart = src.lastIndexOf('\n', pos) + 1;
        const lineSoFar = src.slice(lineStart, pos);
        if (lineSoFar.trimStart().startsWith('*')) continue;
        if (lineSoFar.includes('//')) continue;

        // Walk back to find the opening `<Name` for this attribute's tag.
        // Stop on the first unmatched `<` before the position.
        let depth = 0;
        let tagStart = -1;
        for (let i = pos - 1; i >= 0; i--) {
            const ch = src[i];
            if (ch === '>') depth++;
            else if (ch === '<' && src[i + 1] !== '/') {
                if (depth === 0) {
                    tagStart = i + 1;
                    break;
                }
                depth--;
            }
        }
        if (tagStart < 0) continue;

        // Tag name ends at the first space / newline / `>` / `/`.
        const afterLt = src.slice(tagStart, tagStart + 80);
        const nameMatch = afterLt.match(/^([A-Za-z][\w.]*)/);
        if (!nameMatch) continue;
        const tag = nameMatch[1];

        // Skip component tags (uppercase first letter OR contains a dot).
        if (/[A-Z]/.test(tag[0]) || tag.includes('.')) continue;

        // Line number for the report.
        const line = src.slice(0, pos).split('\n').length;
        findings.push({ line, tag });
    }

    return findings;
}

describe('Epic 56 — ad-hoc `title=` ratchet', () => {
    const files = walk(APP_ROOT, []);

    it(`count of HTML \`title=\` attributes in src/app/ is ≤ ${BASELINE_HTML_TITLE_ATTRS}`, () => {
        const perFile: Record<string, Array<{ line: number; tag: string }>> = {};
        let total = 0;
        for (const file of files) {
            const src = fs.readFileSync(file, 'utf-8');
            const hits = countHtmlTitleAttrs(src, file);
            if (hits.length > 0) {
                perFile[path.relative(APP_ROOT, file)] = hits;
                total += hits.length;
            }
        }

        if (total > BASELINE_HTML_TITLE_ATTRS) {
            const rendered = Object.entries(perFile)
                .flatMap(([f, hits]) => hits.map((h) => `  ${f}:${h.line}  (<${h.tag}>)`))
                .join('\n');
            throw new Error(
                `Epic 56 ratchet: HTML \`title=\` count grew from baseline ${BASELINE_HTML_TITLE_ATTRS} to ${total}.\n` +
                `New HTML title attributes must be migrated to <Tooltip> — see docs/tooltip-and-copy-strategy.md.\n` +
                `Current hits:\n${rendered}`,
            );
        }

        expect(total).toBeLessThanOrEqual(BASELINE_HTML_TITLE_ATTRS);
    });

    it('baseline is plausible (positive integer, matches recorded state)', () => {
        expect(BASELINE_HTML_TITLE_ATTRS).toBeGreaterThanOrEqual(0);
        // Close-out reality check — if the baseline drifts below the
        // observed count, lower it and re-run.
        let total = 0;
        for (const file of files) {
            total += countHtmlTitleAttrs(fs.readFileSync(file, 'utf-8'), file).length;
        }
        expect(total).toBeLessThanOrEqual(BASELINE_HTML_TITLE_ATTRS);
    });
});
