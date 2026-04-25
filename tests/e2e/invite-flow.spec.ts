/**
 * E2E — R-5 closure: Invitation journey (Epic 1)
 *
 * Walks the full happy path against a live server:
 *   1. Admin creates an invite via the API (and pre-registers the invitee
 *      so their User row exists for credentials sign-in).
 *   2. Invitee opens the preview page (fresh browser context, no cookies).
 *   3. Invitee clicks "Sign in to accept" → cookie set → redirect to /login.
 *   4. Invitee signs in via test-mode credentials → lands on tenant dashboard
 *      or tenant picker (invitee may have >1 membership).
 *   5. Invitee is EDITOR → admin.members endpoint returns 403.
 *   6. Invalid/garbage token → preview shows "Invite not available".
 *
 * Uses AUTH_TEST_MODE=1 credentials provider.
 * All selectors use existing id / role attributes — no data-testid additions.
 */
import { test, expect, type BrowserContext } from '@playwright/test';
import { safeGoto } from './e2e-utils';

test.describe.configure({ mode: 'serial' });

const ADMIN_USER = { email: 'admin@acme.com', password: 'password123' };
// Unique per run so repeated runs don't collide on already-redeemed invites.
const TIMESTAMP = Date.now();
const INVITEE_EMAIL = `r5-invitee-${TIMESTAMP}@e2e.test`;
// Sufficiently unique password unlikely to appear in HIBP.
const INVITEE_PASSWORD = `InvT3st!${TIMESTAMP}`;

// Shared across the serial suite
let tenantSlug: string;
let inviteToken: string;
/** Stored as a bare path like /invite/<token> — the API returns a relative URL. */
let invitePath: string;

// ── Helper: sign in via credentials form ───────────────────────────────────

/**
 * Sign in with email+password via the #credentials-form and return to the
 * caller once either the tenant dashboard or the tenant picker is reached.
 * Returns the URL the browser landed on after sign-in.
 */
async function signInWithCredentials(
    page: Parameters<typeof safeGoto>[0],
    email: string,
    password: string,
): Promise<string> {
    await safeGoto(page, '/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const credentialsForm = page.locator('#credentials-form');
    await credentialsForm.locator('input[type="email"][name="email"]').waitFor({
        state: 'visible',
        timeout: 30_000,
    });

    // Wait for React hydration before interacting.
    await page.waitForFunction(() => {
        const form = document.querySelector('form');
        return (
            form &&
            Object.keys(form).some(
                (k) => k.startsWith('__reactEvents') || k.startsWith('__reactFiber'),
            )
        );
    }, { timeout: 30_000 });

    await credentialsForm.locator('input[type="email"][name="email"]').fill(email);
    await credentialsForm.locator('input[type="password"]').fill(password);
    await credentialsForm.locator('button[type="submit"]').click();

    // Accept /tenants picker or direct /t/<slug>/dashboard.
    await page.waitForURL(/\/(tenants|t\/[^/]+\/dashboard)/, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    });
    return page.url();
}

// ── 1. Admin creates invite + pre-registers invitee ────────────────────────

