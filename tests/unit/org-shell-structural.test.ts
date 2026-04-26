/**
 * Epic O-4 — structural contract for the org shell.
 *
 * Static-file checks (no jsdom, no React render) that lock the
 * org-layer foundation:
 *
 *   1. The /org/[orgSlug] layout file exists and resolves session +
 *      org context server-side.
 *   2. Auth gate: redirects unauthenticated callers to /login.
 *   3. Membership gate: a thrown ForbiddenError/NotFoundError from
 *      `getOrgServerContext` collapses to `notFound()` (no slug echo).
 *   4. The layout wraps children in `OrgProvider` + `OrgAppShell`.
 *   5. The org sidebar enumerates all 7 nav entries the spec calls for.
 *   6. Drill-down nav entries are gated by `canDrillDown`.
 *
 * Mirror of `keyboard-shortcut-provider-integration.test.ts` —
 * structural contract over an installed primitive.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const LAYOUT_PATH = 'src/app/org/[orgSlug]/layout.tsx';
const SHELL_PATH = 'src/components/layout/OrgAppShell.tsx';
const NAV_PATH = 'src/components/layout/OrgSidebarNav.tsx';
const PROVIDER_PATH = 'src/lib/org-context-provider.tsx';
const SERVER_CTX_PATH = 'src/lib/server/org-context.server.ts';

describe('Epic O-4 — org shell structural contract', () => {
    it('layout file exists at the canonical path', () => {
        expect(fs.existsSync(path.join(ROOT, LAYOUT_PATH))).toBe(true);
    });

    it('layout resolves session via auth() and redirects unauth callers to /login', () => {
        const src = read(LAYOUT_PATH);
        expect(src).toMatch(/from\s+['"]@\/auth['"]/);
        // Calls auth() and routes !session through redirect('/login').
        expect(src).toMatch(/await\s+auth\s*\(\s*\)/);
        expect(src).toMatch(/redirect\s*\(\s*['"]\/login['"]\s*\)/);
    });

    it('layout resolves OrgServerContext and routes errors to notFound()', () => {
        const src = read(LAYOUT_PATH);
        expect(src).toMatch(/getOrgServerContext\s*\(\s*\{/);
        expect(src).toMatch(/notFound\s*\(\s*\)/);
        // The membership-error path must NOT echo the slug — anti-
        // enumeration. The catch block routes to notFound() rather
        // than rendering a "you're not a member of <slug>" message.
        expect(src).toMatch(/}\s+catch\s*(\(\w+\))?\s*\{[\s\S]*?notFound\s*\(\s*\)/);
    });

    it('layout uses noStore() + dynamic = "force-dynamic" (per-request freshness)', () => {
        const src = read(LAYOUT_PATH);
        expect(src).toMatch(/noStore\s*\(\s*\)/);
        expect(src).toMatch(/dynamic\s*=\s*['"]force-dynamic['"]/);
    });

    it('layout wraps children in OrgProvider and OrgAppShell', () => {
        const src = read(LAYOUT_PATH);
        expect(src).toMatch(/<OrgProvider/);
        expect(src).toMatch(/<OrgAppShell/);
    });

    // ── Sidebar nav structure ─────────────────────────────────────────

    it('OrgSidebarNav declares all 7 spec nav entries', () => {
        const src = read(NAV_PATH);
        // Order matches the Epic O-4 spec.
        for (const label of [
            'Portfolio Overview',
            'All Tenants',
            'Non-Performing Controls',
            'Critical Risks',
            'Overdue Evidence',
            'Members',
            'Settings',
        ]) {
            expect(src).toContain(label);
        }
    });

    it('drill-down nav entries are gated by canDrillDown', () => {
        const src = read(NAV_PATH);
        // The three drill-down items must carry `requiresDrillDown: true`.
        expect(src).toMatch(/label:\s*['"]Non-Performing Controls['"][\s\S]+?requiresDrillDown:\s*true/);
        expect(src).toMatch(/label:\s*['"]Critical Risks['"][\s\S]+?requiresDrillDown:\s*true/);
        expect(src).toMatch(/label:\s*['"]Overdue Evidence['"][\s\S]+?requiresDrillDown:\s*true/);
        // And the filter must check `perms.canDrillDown` for those rows.
        expect(src).toMatch(/canDrillDown/);
    });

    it('Members nav entry is gated by canManageMembers', () => {
        const src = read(NAV_PATH);
        expect(src).toMatch(/label:\s*['"]Members['"][\s\S]+?requiresManageMembers:\s*true/);
        expect(src).toMatch(/canManageMembers/);
    });

    it('Settings nav entry is gated by canManageTenants', () => {
        const src = read(NAV_PATH);
        expect(src).toMatch(/label:\s*['"]Settings['"][\s\S]+?requiresManageTenants:\s*true/);
        expect(src).toMatch(/canManageTenants/);
    });

    it('OrgSidebarNav reuses MobileDrawer from the existing SidebarNav', () => {
        const shellSrc = read(SHELL_PATH);
        // OrgAppShell imports MobileDrawer from SidebarNav (no
        // duplication of the off-canvas chrome).
        expect(shellSrc).toMatch(/MobileDrawer.*from\s+['"]@\/components\/layout\/SidebarNav['"]/);
    });

    // ── Provider + server context ────────────────────────────────────

    it('OrgProvider exposes the four hooks the org pages need', () => {
        const src = read(PROVIDER_PATH);
        for (const hook of ['useOrgContext', 'useOrgPermissions', 'useOrgHref', 'useOrgApiUrl']) {
            expect(src).toMatch(new RegExp(`export function ${hook}`));
        }
    });

    it('useOrgContext throws when used outside OrgProvider (defensive guard)', () => {
        const src = read(PROVIDER_PATH);
        expect(src).toMatch(/throw new Error\([^)]*OrgProvider/);
    });

    it('getOrgServerContext throws ForbiddenError on missing membership (no slug leak)', () => {
        const src = read(SERVER_CTX_PATH);
        expect(src).toMatch(/throw new ForbiddenError/);
        // Generic message, no slug echo.
        expect(src).toMatch(/['"]Access to this organization is not permitted['"]/);
    });

    it('getOrgServerContext throws NotFoundError when the org slug does not resolve', () => {
        const src = read(SERVER_CTX_PATH);
        expect(src).toMatch(/throw new NotFoundError/);
    });
});
