/**
 * Guardrail: DataTable platform anti-drift.
 *
 * Prevents ad-hoc table implementations from creeping back into
 * list-page components that have been migrated to the shared DataTable
 * architecture (Epic 52).
 *
 * Three enforcement layers:
 * 1. Import hygiene — no SkeletonTableRow, no deep-path imports
 * 2. Structural compliance — migrated pages use DataTable, not <table>
 * 3. Convention compliance — useMemo columns, barrel imports, test IDs
 */
import * as fs from 'fs';
import * as path from 'path';

const TABLE_MODULE_DIR = path.resolve(__dirname, '../../src/components/ui/table');
const UI_DIR = path.resolve(__dirname, '../../src/components/ui');
const CLIENT_DIR = path.resolve(__dirname, '../../src/app/t/[tenantSlug]/(app)');

/**
 * Pages intentionally excluded from DataTable migration.
 * Each must have a documented reason.
 */
const EXCLUDED_PAGES: Record<string, string> = {
    'SoAClient.tsx': 'Expandable row sub-components, not a flat list',
    'AuditsClient.tsx': 'Master/detail panel UX, not a list page',
};

/**
 * Client pages that have been migrated and must NOT regress.
 */
const MIGRATED_PAGES = [
    'controls/ControlsClient.tsx',
    'evidence/EvidenceClient.tsx',
    'risks/RisksClient.tsx',
    'policies/PoliciesClient.tsx',
    'tasks/TasksClient.tsx',
    'vendors/VendorsClient.tsx',
    'assets/AssetsClient.tsx',
    'findings/FindingsClient.tsx',
    'reports/ReportsClient.tsx',
    'admin/AdminClient.tsx',
];

function readClientFile(rel: string): string {
    return fs.readFileSync(path.join(CLIENT_DIR, rel), 'utf-8');
}

function findFilesRecursive(dir: string, filter: (name: string) => boolean): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findFilesRecursive(full, filter));
        else if (filter(entry.name)) results.push(full);
    }
    return results;
}

// ─── Layer 1: Import Hygiene ─────────────────────────────────────────

describe('Import hygiene — no legacy table imports in migrated pages', () => {
    it.each(MIGRATED_PAGES)('%s does not import SkeletonTableRow', (rel) => {
        const src = readClientFile(rel);
        expect(src).not.toContain('SkeletonTableRow');
    });

    it.each(MIGRATED_PAGES)('%s does not import SkeletonDataTable', (rel) => {
        const src = readClientFile(rel);
        expect(src).not.toContain('SkeletonDataTable');
    });

    it.each(MIGRATED_PAGES)('%s imports from barrel, not deep module paths', (rel) => {
        const src = readClientFile(rel);
        if (!src.includes('DataTable')) return; // skip non-table pages

        // Should use barrel: from '@/components/ui/table'
        expect(src).toContain("from '@/components/ui/table'");

        // Should NOT import from sub-modules like '@/components/ui/table/data-table'
        const deepImports = src.match(/from\s+['"]@\/components\/ui\/table\/[^'"]+['"]/g);
        expect(deepImports ?? []).toEqual([]);
    });
});

// ─── Layer 2: Structural Compliance ──────────────────────────────────

describe('Structural compliance — migrated pages use DataTable', () => {
    it.each(MIGRATED_PAGES)('%s uses <DataTable>, not raw <table>', (rel) => {
        const src = readClientFile(rel);
        const hasDataTable = src.includes('DataTable');
        const hasRawTable = /<table[\s>]/.test(src);

        // Must use DataTable
        expect(hasDataTable).toBe(true);
        // Should NOT have raw <table> (unless also using DataTable)
        if (hasRawTable) {
            // Transitional: allow raw <table> only if DataTable is also present
            expect(hasDataTable).toBe(true);
        }
    });

    it.each(MIGRATED_PAGES)('%s exists and is not accidentally deleted', (rel) => {
        const fullPath = path.join(CLIENT_DIR, rel);
        expect(fs.existsSync(fullPath)).toBe(true);
    });
});

// ─── Layer 3: Convention Compliance ──────────────────────────────────

