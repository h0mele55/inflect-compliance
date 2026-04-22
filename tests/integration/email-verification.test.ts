/**
 * Email-verification flow integration test — hits the real DB.
 *
 * Proves the contract `authenticateWithPassword` + the verify route +
 * `issueEmailVerification` / `consumeEmailVerification` all rely on:
 *
 *   - issue stores ONLY the SHA-256 hash of the raw token (raw never
 *     hits the DB)
 *   - consume accepts the raw token once, flips User.emailVerified,
 *     and deletes the row
 *   - re-consuming the same raw token fails with reason=invalid
 *   - an expired token fails with reason=expired AND is cleaned up
 *   - re-issuing for the same email invalidates the prior token
 *
 * Mailer is replaced with a Stub so we don't actually try to SMTP.
 */

import crypto from 'node:crypto';

import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { PrismaClient } from '@prisma/client';

import { setEmailProvider, StubEmailProvider } from '@/lib/mailer';

const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('Email verification — issue / consume flow', () => {
    let prisma: PrismaClient;
    let stub: StubEmailProvider;
    const uniq = `ev-${Date.now()}`;
    const email = `${uniq}@example.com`;
    let tenantId = '';
    let userId = '';

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();

        stub = new StubEmailProvider();
        setEmailProvider(stub);

        const tenant = await prisma.tenant.create({
            data: { name: 'Verify Test Co', slug: uniq },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: { email, name: 'Ev User', passwordHash: null },
        });
        userId = user.id;
    });

    afterAll(async () => {
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });
        await prisma.tenantMembership.deleteMany({ where: { userId } }).catch(() => {});
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
        await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
        await prisma.$disconnect();
    });

    beforeEach(() => {
        stub.sentMessages = [];
    });

    it('issueEmailVerification stores only the SHA-256 hash, not the raw token', async () => {
        const { issueEmailVerification } = await import('@/lib/auth/email-verification');
        await issueEmailVerification(email, { userId });

        const rows = await prisma.verificationToken.findMany({ where: { identifier: email } });
        expect(rows.length).toBe(1);
        const stored = rows[0].token;
        // 64 hex chars = 256 bits = SHA-256 digest
        expect(stored).toMatch(/^[a-f0-9]{64}$/);

        // The raw token should be in the sent email — extract it
        expect(stub.sentMessages.length).toBe(1);
        const body = stub.sentMessages[0].text;
        const match = body.match(/token=([a-f0-9]{64})/);
        expect(match).toBeTruthy();
        const raw = match![1];
        // Raw must NOT equal the stored hash (that'd defeat the point)
        expect(raw).not.toBe(stored);
        // Raw hashed MUST equal the stored hash
        const rawHash = crypto.createHash('sha256').update(raw).digest('hex');
        expect(rawHash).toBe(stored);
    });

    it('consumeEmailVerification sets emailVerified and deletes the token row', async () => {
        const { issueEmailVerification, consumeEmailVerification } = await import(
            '@/lib/auth/email-verification'
        );

        // Reset state: no prior emailVerified, no leftover tokens
        await prisma.user.update({ where: { id: userId }, data: { emailVerified: null } });
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });

        await issueEmailVerification(email, { userId });
        const raw = stub.sentMessages[0].text.match(/token=([a-f0-9]{64})/)![1];

        const result = await consumeEmailVerification(raw);
        expect(result).toEqual({ ok: true, userId, email });

        const userAfter = await prisma.user.findUnique({ where: { id: userId } });
        expect(userAfter?.emailVerified).toBeInstanceOf(Date);

        const rowsAfter = await prisma.verificationToken.findMany({
            where: { identifier: email },
        });
        expect(rowsAfter.length).toBe(0);
    });

    it('re-consuming the same token returns invalid (single-use)', async () => {
        const { issueEmailVerification, consumeEmailVerification } = await import(
            '@/lib/auth/email-verification'
        );
        await prisma.user.update({ where: { id: userId }, data: { emailVerified: null } });
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });

        await issueEmailVerification(email, { userId });
        const raw = stub.sentMessages[0].text.match(/token=([a-f0-9]{64})/)![1];

        const first = await consumeEmailVerification(raw);
        expect(first.ok).toBe(true);

        const second = await consumeEmailVerification(raw);
        expect(second).toEqual({ ok: false, reason: 'invalid' });
    });

    it('expired tokens are rejected and cleaned up', async () => {
        const { consumeEmailVerification } = await import(
            '@/lib/auth/email-verification'
        );
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });

        // Hand-craft an already-expired token row
        const raw = crypto.randomBytes(32).toString('hex');
        const hash = crypto.createHash('sha256').update(raw).digest('hex');
        await prisma.verificationToken.create({
            data: {
                identifier: email,
                token: hash,
                expires: new Date(Date.now() - 60_000),
            },
        });

        const result = await consumeEmailVerification(raw);
        expect(result).toEqual({ ok: false, reason: 'expired' });

        // Row should have been deleted
        const rows = await prisma.verificationToken.findMany({ where: { identifier: email } });
        expect(rows.length).toBe(0);
    });

    it('re-issuing replaces any prior token for the same email', async () => {
        const { issueEmailVerification, consumeEmailVerification } = await import(
            '@/lib/auth/email-verification'
        );
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });
        await prisma.user.update({ where: { id: userId }, data: { emailVerified: null } });

        await issueEmailVerification(email, { userId });
        const firstRaw = stub.sentMessages[0].text.match(/token=([a-f0-9]{64})/)![1];

        // Second issue — should invalidate the first
        stub.sentMessages = [];
        await issueEmailVerification(email, { userId });
        const secondRaw = stub.sentMessages[0].text.match(/token=([a-f0-9]{64})/)![1];
        expect(secondRaw).not.toBe(firstRaw);

        const rows = await prisma.verificationToken.findMany({
            where: { identifier: email },
        });
        expect(rows.length).toBe(1); // Only the second token survives

        const firstAttempt = await consumeEmailVerification(firstRaw);
        expect(firstAttempt).toEqual({ ok: false, reason: 'invalid' });

        const secondAttempt = await consumeEmailVerification(secondRaw);
        expect(secondAttempt.ok).toBe(true);
    });
});
