/**
 * Epic O-4 — CISO portfolio journey (E2E).
 *
 * Walks the full hub-and-spoke flow against the production-mode
 * Next server, the seeded `acme-org` Organization, and the seeded
 * `acme-corp` child Tenant (which already has controls / risks /
 * evidence courtesy of `prisma/seed.ts`):
 *
 *   A. Login as `ciso@acme.com` (ORG_ADMIN of acme-org, AUDITOR
 *      of acme-corp). Confirms the read-only AUDITOR badge on the
 *      tenant chrome.
 *
 *   B. Portfolio overview at `/org/acme-org` renders the four stat
 *      cards + the drill-down CTAs + the per-tenant coverage list.
 *
 *   C. Drill-down lists at `/org/acme-org/{controls,risks,evidence}`
 *      render with tenant attribution columns. The first risk row
 *      links to `/t/acme-corp/risks/{id}` and lands on the per-
 *      tenant detail page (RLS-enforced read via the auto-
 *      provisioned AUDITOR membership).
 *
 *   D. Read-only invariant: the AUDITOR membership grants no
 *      `canWrite`, so the tenant risks list must NOT render
 *      `#new-risk-btn`.
 *
 *   E. Tenant creation via `/org/acme-org/tenants/new`. Confirms
 *      the new tenant appears in the org tenants list. We do NOT
 *      navigate into the new tenant — the in-flight session JWT
 *      doesn't carry the just-issued OWNER membership until next
 *      refresh, and the middleware tenant-access gate is JWT-bound
 *      (separate concern, predates Epic O-4).
 *
 *   F. OrgSwitcher pivots from portfolio context to a tenant
 *      workspace via the sidebar header dropdown.
 *
 * Each test re-logs in and re-navigates from scratch — matches the
 * pattern in `core-flow.spec.ts` so a single failure doesn't cascade
 * across the suite.
 */
import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto, waitForHydration } from './e2e-utils';

const CISO = { email: 'ciso@acme.com', password: 'password123' };
const ORG_SLUG = 'acme-org';
const SEED_TENANT = 'acme-corp';
const UNIQUE = Date.now().toString(36).slice(-6);
const NEW_TENANT_SLUG = `e2e-portfolio-${UNIQUE}`;
const NEW_TENANT_NAME = `E2E Portfolio Tenant ${UNIQUE}`;