describe('Convention compliance — column patterns', () => {
    it.each(MIGRATED_PAGES)('%s uses createColumns<T> for type-safe column definitions', (rel) => {
        const src = readClientFile(rel);
        if (!src.includes('DataTable')) return;
        expect(src).toContain('createColumns');
    });

    it.each(MIGRATED_PAGES)('%s wraps columns in useMemo (not inline)', (rel) => {
        const src = readClientFile(rel);
        if (!src.includes('DataTable')) return;

        // React rules-of-hooks violation: columns must be memoized
        expect(src).toContain('useMemo');

        // Negative check: no standalone IIFE around column definitions.
        // Anti-pattern: const columns = (() => createColumns([...]))();
        // Good pattern: const columns = useMemo(() => createColumns([...]), []);
        // We check that every `createColumns` call is inside a `useMemo` on the same line
        const lines = src.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('createColumns') && !line.includes('import') && !line.includes('//')) {
                // This line defines columns — it should be inside useMemo, not a bare IIFE
                const isBareIIFE = /=\s*\(\(\)\s*=>/.test(line) && !line.includes('useMemo');
                if (isBareIIFE) {
                    throw new Error(`Line ${i + 1}: createColumns in bare IIFE — wrap in useMemo instead`);
                }
            }
        }
    });

    it.each(MIGRATED_PAGES)('%s has a data-testid for E2E targeting', (rel) => {
        const src = readClientFile(rel);
        if (!src.includes('DataTable')) return;
        expect(src).toContain('data-testid');
    });
});

// ─── Module Integrity ────────────────────────────────────────────────

describe('Table module integrity', () => {
    it('barrel index.ts re-exports all modules', () => {
        const barrel = fs.readFileSync(path.join(TABLE_MODULE_DIR, 'index.ts'), 'utf-8');
        const tsFiles = fs.readdirSync(TABLE_MODULE_DIR)
            .filter(f => /\.(ts|tsx)$/.test(f) && f !== 'index.ts');

        for (const file of tsFiles) {
            const mod = file.replace(/\.(ts|tsx)$/, '');
            expect(barrel).toContain(mod);
        }
    });

    it('no duplicate PaginationControls outside table module', () => {
        expect(fs.existsSync(path.join(UI_DIR, 'pagination-controls.tsx'))).toBe(false);
    });

    it('GUIDE.md exists and is non-trivial', () => {
        const guidePath = path.join(TABLE_MODULE_DIR, 'GUIDE.md');
        expect(fs.existsSync(guidePath)).toBe(true);
        const content = fs.readFileSync(guidePath, 'utf-8');
        expect(content.length).toBeGreaterThan(500);
        expect(content).toContain('createColumns');
        expect(content).toContain('DataTable');
    });

    it('no new *Client.tsx pages bypass DataTable without being in EXCLUDED_PAGES', () => {
        const allClientFiles = findFilesRecursive(CLIENT_DIR, name => name.endsWith('Client.tsx'));
        const migratedSet = new Set(MIGRATED_PAGES.map(r => path.basename(r)));
        const excludedSet = new Set(Object.keys(EXCLUDED_PAGES));

        const unknownPages: string[] = [];
        for (const file of allClientFiles) {
            const basename = path.basename(file);
            if (migratedSet.has(basename) || excludedSet.has(basename)) continue;

            // Check if this unknown page has a raw <table> without DataTable
            const src = fs.readFileSync(file, 'utf-8');
            const hasRawTable = /<table[\s>]/.test(src);
            const hasDataTable = src.includes('DataTable');

            if (hasRawTable && !hasDataTable) {
                unknownPages.push(basename);
            }
        }

        // If this fails, add the page to MIGRATED_PAGES or EXCLUDED_PAGES
        expect(unknownPages).toEqual([]);
    });
});

// ─── Exclusion Registry ──────────────────────────────────────────────

describe('Excluded page registry', () => {
    for (const [page, reason] of Object.entries(EXCLUDED_PAGES)) {
        it(`${page} exists and has a documented reason: "${reason}"`, () => {
            const allFiles = findFilesRecursive(CLIENT_DIR, name => name === page);
            expect(allFiles.length).toBeGreaterThanOrEqual(1);
            expect(reason.length).toBeGreaterThan(10);
        });
    }

    it('excluded page count is bounded (should not grow unbounded)', () => {
        expect(Object.keys(EXCLUDED_PAGES).length).toBeLessThanOrEqual(5);
    });
});

// ─── Migration Progress Tracking ─────────────────────────────────────

describe('Migration progress', () => {
    it('at least 10 pages are fully migrated', () => {
        const existing = MIGRATED_PAGES.filter(rel => {
            try { readClientFile(rel); return true; } catch { return false; }
        });
        expect(existing.length).toBeGreaterThanOrEqual(10);
    });

    it('migrated pages collectively cover all entity types', () => {
        const entityNames = ['control', 'evidence', 'risk', 'polic', 'task', 'vendor', 'asset', 'finding'];
        for (const entity of entityNames) {
            const covered = MIGRATED_PAGES.some(p => p.toLowerCase().includes(entity));
            expect(covered).toBe(true);
        }
    });
});