test('admin can create an invite for a new email', async ({ page }) => {
    // Sign in as admin using the credentials form directly (avoids loginAndGetTenant
    // which hard-expects /t/.../dashboard — fine for the admin who has exactly 1 membership).
    await signInWithCredentials(page, ADMIN_USER.email, ADMIN_USER.password);

    // If redirected to the picker (shouldn't happen for admin with 1 org, but be safe).
    if (!page.url().includes('/t/')) {
        throw new Error(`Admin login did not land on a tenant dashboard. URL: ${page.url()}`);
    }
    const adminMatch = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
    if (!adminMatch) throw new Error(`Could not parse tenant slug from: ${page.url()}`);
    tenantSlug = adminMatch[1];

    // Pre-register the invitee so their User row exists in the DB before
    // we try to sign them in via the Credentials provider.
    // /api/auth/register is a public endpoint — no auth cookie needed.
    // It creates a User + their own Tenant, so after redeeming the acme-corp
    // invite they will have 2 memberships (own org + acme).
    const regResult = await page.evaluate(
        async ({ email, password }: { email: string; password: string }) => {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'register',
                    email,
                    password,
                    name: 'R5 Invitee',
                    orgName: 'R5 Invitee Org',
                }),
            });
            const data = await res.json();
            return { status: res.status, error: data?.error };
        },
        { email: INVITEE_EMAIL, password: INVITEE_PASSWORD },
    );

    // 200 on success; 409 if the email was already registered (re-run).
    expect([200, 409]).toContain(regResult.status);

    // POST to the admin invites API while authenticated as admin.
    const result = await page.evaluate(
        async ({ slug, email }: { slug: string; email: string }) => {
            const res = await fetch(`/api/t/${slug}/admin/invites`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role: 'EDITOR' }),
            });
            const data = await res.json();
            return { status: res.status, invite: data?.invite, url: data?.url };
        },
        { slug: tenantSlug, email: INVITEE_EMAIL },
    );

    expect(result.status).toBe(201);
    expect(result.invite?.token).toBeTruthy();
    expect(result.url).toContain('/invite/');

    inviteToken = result.invite.token as string;
    // The API returns a relative URL like /invite/<token> — store as-is.
    invitePath = result.url as string;
});

// ── 2. Invite preview page (side-effect-free) ──────────────────────────────

test('invite preview page shows tenant + role + accept button', async ({ browser }) => {
    // Fresh browser context — no cookies, not signed in.
    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();

    try {
        // invitePath is a relative path like /invite/<token> — safeGoto prepends baseURL.
        await safeGoto(page, invitePath, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});

        // Tenant name is rendered inside the preview card.
        // seed.ts creates the tenant as "Acme Corp" (slug: acme).
        await expect(page.locator('text=You have been invited')).toBeVisible({ timeout: 30_000 });

        // The role label is title-cased by the page (e.g. "Editor").
        await expect(page.getByText(/Editor/i).first()).toBeVisible({ timeout: 10_000 });

        // "Sign in to accept" link is the CTA when user is not signed in.
        await expect(page.getByRole('link', { name: /Sign in to accept/i })).toBeVisible({
            timeout: 10_000,
        });

        // Must NOT have already created any membership side-effect.
        // Verify page does NOT show "Accept invitation" (the post-sign-in form).
        await expect(page.getByRole('button', { name: /Accept invitation/i })).not.toBeVisible();
    } finally {
        await ctx.close();
    }
});

// ── 3. Invitee redeems by signing in via test-mode credentials ──────────────