test.describe('CISO portfolio journey (Epic O-4)', () => {
    test.describe.configure({ mode: 'serial' });

    test('A — login as CISO and land on the auto-provisioned AUDITOR tenant', async ({ page }) => {
        const slug = await loginAndGetTenant(page, CISO);
        // CISO's only seeded TenantMembership is acme-corp/AUDITOR.
        expect(slug).toBe(SEED_TENANT);

        // Role pill in the sidebar reflects the AUDITOR posture.
        await expect(
            page.locator('aside').getByText(/AUDITOR/i).first(),
        ).toBeVisible({ timeout: 15_000 });
    });

    test('B — portfolio overview renders four stat cards + drill-down CTAs + tenant list', async ({ page }) => {
        await loginAndGetTenant(page, CISO);
        await safeGoto(page, `/org/${ORG_SLUG}`);

        await expect(
            page.getByRole('heading', { name: /Portfolio Overview/i }),
        ).toBeVisible({ timeout: 30_000 });

        // Four stat cards are present and rendered.
        await expect(page.locator('#org-stat-coverage')).toBeVisible();
        await expect(page.locator('#org-stat-critical-risks')).toBeVisible();
        await expect(page.locator('#org-stat-overdue-evidence')).toBeVisible();
        await expect(page.locator('#org-stat-tenants')).toBeVisible();

        // Drill-down + tenant coverage sections are present.
        await expect(page.locator('#org-drilldown-ctas')).toBeVisible();
        await expect(page.locator('#org-tenant-coverage')).toBeVisible();

        // The seeded acme-corp tenant is rendered as a clickable row.
        await expect(
            page.locator(`[data-testid="org-tenant-row-${SEED_TENANT}"]`).first(),
        ).toBeVisible({ timeout: 15_000 });
    });

    test('C — controls drill-down lists rows with tenant attribution', async ({ page }) => {
        await loginAndGetTenant(page, CISO);
        await safeGoto(page, `/org/${ORG_SLUG}/controls`);

        // Either rows or the empty state — both prove the page rendered
        // through getNonPerformingControls without an error.
        await expect(page.locator('#org-controls-table')).toBeVisible({
            timeout: 30_000,
        });

        const hasRow = await page
            .locator(`[data-testid="org-control-tenant-${SEED_TENANT}"]`)
            .first()
            .isVisible()
            .catch(() => false);
        const hasEmpty = await page
            .getByText(/All controls performing/i)
            .first()
            .isVisible()
            .catch(() => false);
        expect(hasRow || hasEmpty).toBe(true);
    });

    test('D — risks drill-down → click row → land on /t/acme-corp/risks/{id}', async ({ page }) => {
        await loginAndGetTenant(page, CISO);
        await safeGoto(page, `/org/${ORG_SLUG}/risks`);
        await expect(page.locator('#org-risks-table')).toBeVisible({
            timeout: 30_000,
        });

        const firstRiskLink = page
            .locator('[data-testid^="org-risk-link-"]')
            .first();

        if ((await firstRiskLink.count()) > 0) {
            // Tenant attribution surfaced alongside the row.
            await expect(
                page
                    .locator(`[data-testid="org-risk-tenant-${SEED_TENANT}"]`)
                    .first(),
            ).toBeVisible({ timeout: 15_000 });

            await firstRiskLink.click();
            await page.waitForURL(
                new RegExp(`/t/${SEED_TENANT}/risks/[^/?#]+`),
                { timeout: 30_000 },
            );
            // Per-tenant page rendered (sidebar + main visible).
            await expect(page.locator('aside').first()).toBeVisible({
                timeout: 30_000,
            });
        } else {
            // No critical risks seeded today — assert the empty state
            // copy so we know the page rendered cleanly.
            await expect(
                page.getByText(/No critical risks/i).first(),
            ).toBeVisible({ timeout: 15_000 });
        }
    });

    test('E — overdue evidence list renders with tenant attribution or empty state', async ({ page }) => {
        await loginAndGetTenant(page, CISO);
        await safeGoto(page, `/org/${ORG_SLUG}/evidence`);
        await expect(page.locator('#org-evidence-table')).toBeVisible({
            timeout: 30_000,
        });

        const hasRow = await page
            .locator('[data-testid^="org-evidence-tenant-"]')
            .first()
            .isVisible()
            .catch(() => false);
        const hasEmpty = await page
            .getByText(/No overdue evidence/i)
            .first()
            .isVisible()
            .catch(() => false);
        expect(hasRow || hasEmpty).toBe(true);
    });

    test('F — read-only invariant: AUDITOR cannot create tenant-level records', async ({ page }) => {
        await loginAndGetTenant(page, CISO);
        await safeGoto(page, `/t/${SEED_TENANT}/risks`);

        // Wait for the tenant chrome to come up.
        await expect(page.locator('aside').first()).toBeVisible({
            timeout: 30_000,
        });
        await page.waitForLoadState('networkidle').catch(() => { /* best-effort */ });

        // The "+ New Risk" button is gated by `permissions.canWrite` —
        // AUDITOR never has it. Absence of the button is the read-only
        // proof.
        await expect(page.locator('#new-risk-btn')).toHaveCount(0);
    });

    test('G — CISO creates a 2nd tenant via /org/{slug}/tenants/new', async ({ page }) => {
        await loginAndGetTenant(page, CISO);
        await safeGoto(page, `/org/${ORG_SLUG}/tenants/new`);

        await expect(
            page.locator('[data-testid="org-new-tenant-form"]'),
        ).toBeVisible({ timeout: 30_000 });

        await page.fill(
            '[data-testid="org-new-tenant-name"]',
            NEW_TENANT_NAME,
        );
        // The slug field auto-fills from the name; replace with a
        // collision-proof slug for repeat runs.
        await page.fill(
            '[data-testid="org-new-tenant-slug"]',
            NEW_TENANT_SLUG,
        );
        // "Choose later" — keeps the post-create redirect to a stable
        // surface that doesn't depend on the framework catalog.
        await page.click('[data-testid="org-new-tenant-framework-later"]');

        await page.click('[data-testid="org-new-tenant-submit"]');

        // The form attempts to redirect to /t/{newSlug}/dashboard. The
        // user's in-flight JWT doesn't carry the new OWNER membership
        // yet, so middleware bounces on /t/* — that's a known pre-Epic-
        // O-4 limitation. We only need to confirm the row was actually
        // created, which we verify on the org tenants list.
        await page.waitForURL(/\/(?:t|org|no-tenant)\b/, { timeout: 30_000 }).catch(() => {
            /* the URL may settle on an error or no-tenant — fine */
        });

        await safeGoto(page, `/org/${ORG_SLUG}/tenants`);
        await expect(page.locator('#org-tenants-table')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator(
                `[data-testid="org-tenant-link-${NEW_TENANT_SLUG}"]`,
            ),
        ).toBeVisible({ timeout: 15_000 });
    });

    test('H — OrgSwitcher pivots from portfolio context into a tenant workspace', async ({ page }) => {
        await loginAndGetTenant(page, CISO);
        await safeGoto(page, `/org/${ORG_SLUG}`);

        // Sidebar must be hydrated before the popover trigger fires.
        await waitForHydration(page, 'aside').catch(() => {
            /* best-effort */
        });

        const trigger = page
            .locator('[data-testid="org-switcher-trigger"]')
            .first();
        await expect(trigger).toBeVisible({ timeout: 15_000 });
        await trigger.click();

        await expect(
            page.locator('[data-testid="org-switcher-portfolio"]').first(),
        ).toBeVisible({ timeout: 10_000 });

        const tenantRow = page
            .locator(`[data-testid="org-switcher-tenant-${SEED_TENANT}"]`)
            .first();
        await expect(tenantRow).toBeVisible({ timeout: 15_000 });

        await tenantRow.click();
        await page.waitForURL(
            new RegExp(`/t/${SEED_TENANT}/dashboard`),
            { timeout: 30_000 },
        );
        await expect(page.locator('aside').first()).toBeVisible({
            timeout: 30_000,
        });
    });
});
