/**
 * Epic 46.4 — structural ratchet for the framework list-page
 * DataTable migration AND the builder-tab wiring on the detail
 * page.
 *
 * The migration replaced a hand-rolled card grid with the shared
 * `<ListPageShell>` + `<DataTable>` pattern. A future "simplify"
 * PR could quietly revert this; the regression would be silent
 * (the page still renders SOMETHING, just no longer in the
 * standard list architecture). This guardrail catches that.
 */

import * as fs from 'fs';
import * as path from 'path';

const LIST_PAGE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/frameworks/page.tsx',
);
const LIST_CLIENT = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/frameworks/FrameworksClient.tsx',
);
const DETAIL_PAGE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/page.tsx',
);

function read(p: string): string {
    return fs.readFileSync(p, 'utf-8');
}

describe('framework list — DataTable migration', () => {
    const page = read(LIST_PAGE);
    const client = read(LIST_CLIENT);

    it('server page delegates to FrameworksClient', () => {
        expect(page).toMatch(/from\s*'\.\/FrameworksClient'/);
        expect(page).toMatch(/<FrameworksClient\b/);
    });

    it('FrameworksClient mounts <DataTable> from the shared table primitive', () => {
        expect(client).toMatch(
            /from\s*'@\/components\/ui\/table'/,
        );
        expect(client).toMatch(/<DataTable\b/);
        expect(client).toMatch(/createColumns\b/);
    });

    it('FrameworksClient wraps in <ListPageShell> (Epic 52 architecture)', () => {
        expect(client).toMatch(
            /from\s*'@\/components\/layout\/ListPageShell'/,
        );
        expect(client).toMatch(/<ListPageShell\b/);
    });

    it('list carries the required Epic 46.4 columns: Domain, Requirements, Coverage', () => {
        expect(client).toMatch(/header:\s*'Domain'/);
        expect(client).toMatch(/header:\s*'Requirements'/);
        expect(client).toMatch(/header:\s*'Coverage'/);
    });

    it('preserves the original framework-detail link affordance', () => {
        // The card grid had `view-framework-<key>` as the primary
        // CTA — keeping that id stable means existing E2E selectors
        // and analytics keep working.
        expect(client).toMatch(/view-framework-/);
    });

    it('does not retain the legacy card-grid markup', () => {
        // The legacy block built `[id^="fw-card-"]` cards. Their
        // disappearance is the canonical signal the migration
        // landed.
        expect(page).not.toMatch(/fw-card-/);
        expect(client).not.toMatch(/fw-card-/);
    });
});

describe('framework detail — builder tab wiring (Epic 46.4)', () => {
    const src = read(DETAIL_PAGE);

    it('imports FrameworkBuilder', () => {
        expect(src).toMatch(
            /from\s*'@\/components\/ui\/FrameworkBuilder'/,
        );
        expect(src).toMatch(/<FrameworkBuilder\b/);
    });

    it('mounts the builder behind a permission gate', () => {
        // The reorder action mutates per-tenant state — must be
        // gated. The page uses `<RequirePermission resource="frameworks" action="install">`,
        // matching the OWNER/ADMIN bar inside the usecase.
        expect(src).toMatch(/<RequirePermission[^>]*resource="frameworks"[^>]*action="install"/);
    });

    it('declares a "builder" tab and a #builder-panel container', () => {
        expect(src).toMatch(/key:\s*'builder'/);
        expect(src).toMatch(/id="builder-panel"/);
    });

    it('the save handler POSTs to /frameworks/<key>/reorder', () => {
        expect(src).toMatch(/\/frameworks\/\$\{frameworkKey\}\/reorder/);
    });
});