test('invitee redeems by signing in via test-mode credentials', async ({ browser }) => {
    // Fresh context — no admin session.
    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();

    try {
        // Navigate to the invite preview page.
        await safeGoto(page, invitePath, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('a[href*="start-signin"]', { timeout: 30_000 });

        // Click "Sign in to accept" — sets the invite cookie and redirects to /login.
        await page.click('a[href*="start-signin"]');
        await page.waitForURL(/\/login/, { timeout: 30_000 });

        // Fill credentials form. Scope to #credentials-form to avoid collision with
        // the resend-verification form rendered below it (same pattern as e2e-utils).
        const credentialsForm = page.locator('#credentials-form');
        await credentialsForm.locator('input[type="email"][name="email"]').waitFor({
            state: 'visible',
            timeout: 30_000,
        });

        // Wait for React hydration before interacting.
        await page.waitForFunction(() => {
            const form = document.querySelector('form');
            return (
                form &&
                Object.keys(form).some(
                    (k) => k.startsWith('__reactEvents') || k.startsWith('__reactFiber'),
                )
            );
        }, { timeout: 30_000 });

        await credentialsForm.locator('input[type="email"][name="email"]').fill(INVITEE_EMAIL);
        await credentialsForm.locator('input[type="password"]').fill(INVITEE_PASSWORD);
        await credentialsForm.locator('button[type="submit"]').click();

        // After sign-in the login page hard-redirects to /tenants.
        // The invitee has their own org (created by /api/auth/register) plus the
        // newly-redeemed acme-corp membership → 2 memberships → /tenants picker.
        // If somehow only 1 membership is present the redirect goes directly to
        // /t/<slug>/dashboard. Accept either destination.
        await page.waitForURL(/\/(tenants|t\/[^/]+\/dashboard)/, {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
        });

        // Must NOT land on /no-tenant.
        expect(page.url()).not.toContain('/no-tenant');

        // If we landed on the tenant picker, navigate to the acme-corp dashboard.
        if (page.url().includes('/tenants')) {
            // Click the acme-corp workspace link (identified by tenantSlug).
            const acmeLink = page.getByRole('link', { name: new RegExp(tenantSlug, 'i') });
            await acmeLink.waitFor({ timeout: 10_000 });
            await acmeLink.click();
            await page.waitForURL(/\/t\/[^/]+\/dashboard/, {
                waitUntil: 'domcontentloaded',
                timeout: 30_000,
            });
        }

        // Sidebar confirms the page actually rendered.
        const hasSidebar = await page.locator('aside').isVisible().catch(() => false);
        expect(hasSidebar).toBe(true);

        // Capture slug for next test.
        const match = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
        expect(match).not.toBeNull();
        // Confirm the tenant slug matches the one the admin belongs to.
        expect(match![1]).toBe(tenantSlug);
    } finally {
        await ctx.close();
    }
});

// ── 4. Invitee membership has the correct role ─────────────────────────────

test('invitee membership has the correct EDITOR role (admin endpoint returns 403)', async ({
    browser,
}) => {
    // Sign in as the invitee (now a member of the tenant).
    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();

    try {
        // Sign in using the shared helper that handles /tenants picker.
        await signInWithCredentials(page, INVITEE_EMAIL, INVITEE_PASSWORD);

        // If we landed on the tenant picker, navigate to the acme-corp dashboard.
        if (page.url().includes('/tenants')) {
            const acmeLink = page.getByRole('link', { name: new RegExp(tenantSlug, 'i') });
            await acmeLink.waitFor({ timeout: 10_000 });
            await acmeLink.click();
            await page.waitForURL(/\/t\/[^/]+\/dashboard/, {
                waitUntil: 'domcontentloaded',
                timeout: 30_000,
            });
        }

        const match = new URL(page.url()).pathname.match(/^\/t\/([^/]+)\//);
        if (!match) throw new Error('Could not extract slug after invitee sign-in');
        const slug = match[1];

        // EDITOR does NOT have admin.members permission.
        // The admin/members route returns 403 for any role below ADMIN.
        const result = await page.evaluate(async (tenantSlugInner: string) => {
            const res = await fetch(`/api/t/${tenantSlugInner}/admin/members`, {
                credentials: 'include',
            });
            return { status: res.status };
        }, slug);

        expect(result.status).toBe(403);

        // Verify the EDITOR role via the session's memberships array.
        // /api/auth/session returns the full session including memberships[].
        // We find the acme-corp entry and check its role.
        const sessionResult = await page.evaluate(async (tenantSlugInner: string) => {
            const res = await fetch('/api/auth/session', { credentials: 'include' });
            const data = await res.json();
            const memberships: Array<{ slug: string; role: string }> = data?.user?.memberships ?? [];
            const acmeMembership = memberships.find((m) => m.slug === tenantSlugInner);
            return { status: res.status, acmeRole: acmeMembership?.role ?? null };
        }, slug);

        expect(sessionResult.status).toBe(200);
        expect(sessionResult.acmeRole).toBe('EDITOR');
    } finally {
        await ctx.close();
    }
});

// ── 5. Garbage token → preview shows clear error ───────────────────────────

test('invalid token shows a clear error on the preview page', async ({ browser }) => {
    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();

    try {
        // Navigate to a token that cannot possibly exist.
        await safeGoto(page, '/invite/not-a-real-token-00000000000', {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForLoadState('networkidle').catch(() => {});

        // The invite page renders an error card for not-found / expired / revoked tokens.
        await expect(page.getByText(/Invite not available/i)).toBeVisible({ timeout: 30_000 });

        // The accept CTA must not appear.
        await expect(page.getByRole('link', { name: /Sign in to accept/i })).not.toBeVisible();
        await expect(page.getByRole('button', { name: /Accept invitation/i })).not.toBeVisible();
    } finally {
        await ctx.close();
    }
});
