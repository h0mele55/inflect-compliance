/**
 * GAP-06 — password-reset flow integration test.
 *
 * Hits the real DB to prove the contract that the production routes
 * rely on:
 *   - issuePasswordResetToken stores ONLY the sha256 hash (raw token
 *     never lands in the DB), TTL is 30 minutes from issuance,
 *     prior outstanding tokens for the same user are deleted.
 *   - consumePasswordResetToken atomically claims a single-use row;
 *     concurrent claims with the same raw token resolve to exactly
 *     one success and N-1 'used' failures.
 *   - The full requestPasswordReset → consumePasswordReset flow
 *     updates the password hash, bumps sessionVersion, and invalidates
 *     leftover reset tokens.
 *   - HIBP-breached / policy-rejected new passwords don't burn the
 *     token (it remains valid for retry).
 *
 * Mailer is replaced with a Stub so we don't actually try to SMTP.
 */
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { PrismaClient } from '@prisma/client';

import { setEmailProvider, StubEmailProvider } from '@/lib/mailer';
import {
    generateRawResetToken,
    hashResetToken,
    issuePasswordResetToken,
    consumePasswordResetToken,
    PASSWORD_RESET_TOKEN_TTL_MS,
} from '@/lib/auth/password-reset-tokens';
import {
    requestPasswordReset,
    consumePasswordReset,
} from '@/app-layer/usecases/password';
import { hashPassword, verifyPassword } from '@/lib/auth/passwords';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('GAP-06 — password reset flow', () => {
    let prisma: PrismaClient;
    let stub: StubEmailProvider;
    const uniq = `pwreset-${Date.now()}`;
    const email = `${uniq}@example.com`;
    let userId = '';
    let tenantId = '';
    const initialPassword = 'initial-password-1234'; // pragma: allowlist secret — synthetic test fixture, never hits prod

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();

        stub = new StubEmailProvider();
        setEmailProvider(stub);

        const tenant = await prisma.tenant.create({
            data: { name: 'Pwreset Test Co', slug: uniq },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email,
                name: 'Pwreset User',
                passwordHash: await hashPassword(initialPassword),
            },
        });
        userId = user.id;
        await prisma.tenantMembership.create({
            data: { tenantId, userId, role: 'ADMIN' },
        });
    });

    afterAll(async () => {
        await prisma.passwordResetToken.deleteMany({ where: { userId } });
        await prisma.tenantMembership.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
        await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        stub.sentMessages = [];
        await prisma.passwordResetToken.deleteMany({ where: { userId } });
    });

    // ── Token primitives ───────────────────────────────────────────────

    it('issuePasswordResetToken stores only the sha256 hash, not the raw token', async () => {
        const result = await issuePasswordResetToken({ userId });

        const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
        expect(rows.length).toBe(1);

        // Stored value must be 64-char hex (sha256), not the raw token
        expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
        expect(rows[0].tokenHash).not.toBe(result.rawToken);
        expect(rows[0].tokenHash).toBe(hashResetToken(result.rawToken));

        // TTL is 30 minutes (give or take a small clock skew)
        const ttl = rows[0].expiresAt.getTime() - rows[0].createdAt.getTime();
        expect(ttl).toBeGreaterThan(PASSWORD_RESET_TOKEN_TTL_MS - 5000);
        expect(ttl).toBeLessThan(PASSWORD_RESET_TOKEN_TTL_MS + 5000);

        expect(rows[0].usedAt).toBeNull();
    });

    it('issuing a second token invalidates the first', async () => {
        const first = await issuePasswordResetToken({ userId });
        const second = await issuePasswordResetToken({ userId });
        expect(first.rawToken).not.toBe(second.rawToken);

        const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
        // Only the second token survives.
        expect(rows.length).toBe(1);
        expect(rows[0].tokenHash).toBe(hashResetToken(second.rawToken));

        // First token can no longer be consumed.
        const claim = await consumePasswordResetToken(first.rawToken);
        expect(claim.ok).toBe(false);
        if (!claim.ok) expect(claim.reason).toBe('invalid');
    });

    it('consumePasswordResetToken atomically claims single-use', async () => {
        const issued = await issuePasswordResetToken({ userId });

        // First claim wins.
        const a = await consumePasswordResetToken(issued.rawToken);
        expect(a).toEqual({ ok: true, userId });

        // Second claim returns 'used'.
        const b = await consumePasswordResetToken(issued.rawToken);
        expect(b.ok).toBe(false);
        if (!b.ok) expect(b.reason).toBe('used');
    });

    it('consumePasswordResetToken handles concurrent claims atomically', async () => {
        const issued = await issuePasswordResetToken({ userId });

        // Fire 5 concurrent claims with the same raw token. Exactly one
        // wins; the other 4 see the row already used.
        const results = await Promise.all(
            Array.from({ length: 5 }, () => consumePasswordResetToken(issued.rawToken)),
        );
        const wins = results.filter((r) => r.ok).length;
        const losses = results.filter((r) => !r.ok).length;
        expect(wins).toBe(1);
        expect(losses).toBe(4);
        for (const loss of results.filter((r) => !r.ok)) {
            if (!loss.ok) expect(loss.reason).toBe('used');
        }
    });

    it('expired tokens fail with reason=expired', async () => {
        // Issue then forcibly age the row past expiry.
        const issued = await issuePasswordResetToken({ userId });
        await prisma.passwordResetToken.update({
            where: { tokenHash: hashResetToken(issued.rawToken) },
            data: { expiresAt: new Date(Date.now() - 60_000) },
        });

        const claim = await consumePasswordResetToken(issued.rawToken);
        expect(claim.ok).toBe(false);
        if (!claim.ok) expect(claim.reason).toBe('expired');
    });

    it('a totally fabricated raw token fails with reason=invalid', async () => {
        const fakeRaw = generateRawResetToken();
        const claim = await consumePasswordResetToken(fakeRaw);
        expect(claim.ok).toBe(false);
        if (!claim.ok) expect(claim.reason).toBe('invalid');
    });

    // ── End-to-end forgot → reset cycle ────────────────────────────────

    it('full forgot → reset cycle updates password and bumps sessionVersion', async () => {
        const userBefore = await prisma.user.findUnique({
            where: { id: userId },
            select: { sessionVersion: true, passwordHash: true, passwordChangedAt: true },
        });

        await requestPasswordReset({ email });

        // Token now exists; raw token is in the sent email body.
        const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
        expect(rows.length).toBe(1);
        expect(stub.sentMessages.length).toBe(1);
        const sentBody = stub.sentMessages[0].text;
        const match = sentBody.match(/token=([a-f0-9]{64})/);
        expect(match).toBeTruthy();
        const rawToken = match![1];

        // Sanity: hashing the raw token reproduces the stored hash.
        expect(hashResetToken(rawToken)).toBe(rows[0].tokenHash);

        // Reset the password.
        const newPassword = 'brand-new-password-9876-XYZ'; // pragma: allowlist secret — synthetic
        const result = await consumePasswordReset({ token: rawToken, newPassword });
        expect(result.ok).toBe(true);

        // Side effects:
        const userAfter = await prisma.user.findUnique({
            where: { id: userId },
            select: { sessionVersion: true, passwordHash: true, passwordChangedAt: true },
        });
        expect(userAfter!.sessionVersion).toBe(userBefore!.sessionVersion + 1);
        expect(userAfter!.passwordHash).not.toBe(userBefore!.passwordHash);
        expect(userAfter!.passwordChangedAt).not.toBeNull();

        // New password verifies; old password does not.
        const newOk = await verifyPassword(newPassword, userAfter!.passwordHash!);
        expect(newOk).toBe(true);
        const oldOk = await verifyPassword(initialPassword, userAfter!.passwordHash!);
        expect(oldOk).toBe(false);

        // Reset tokens are gone.
        const remaining = await prisma.passwordResetToken.findMany({ where: { userId } });
        expect(remaining.length).toBe(0);

        // Restore the initial password for downstream tests in this suite.
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: await hashPassword(initialPassword) },
        });
    });

    it('reset rejects too-short passwords and leaves the token intact', async () => {
        await requestPasswordReset({ email });
        const sentBody = stub.sentMessages[0].text;
        const rawToken = sentBody.match(/token=([a-f0-9]{64})/)![1];

        const result = await consumePasswordReset({
            token: rawToken,
            newPassword: 'short', // < 8 chars
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
            expect(result.reason).toBe('policy_rejected');
        }

        // Token row is still present and unused — user can retry.
        const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
        expect(rows.length).toBe(1);
        expect(rows[0].usedAt).toBeNull();
    });

    it('forgot-password for unknown email is silent (no token, no email)', async () => {
        await requestPasswordReset({ email: 'nobody-by-this-name@example.invalid' });

        // No token row, no email sent.
        const allRows = await prisma.passwordResetToken.findMany({});
        expect(allRows.find((r) => r.userId === userId)).toBeUndefined();
        expect(stub.sentMessages.length).toBe(0);
    });

    it('forgot-password for OAuth-only user (no passwordHash) is silent', async () => {
        const oauthEmail = `oauth-${Date.now()}@example.com`;
        const oauthUser = await prisma.user.create({
            data: { email: oauthEmail, name: 'O User', passwordHash: null },
        });

        try {
            await requestPasswordReset({ email: oauthEmail });
            const rows = await prisma.passwordResetToken.findMany({
                where: { userId: oauthUser.id },
            });
            expect(rows.length).toBe(0);
            expect(stub.sentMessages.length).toBe(0);
        } finally {
            await prisma.user.delete({ where: { id: oauthUser.id } }).catch(() => {});
        }
    });
});
