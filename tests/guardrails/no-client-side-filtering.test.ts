/**
 * GUARDRAIL: Detect client-side filtering & stacked filter anti-patterns.
 *
 * 1) Scans list page files for patterns that suggest data is fetched server-side
 *    and then re-filtered on the client (e.g., `.filter(` after `useQuery`).
 *
 * 2) Detects stacked full-width <select> or <input> elements in filter areas,
 *    which indicates someone reverted to the old filter pattern instead of
 *    using CompactFilterBar.
 *
 * This is a heuristic — it flags suspicious patterns, not guaranteed bugs.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');

// Pages that have server-side filtering and should use CompactFilterBar
const LIST_PAGE_FILES = [
    'src/app/t/[tenantSlug]/(app)/controls/page.tsx',
    'src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx',
    'src/app/t/[tenantSlug]/(app)/assets/page.tsx',
    'src/app/t/[tenantSlug]/(app)/risks/page.tsx',
    'src/app/t/[tenantSlug]/(app)/policies/page.tsx',
    'src/app/t/[tenantSlug]/(app)/tasks/page.tsx',
    'src/app/t/[tenantSlug]/(app)/vendors/page.tsx',
];

/** Patterns that suggest client-side filtering of server data */
const CLIENT_FILTER_PATTERNS = [
    /\.(filter|sort)\s*\(\s*(item|row|r|c|v|p|t|e|a)\s*=>/,
    /data\.(filter|sort)\s*\(/,
    /items\.(filter|sort)\s*\(/,
    /\.filter\(\s*\(/,
];

/** Patterns that indicate stacked/legacy filter UI (NOT CompactFilterBar) */
const STACKED_FILTER_PATTERNS = [
    // Multiple native <select> elements with "input" class in filter sections
    /<select\s+className="input\s+w-/,
    // Full-width search input with onChange={...setFilter} (old per-keystroke pattern)
    /onChange=\{e\s*=>\s*setFilter\('q'/,
];

function readFile(relPath: string): string | null {
    const absPath = path.join(root, relPath);
    if (!fs.existsSync(absPath)) return null;
    return fs.readFileSync(absPath, 'utf-8');
}

function scanForPatterns(content: string, patterns: RegExp[]): string[] {
    const lines = content.split('\n');
    const flagged: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        // Skip imports/types
        if (line.trim().startsWith('import ') || line.trim().startsWith('type ') || line.trim().startsWith('interface ')) continue;

        for (const pattern of patterns) {
            if (pattern.test(line)) {
                flagged.push(`  Line ${i + 1}: ${line.trim()}`);
            }
        }
    }
    return flagged;
}

describe('Guardrail: No client-side filtering in list pages', () => {
    for (const relPath of LIST_PAGE_FILES) {
        it(`${path.basename(relPath, '.tsx')} should not .filter() server data on client`, () => {
            const content = readFile(relPath);
            if (!content) return; // File doesn't exist yet — skip

            const flagged = scanForPatterns(content, CLIENT_FILTER_PATTERNS);

            if (flagged.length > 0) {
                fail(
                    `Client-side filtering detected in ${relPath}:\n${flagged.join('\n')}\n` +
                    'All filtering must be server-side via URL params. ' +
                    'If this is intentional local sub-filtering of a small array, ' +
                    'add a // guardrail-ignore comment above the line.'
                );
            }
        });
    }
});

describe('Guardrail: No stacked/legacy filter UI', () => {
    for (const relPath of LIST_PAGE_FILES) {
        it(`${path.basename(relPath, '.tsx')} should use CompactFilterBar, not stacked selects`, () => {
            const content = readFile(relPath);
            if (!content) return;

            const flagged = scanForPatterns(content, STACKED_FILTER_PATTERNS);

            if (flagged.length > 0) {
                fail(
                    `Legacy stacked filter UI detected in ${relPath}:\n${flagged.join('\n')}\n` +
                    'Use <CompactFilterBar config={...} /> instead of inline <select>/<input> elements. ' +
                    'See docs/filters.md for the standard pattern.'
                );
            }
        });
    }
});

describe('Guardrail: All list pages import CompactFilterBar', () => {
    for (const relPath of LIST_PAGE_FILES) {
        it(`${path.basename(relPath, '.tsx')} should import CompactFilterBar`, () => {
            const content = readFile(relPath);
            if (!content) return;

            expect(content).toContain('CompactFilterBar');
        });
    }
});
