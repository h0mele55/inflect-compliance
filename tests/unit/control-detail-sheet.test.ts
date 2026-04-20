/**
 * Epic 54 — Control quick-inspect / edit Sheet migration.
 *
 * Node-env jest source-inspects the new Sheet surface:
 *
 *   1. Sheet composition — uses shared <Sheet> primitives (no bespoke
 *      overlay), sits at size="md", provides actions with left-aligned
 *      "Open full detail" and right-aligned Cancel / Save.
 *   2. Data flow — loads via the same queryKeys.controls.detail used by
 *      the full detail page, PATCHes the identical endpoint the legacy
 *      edit modal used, fires the separate owner POST only when changed.
 *   3. UX invariants — unsaved-changes guard, focus on name, canSave gate,
 *      read-only summary (status / applicability / owner / code).
 *   4. List wiring — quick-edit icon per row opens the Sheet; row click
 *      retains the legacy navigation to the full detail page (two entries,
 *      one cognitive model).
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

const SHEET_SRC = read('src/app/t/[tenantSlug]/(app)/controls/ControlDetailSheet.tsx');
const CLIENT_SRC = read('src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx');

// ─── 1. Sheet composition ────────────────────────────────────────

describe('ControlDetailSheet — shared Sheet composition', () => {
    it('is a client component', () => {
        expect(SHEET_SRC).toMatch(/^'use client'/);
    });

    it('uses the shared <Sheet> (no bespoke overlay)', () => {
        expect(SHEET_SRC).toMatch(/from ['"]@\/components\/ui\/sheet['"]/);
        expect(SHEET_SRC).not.toMatch(/fixed inset-0 bg-black/);
    });

    it('sits at size="md" — the documented detail-view width', () => {
        expect(SHEET_SRC).toMatch(/size=["']md["']/);
    });

    it('composes Sheet.Header + Sheet.Body + Sheet.Actions', () => {
        expect(SHEET_SRC).toMatch(/<Sheet\.Header\b/);
        expect(SHEET_SRC).toMatch(/<Sheet\.Body\b/);
        expect(SHEET_SRC).toMatch(/<Sheet\.Actions\b/);
    });

    it('Actions align="between" splits "Open full detail" from Cancel/Save', () => {
        expect(SHEET_SRC).toMatch(/align=["']between["']/);
    });

    it('provides an explicit Sheet.Close affordance for Cancel', () => {
        expect(SHEET_SRC).toMatch(/<Sheet\.Close asChild>/);
    });
});

// ─── 2. Data flow ────────────────────────────────────────────────

describe('ControlDetailSheet — data flow', () => {
    it('loads the control via queryKeys.controls.detail (shared cache with the full detail page)', () => {
        expect(SHEET_SRC).toMatch(/queryKeys\.controls\.detail\(tenantSlug,\s*controlId\)/);
    });

    it('enables the query only when a controlId is selected', () => {
        expect(SHEET_SRC).toMatch(/enabled:\s*open/);
    });

    it('PATCHes /controls/:id with the legacy field set', () => {
        expect(SHEET_SRC).toMatch(/method:\s*['"]PATCH['"]/);
        expect(SHEET_SRC).toMatch(/apiUrl\(`\/controls\/\$\{controlId\}`\)/);
        for (const field of ['name', 'description', 'intent', 'category', 'frequency']) {
            expect(SHEET_SRC).toContain(field);
        }
    });

    it('fires the owner POST only when the owner actually changed', () => {
        expect(SHEET_SRC).toMatch(/draft\.owner\.trim\(\)\s*!==\s*originalOwner/);
        expect(SHEET_SRC).toMatch(/apiUrl\(`\/controls\/\$\{controlId\}\/owner`\)/);
    });

    it('invalidates controls.all(tenantSlug) on success — list reflects new values', () => {
        expect(SHEET_SRC).toMatch(/invalidateQueries\(\{\s*queryKey:\s*queryKeys\.controls\.all\(tenantSlug\)/);
    });

    it('closes the Sheet on save success (setControlId(null))', () => {
        expect(SHEET_SRC).toMatch(/setControlId\(null\)/);
    });

    it('surfaces mutation errors into a data-testid-reachable alert', () => {
        expect(SHEET_SRC).toMatch(/data-testid=["']control-sheet-save-error["']/);
        expect(SHEET_SRC).toMatch(/role=["']alert["']/);
    });
});

// ─── 3. UX invariants ────────────────────────────────────────────

describe('ControlDetailSheet — UX invariants', () => {
    it('focuses the name input shortly after open', () => {
        expect(SHEET_SRC).toMatch(/nameInputRef\.current\?\.focus\(\)/);
    });

    it('gates save behind canWrite + dirty + name length ≥ 3 + not pending', () => {
        expect(SHEET_SRC).toMatch(/canWrite\s*&&\s*dirty\s*&&\s*form\.name\.trim\(\)\.length\s*>=\s*3\s*&&\s*!mutation\.isPending/);
    });

    it('fieldset disables edits when the user lacks write permission', () => {
        expect(SHEET_SRC).toMatch(/<fieldset[\s\S]*?disabled=\{!canWrite\s*\|\|\s*mutation\.isPending\}/);
    });

    it('unsaved-changes guard prompts before close', () => {
        expect(SHEET_SRC).toMatch(/window\.confirm\(['"]Discard unsaved changes\?['"]\)/);
    });

    it('renders a read-only summary card (status / applicability / owner / code)', () => {
        expect(SHEET_SRC).toMatch(/data-testid=["']control-sheet-summary["']/);
        expect(SHEET_SRC).toMatch(/Applicability/);
        expect(SHEET_SRC).toMatch(/Owner/);
    });

    it('"Open full detail" link routes to the canonical control page', () => {
        expect(SHEET_SRC).toMatch(/href=\{tenantHref\(`\/controls\/\$\{control\.id\}`\)\}/);
        expect(SHEET_SRC).toMatch(/data-testid=["']control-sheet-open-full["']/);
    });

    it('uses semantic tokens only — no raw Dub palette', () => {
        for (const pattern of [
            /\bbg-white\b/,
            /\btext-black\b/,
            /\bbg-neutral-\d/,
            /\btext-neutral-\d/,
        ]) {
            expect(SHEET_SRC).not.toMatch(pattern);
        }
    });
});

// ─── 4. ControlsClient wiring ────────────────────────────────────

describe('ControlsClient — Sheet entry points', () => {
    it('imports ControlDetailSheet', () => {
        expect(CLIENT_SRC).toMatch(/from ['"]\.\/ControlDetailSheet['"]/);
    });

    it('owns sheetControlId state (null = closed)', () => {
        expect(CLIENT_SRC).toMatch(/sheetControlId/);
        expect(CLIENT_SRC).toMatch(/setSheetControlId/);
    });

    it('mounts <ControlDetailSheet> with tenant-scoped helpers + canWrite', () => {
        expect(CLIENT_SRC).toMatch(/<ControlDetailSheet\b/);
        expect(CLIENT_SRC).toMatch(/controlId=\{sheetControlId\}/);
        expect(CLIENT_SRC).toMatch(/setControlId=\{setSheetControlId\}/);
        expect(CLIENT_SRC).toMatch(/canWrite=\{appPermissions\.controls\.edit\}/);
    });

    it('adds a quick-edit icon column that opens the Sheet', () => {
        expect(CLIENT_SRC).toMatch(/id:\s*['"]quick-edit['"]/);
        expect(CLIENT_SRC).toMatch(/control-quick-edit-\$\{row\.original\.id\}/);
        expect(CLIENT_SRC).toMatch(/setSheetControlId\(row\.original\.id\)/);
    });

    it('row-click navigation to the full detail page is preserved', () => {
        // Regression guard — the Sheet is an *additional* entry point; the
        // list row still navigates for users who want the tabbed detail.
        expect(CLIENT_SRC).toMatch(/onRowClick=\{\(row\)\s*=>\s*router\.push\(tenantHref\(`\/controls\/\$\{row\.original\.id\}`\)\)\}/);
    });
});
