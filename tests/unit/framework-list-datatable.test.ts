/**
 * Framework list page — UX choice ratchet.
 *
 * Epic 46.4 originally migrated this page to ListPageShell +
 * DataTable. That migration was rolled back (the card grid reads
 * better at-a-glance for a small catalog and gives every
 * framework a colour band). The tree-view explorer on the
 * DETAIL page stays — it's the better experience inside a
 * framework, just not for the framework picker.
 *
 * This file now locks the OPPOSITE invariant: the list page
 * must keep the card grid (no DataTable migration without an
 * explicit re-decision). The builder-tab assertions on the
 * detail page stay — those are independent of the list-page
 * decision.
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

describe('framework list — card grid (revert ratchet)', () => {
    const page = read(LIST_PAGE);

    it('renders the card grid (NOT a DataTable)', () => {
        // The card grid signal: per-card `id="fw-card-<key>"`.
        // Anyone re-introducing a DataTable migration would
        // remove these in favour of `<DataTable data={…} />`.
        expect(page).toMatch(/fw-card-/);
        expect(page).not.toMatch(/<DataTable\b/);
    });

    it('does not delegate to a FrameworksClient island', () => {
        // The DataTable migration created
        // `frameworks/FrameworksClient.tsx` and made the page a
        // thin server-component shell. Reverting that means the
        // page is the canonical card-grid server component
        // again, with no client island.
        expect(page).not.toMatch(/<FrameworksClient\b/);
        expect(fs.existsSync(LIST_CLIENT)).toBe(false);
    });

    it('keeps the per-card "View Details" link as the entry to the tree explorer', () => {
        // The detail page still hosts the Epic 46 tree explorer;
        // every card MUST give the user a one-click path into it.
        expect(page).toMatch(/view-framework-/);
        expect(page).toMatch(/\/frameworks\/\$\{?fw\.key\}?/);
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
