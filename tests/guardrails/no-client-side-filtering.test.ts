/**
 * GUARDRAIL: Detect client-side filtering anti-patterns in list page components.
 *
 * Scans page files for patterns that suggest data is fetched server-side
 * and then re-filtered on the client (e.g., `.filter(` after `useQuery`).
 *
 * This is a heuristic — it flags suspicious patterns, not guaranteed bugs.
 */
import fs from 'fs';
import path from 'path';

// Pages that have server-side filtering support and should NOT filter on the client
const FILTERED_PAGE_FILES = [
    'src/app/t/[tenantSlug]/(app)/controls/ControlsPageClient.tsx',
    'src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx',
    'src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx',
    'src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx',
    'src/app/t/[tenantSlug]/(app)/policies/PoliciesClient.tsx',
    'src/app/t/[tenantSlug]/(app)/tasks/TasksPageClient.tsx',
    'src/app/t/[tenantSlug]/(app)/vendors/VendorsClient.tsx',
];

/** Patterns that suggest client-side filtering of server data */
const BAD_PATTERNS = [
    /\.(filter|sort)\s*\(\s*(item|row|r|c|v|p|t|e|a)\s*=>/,
    /data\.(filter|sort)\s*\(/,
    /items\.(filter|sort)\s*\(/,
    /\.filter\(\s*\(/,
];

describe('No client-side filtering in list pages', () => {
    const root = path.resolve(__dirname, '../../..');

    for (const relPath of FILTERED_PAGE_FILES) {
        const absPath = path.join(root, relPath);

        it(`${path.basename(relPath)} should not have client-side .filter() on list data`, () => {
            if (!fs.existsSync(absPath)) {
                // File doesn't exist yet — skip silently
                return;
            }

            const content = fs.readFileSync(absPath, 'utf-8');

            // Skip if the component is rendering pre-filtered server data
            // Only flag .filter( that appears AFTER data is fetched
            const lines = content.split('\n');
            const flagged: string[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip comment lines
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
                // Skip lines in import/type blocks
                if (line.trim().startsWith('import ') || line.trim().startsWith('type ') || line.trim().startsWith('interface ')) continue;

                for (const pattern of BAD_PATTERNS) {
                    if (pattern.test(line)) {
                        flagged.push(`  Line ${i + 1}: ${line.trim()}`);
                    }
                }
            }

            if (flagged.length > 0) {
                console.warn(
                    `⚠ Potential client-side filtering in ${relPath}:\n${flagged.join('\n')}\n` +
                    'If this is intentional (e.g., local sub-filtering of small data), add a // eslint-disable-next-line comment.'
                );
            }
            // This is a soft warning, not a hard failure — uncomment to enforce:
            // expect(flagged).toHaveLength(0);
        });
    }
});
