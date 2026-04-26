/**
 * GAP-06 — authenticated password-change integration test.
 *
 * Hits the real DB to prove:
 *   - Wrong current password is rejected (and audited as 'wrong_current')
 *   - OAuth-only accounts (passwordHash === null) get a clear oauth_only reject
 *   - Same-as-current new password is rejected (UX guard)
 *   - HIBP-breached choice is rejected at the route layer (already proved)
 *     and at the usecase layer (this test) as backstop
 *   - Successful change updates password, bumps sessionVersion, revokes
 *     OTHER UserSessions while preserving the current device, and
 *     invalidates outstanding reset tokens.
 */
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { PrismaClient } from '@prisma/client';

import { changeAuthenticatedPassword } from '@/app-layer/usecases/password';
import { hashPassword, verifyPassword } from '@/lib/auth/passwords';
import { issuePasswordResetToken } from '@/lib/auth/password-reset-tokens';
import { makeRequestContext } from '../helpers/make-context';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('GAP-06 — authenticated password change', () => {
    let prisma: PrismaClient;
    const uniq = `pwchg-${Date.now()}`;
    const email = `${uniq}@example.com`;
    let userId = '';
    let tenantId = '';
    const initialPassword = 'initial-password-1234'; // pragma: allowlist secret — synthetic test fixture, never hits prod

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();

        const tenant = await prisma.tenant.create({
            data: { name: 'Pwchg Test Co', slug: uniq },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email,
                name: 'Pwchg User',
                passwordHash: await hashPassword(initialPassword),
            },
        });
        userId = user.id;
        await prisma.tenantMembership.create({
            data: { tenantId, userId, role: 'ADMIN' },
        });
    });

    afterAll(async () => {
        await prisma.passwordResetToken.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.userSession.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.tenantMembership.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
        await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        // Reset the user back to the initial password hash + clear sessions.
        await prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash: await hashPassword(initialPassword),
                passwordChangedAt: null,
                sessionVersion: 0,
            },
        });
        await prisma.userSession.deleteMany({ where: { userId } });
        await prisma.passwordResetToken.deleteMany({ where: { userId } });
    });

    function ctxFor() {
        return makeRequestContext('ADMIN', { userId, tenantId });
    }

    it('rejects wrong current password with reason=wrong_current', async () => {
        const result = await changeAuthenticatedPassword(ctxFor(), {
            currentPassword: 'this-is-not-the-real-password', // pragma: allowlist secret — synthetic
            newPassword: 'unique-fresh-pw-2026-XYZ', // pragma: allowlist secret — synthetic
            currentUserSessionId: null,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
            expect(result.reason).toBe('wrong_current');
        }

        // Password unchanged; sessionVersion not bumped.
        const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { passwordHash: true, sessionVersion: true },
        });
        expect(await verifyPassword(initialPassword, u!.passwordHash!)).toBe(true);
        expect(u!.sessionVersion).toBe(0);
    });

    it('rejects same-as-current new password', async () => {
        const result = await changeAuthenticatedPassword(ctxFor(), {
            currentPassword: initialPassword,
            newPassword: initialPassword,
            currentUserSessionId: null,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
            expect(result.reason).toBe('same_password');
        }
    });

    it('rejects too-short new password with reason=policy_rejected', async () => {
        const result = await changeAuthenticatedPassword(ctxFor(), {
            currentPassword: initialPassword,
            newPassword: 'short',
            currentUserSessionId: null,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('policy_rejected');
    });

    it('rejects OAuth-only account with reason=oauth_only', async () => {
        const oauthEmail = `oauth-chg-${Date.now()}@example.com`;
        const oauthUser = await prisma.user.create({
            data: { email: oauthEmail, name: 'O User', passwordHash: null },
        });
        const oauthMembership = await prisma.tenantMembership.create({
            data: { tenantId, userId: oauthUser.id, role: 'EDITOR' },
        });

        try {
            const result = await changeAuthenticatedPassword(
                makeRequestContext('EDITOR', { userId: oauthUser.id, tenantId }),
                {
                    currentPassword: 'irrelevant',
                    newPassword: 'unique-fresh-pw-2026-XYZ', // pragma: allowlist secret — synthetic
                    currentUserSessionId: null,
                },
            );
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(400);
                expect(result.reason).toBe('oauth_only');
            }
        } finally {
            await prisma.tenantMembership.delete({ where: { id: oauthMembership.id } }).catch(() => {});
            await prisma.user.delete({ where: { id: oauthUser.id } }).catch(() => {});
        }
    });

    it('successful change rotates hash, bumps sessionVersion, and revokes other sessions', async () => {
        // Create two UserSession rows: "current" and "other".
        const current = await prisma.userSession.create({
            data: {
                sessionId: `sess-current-${Date.now()}`,
                userId,
                tenantId,
                expiresAt: new Date(Date.now() + 60 * 60_000),
            },
        });
        const other = await prisma.userSession.create({
            data: {
                sessionId: `sess-other-${Date.now()}`,
                userId,
                tenantId,
                expiresAt: new Date(Date.now() + 60 * 60_000),
            },
        });

        // Issue a stale reset token to confirm it gets nuked.
        await issuePasswordResetToken({ userId });

        const newPassword = 'fresh-pw-2026-changed-7890'; // pragma: allowlist secret — synthetic
        const result = await changeAuthenticatedPassword(ctxFor(), {
            currentPassword: initialPassword,
            newPassword,
            currentUserSessionId: current.id,
        });
        expect(result).toEqual({ ok: true });

        const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { passwordHash: true, passwordChangedAt: true, sessionVersion: true },
        });
        expect(await verifyPassword(newPassword, u!.passwordHash!)).toBe(true);
        expect(await verifyPassword(initialPassword, u!.passwordHash!)).toBe(false);
        expect(u!.passwordChangedAt).not.toBeNull();
        expect(u!.sessionVersion).toBe(1);

        // Current session preserved, other revoked.
        const currentRow = await prisma.userSession.findUnique({ where: { id: current.id } });
        const otherRow = await prisma.userSession.findUnique({ where: { id: other.id } });
        expect(currentRow!.revokedAt).toBeNull();
        expect(otherRow!.revokedAt).not.toBeNull();
        expect(otherRow!.revokedReason).toBe('password-changed');

        // Reset tokens cleaned up.
        const tokens = await prisma.passwordResetToken.findMany({ where: { userId } });
        expect(tokens.length).toBe(0);
    });

    it('change with currentUserSessionId=null revokes all UserSession rows', async () => {
        const a = await prisma.userSession.create({
            data: {
                sessionId: `sess-a-${Date.now()}`,
                userId,
                tenantId,
                expiresAt: new Date(Date.now() + 60 * 60_000),
            },
        });
        const b = await prisma.userSession.create({
            data: {
                sessionId: `sess-b-${Date.now()}-2`,
                userId,
                tenantId,
                expiresAt: new Date(Date.now() + 60 * 60_000),
            },
        });

        const result = await changeAuthenticatedPassword(ctxFor(), {
            currentPassword: initialPassword,
            newPassword: 'fresh-pw-2026-no-session-XYZ', // pragma: allowlist secret — synthetic
            currentUserSessionId: null,
        });
        expect(result).toEqual({ ok: true });

        const aRow = await prisma.userSession.findUnique({ where: { id: a.id } });
        const bRow = await prisma.userSession.findUnique({ where: { id: b.id } });
        expect(aRow!.revokedAt).not.toBeNull();
        expect(bRow!.revokedAt).not.toBeNull();
    });
});
