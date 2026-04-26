/**
 * Epic O-4 — structural contract for the portfolio overview page.
 *
 * Static-file checks (no jsdom, no React render). Locks the load-
 * bearing properties of the CISO landing page so a refactor cannot
 * silently:
 *
 *   - drop one of the four spec'd sections (stats, RAG, risk trend,
 *     coverage-by-tenant, drill-down CTAs)
 *   - serialise the three portfolio fetches (must stay parallel)
 *   - leak the slug on a forbidden/missing org (catch must collapse
 *     to notFound())
 *   - break the drill-down hrefs the spec requires
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const PAGE_PATH = 'src/app/org/[orgSlug]/(app)/page.tsx';
const read = () => fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf-8');

describe('Epic O-4 — portfolio overview structural contract', () => {
    it('page exists at the canonical (app)/page.tsx path', () => {
        expect(fs.existsSync(path.join(ROOT, PAGE_PATH))).toBe(true);
    });

    it('declares dynamic = "force-dynamic" (per-request freshness)', () => {
        expect(read()).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
    });

    it('resolves OrgContext via getOrgCtx and collapses errors to notFound()', () => {
        const src = read();
        expect(src).toMatch(/from\s+['"]@\/app-layer\/context['"]/);
        expect(src).toMatch(/getOrgCtx\s*\(\s*\{[^}]*orgSlug/);
        // Defensive try/catch must route to notFound() — no slug echo.
        expect(src).toMatch(/}\s*catch\b[\s\S]*?notFound\s*\(\s*\)/);
    });

    it('imports the three portfolio usecases from the app-layer barrel', () => {
        const src = read();
        expect(src).toMatch(/from\s+['"]@\/app-layer\/usecases\/portfolio['"]/);
        expect(src).toMatch(/getPortfolioSummary/);
        expect(src).toMatch(/getPortfolioTenantHealth/);
        expect(src).toMatch(/getPortfolioTrends/);
    });

    it('fetches all three portfolio views in parallel via Promise.all', () => {
        const src = read();
        // The three calls must sit inside a single Promise.all — not
        // sequential awaits. A regression that splits these into three
        // serial awaits would triple the page TTFB on cold caches.
        expect(src).toMatch(
            /Promise\.all\s*\(\s*\[\s*[\s\S]*?getPortfolioSummary[\s\S]*?getPortfolioTenantHealth[\s\S]*?getPortfolioTrends[\s\S]*?\]/,
        );
    });

    it('passes a 90-day window to getPortfolioTrends (matches spec default)', () => {
        // Locks the default trend window. Lifting this is fine — but
        // requires updating the test alongside the change.
        expect(read()).toMatch(/getPortfolioTrends\s*\(\s*ctx\s*,\s*90\s*\)/);
    });

    // ── Section presence ─────────────────────────────────────────────

    it('renders the four spec sections', () => {
        const src = read();
        // Stat-card row.
        expect(src).toMatch(/<StatCardsRow\b/);
        // RAG distribution + risk trend (side-by-side block).
        expect(src).toMatch(/<RagDistributionCard\b/);
        expect(src).toMatch(/<RiskTrendCard\b/);
        // Coverage-by-tenant list.
        expect(src).toMatch(/<TenantCoverageList\b/);
        // Drill-down CTAs.
        expect(src).toMatch(/<DrillDownCtas\b/);
    });

    it('stat-card row covers coverage, critical risks, overdue evidence, and tenants', () => {
        const src = read();
        // Each KpiCard carries a stable id we can assert on.
        for (const id of [
            'org-stat-coverage',
            'org-stat-critical-risks',
            'org-stat-overdue-evidence',
            'org-stat-tenants',
        ]) {
            expect(src).toContain(id);
        }
    });

    it('RAG donut covers all four bands (green / amber / red / pending)', () => {
        const src = read();
        // The four labels the donut emits — locks the segment shape.
        for (const label of ['Healthy', 'At risk', 'Critical', 'Pending snapshot']) {
            expect(src).toContain(label);
        }
    });

    it('tenant coverage list links each row to its tenant dashboard via row.drillDownUrl', () => {
        const src = read();
        // The Link href must be the pre-computed drillDownUrl from the
        // usecase — never a hand-built string. The usecase emits
        // `/t/{slug}/dashboard`; constructing the href here would let
        // the page drift from the usecase contract.
        expect(src).toMatch(/href=\{row\.drillDownUrl\}/);
    });

    it('tenant coverage list sorts RED → AMBER → GREEN → PENDING', () => {
        const src = read();
        // Locks the sort order so a refactor doesn't bury the most
        // actionable tenants below healthy ones.
        expect(src).toMatch(/RED:\s*0[\s\S]*?AMBER:\s*1[\s\S]*?GREEN:\s*2[\s\S]*?PENDING:\s*3/);
    });

    it('drill-down CTAs point at /org/{slug}/{controls,risks,evidence}', () => {
        const src = read();
        expect(src).toMatch(/`\/org\/\$\{orgSlug\}\/controls`/);
        expect(src).toMatch(/`\/org\/\$\{orgSlug\}\/risks`/);
        expect(src).toMatch(/`\/org\/\$\{orgSlug\}\/evidence`/);
    });

    // ── Empty-state coverage ─────────────────────────────────────────

    it('uses EmptyState for the three "no data yet" surfaces', () => {
        const src = read();
        expect(src).toMatch(/from\s+['"]@\/components\/ui\/empty-state['"]/);
        // Three empty-state callsites — RAG, trend, tenants list.
        const matches = src.match(/<EmptyState\b/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    // ── Reuse of platform primitives (Epic 51/59) ────────────────────

    it('reuses platform primitives (KpiCard, DonutChart, TrendCard, StatusBadge)', () => {
        const src = read();
        expect(src).toMatch(/from\s+['"]@\/components\/ui\/KpiCard['"]/);
        expect(src).toMatch(/from\s+['"]@\/components\/ui\/DonutChart['"]/);
        expect(src).toMatch(/from\s+['"]@\/components\/ui\/TrendCard['"]/);
        expect(src).toMatch(/from\s+['"]@\/components\/ui\/status-badge['"]/);
    });

    it('does not hand-roll a raw <table> or <svg> (chart/table primitives only)', () => {
        const src = read();
        // Epic 52 ratchet equivalent: the overview page must not
        // reintroduce raw tables or inline SVG. Charts route through
        // DonutChart/TrendCard; tabular data routes through DataTable.
        expect(src).not.toMatch(/<table\b/);
        expect(src).not.toMatch(/<svg\b/);
    });
});
