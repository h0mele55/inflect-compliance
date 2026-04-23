/**
 * List-page-shell coverage ratchet.
 *
 * Phase 3 of the list-page-shell work. Every page under
 * `src/app/t/[tenantSlug]/(app)/**` that imports `DataTable` falls
 * into one of three buckets:
 *
 *   1. **Migrated** — wraps the page in `<ListPageShell>` so the
 *      table card is viewport-clamped and only the table body
 *      scrolls. This is the canonical pattern for list pages.
 *
 *   2. **Exempt** — explicitly listed in `EXEMPTIONS` below with a
 *      one-line written reason. Use this for pages that legitimately
 *      need natural document scroll (multi-table dashboards, detail
 *      pages with inline sub-tables, wizards, etc.).
 *
 *   3. **Neither** — fails this test. Either wrap in
 *      `<ListPageShell>` (the default for any new list page), or
 *      add to `EXEMPTIONS` with a concrete reason.
 *
 * The ratchet matters because the new layout is opt-in: a future
 * contributor who copy-pastes an existing list page can quietly
 * skip the wrapper and the regression (whole-page scroll, header
 * scrolling out of view) returns silently. CI catches it.
 *
 * To MIGRATE a previously-exempt page: remove the entry from
 * EXEMPTIONS, wrap the page in `<ListPageShell>`, and add `fillBody`
 * to the page's primary `<DataTable>`.
 *
 * To EXEMPT a new file: add an entry to EXEMPTIONS with a short
 * comment explaining why the page genuinely doesn't fit the
 * single-primary-table shape (multi-card dashboard, detail-page
 * sub-table, wizard, etc.).
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)',
);

/**
 * Files that import `DataTable` but are intentionally NOT wrapped in
 * `<ListPageShell>`. Each entry is a path relative to APP_ROOT and
 * carries a one-line reason. Audit the list when adding entries —
 * the cost of the layout primitive is tiny; the benefit of
 * consistency is large.
 */
const EXEMPTIONS: Record<string, string> = {
    // Multi-section dashboard with KPI strip + summary bar + two
    // side-by-side gap tables. Viewport-clamping would compress the
    // whole grid awkwardly. Natural scroll is the right shape.
    'coverage/CoverageClient.tsx':
        'multi-card dashboard (KPIs + summary + two gap tables)',

    // Two stacked tables (active / revoked). A single fillBody
    // would force one of them to overflow internally while the
    // other stays static — confusing UX.
    'admin/api-keys/page.tsx':
        'multi-table page (active + revoked stacked)',

    // Tabbed admin settings page. The "stats" tab shows a fixed
    // 3-row table that doesn't need internal scroll; the "settings"
    // tab is a form. Neither benefits from viewport-clamping.
    'admin/notifications/page.tsx':
        'tabbed admin settings (form + 3-row stats table)',

    // Header + message banner + webhook URL info card +
    // connections list card. The connections list is one section
    // among several; viewport-clamping would consume space the
    // banner / info-card content needs.
    'admin/integrations/page.tsx':
        'multi-section admin page',

    // Sub-component embedded inside the billing page. Parent
    // decides layout; this file just renders a table given data.
    'admin/billing/BillingEventLog.tsx':
        'sub-component (parent owns layout)',

    // Browse-and-install template picker — multi-section browser,
    // not a list page in the perf-complaint sense.
    'controls/templates/page.tsx':
        'install-from-templates browser (multi-section)',

    // Risk import wizard. Result table appears mid-flow inside a
    // wizard step; not a primary list-page experience.
    'risks/import/page.tsx':
        'import wizard flow',
};

const SHELL_IMPORT_RE = /['"]@\/components\/layout\/ListPageShell['"]/;
const DATATABLE_IMPORT_RE = /from\s+['"]@\/components\/ui\/table[^'"]*['"]/;

function walk(dir: string, results: string[] = []): string[] {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, results);
        } else if (entry.name.endsWith('.tsx')) {
            results.push(full);
        }
    }
    return results;
}

interface Finding {
    relPath: string;
    importsDataTable: boolean;
    importsListPageShell: boolean;
    referencesDataTable: boolean;
}

function audit(): Finding[] {
    return walk(APP_ROOT).map((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        return {
            relPath: path
                .relative(APP_ROOT, file)
                .split(path.sep)
                .join('/'),
            importsDataTable: DATATABLE_IMPORT_RE.test(content),
            importsListPageShell: SHELL_IMPORT_RE.test(content),
            referencesDataTable: /\bDataTable\b/.test(content),
        };
    });
}

describe('list-page-shell coverage ratchet', () => {
    const findings = audit();

    test('every DataTable consumer is wrapped, exempt, or only re-exports', () => {
        const violators: string[] = [];
        for (const f of findings) {
            if (!f.importsDataTable) continue;
            if (!f.referencesDataTable) continue;
            if (f.importsListPageShell) continue;
            if (EXEMPTIONS[f.relPath]) continue;
            violators.push(f.relPath);
        }
        if (violators.length > 0) {
            throw new Error(
                `${violators.length} app page(s) import DataTable without wrapping in ListPageShell:\n  ` +
                    violators.join('\n  ') +
                    '\n\nFix options:\n' +
                    '  • Wrap the page in <ListPageShell> (see Risks/Controls/Tasks for the canonical pattern)\n' +
                    '    and add `fillBody` to the primary DataTable.\n' +
                    '  • OR add the file path to EXEMPTIONS in this test with a one-line reason.\n',
            );
        }
    });

    test('no exempt entry has a stale path (file moved/deleted)', () => {
        const stale: string[] = [];
        for (const exemptPath of Object.keys(EXEMPTIONS)) {
            const abs = path.join(APP_ROOT, exemptPath);
            if (!fs.existsSync(abs)) {
                stale.push(exemptPath);
            }
        }
        if (stale.length > 0) {
            throw new Error(
                `EXEMPTIONS contains ${stale.length} stale path(s) — file no longer exists:\n  ` +
                    stale.join('\n  ') +
                    '\n\nRemove these entries; the underlying file was moved or deleted.',
            );
        }
    });

    test('coverage floor is met (defence against the audit collapsing to zero)', () => {
        const migrated = findings.filter(
            (f) => f.importsDataTable && f.importsListPageShell,
        );
        // Snapshot at Phase 2 landing — 12 list pages migrated. The
        // floor stops a future PR from quietly removing the shell
        // from one of them without bumping this number in the same
        // diff (which forces a code review conversation).
        expect(migrated.length).toBeGreaterThanOrEqual(12);
    });
});
