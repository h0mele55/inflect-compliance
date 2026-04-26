/**
 * GAP-06 — audit-event emission contract.
 *
 * Asserts the load-bearing audit shape that downstream SIEM
 * integrations and the Epic C.4 audit-stream consumer rely on:
 *
 *   - Every password lifecycle recorder writes an entry via
 *     appendAuditEntry with the correct AUTH_PASSWORD_* action name.
 *   - detailsJson uses category='custom' with a nested `auth` block
 *     (mirrors recordLoginSuccess, so the streamer's privacy posture
 *     — drop free-text `details`, ship `detailsJson` — carries
 *     through unchanged).
 *   - identifierHash is a 16-char SHA-256 prefix, never the raw email.
 *   - The reason field flows into the auth block on failure variants.
 *
 * Recorders are tested directly. The route + usecase paths exercise
 * them in `tests/integration/password-reset-flow.test.ts` and
 * `tests/integration/password-change-flow.test.ts`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const appendAuditEntryMock = jest.fn<Promise<{ id: string; entryHash: string; previousHash: string | null }>, [any]>(
    async () => ({ id: 'audit-1', entryHash: 'h', previousHash: null }),
);

jest.mock('@/lib/audit', () => ({
    __esModule: true,
    appendAuditEntry: appendAuditEntryMock,
}));

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        tenantMembership: {
            findFirst: jest.fn(async () => ({ tenantId: 'tenant-1' })),
        },
    },
    prisma: {
        tenantMembership: {
            findFirst: jest.fn(async () => ({ tenantId: 'tenant-1' })),
        },
    },
}));

import {
    AUTH_ACTIONS,
    recordPasswordResetRequested,
    recordPasswordResetCompleted,
    recordPasswordResetFailed,
    recordPasswordChanged,
    recordPasswordChangeFailed,
    hashEmailForLog,
} from '@/lib/auth/security-events';

beforeEach(() => {
    appendAuditEntryMock.mockClear();
});

interface CapturedAuditCall {
    tenantId: string;
    userId: string;
    action: string;
    entity: string;
    actorType: string;
    detailsJson: { category: string; auth: { method: string; identifierHash: string; reason?: string } };
}

function lastCall(): CapturedAuditCall {
    expect(appendAuditEntryMock).toHaveBeenCalledTimes(1);
    const calls = appendAuditEntryMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[0]?.[0] as unknown as CapturedAuditCall;
}

describe('GAP-06 — audit-event emission shape', () => {
    it('AUTH_ACTIONS exposes the six new password-lifecycle entries', () => {
        expect(AUTH_ACTIONS.PASSWORD_RESET_REQUESTED).toBe('AUTH_PASSWORD_RESET_REQUESTED');
        expect(AUTH_ACTIONS.PASSWORD_RESET_REQUESTED_UNKNOWN_TARGET).toBe(
            'AUTH_PASSWORD_RESET_REQUESTED_UNKNOWN_TARGET',
        );
        expect(AUTH_ACTIONS.PASSWORD_RESET_COMPLETED).toBe('AUTH_PASSWORD_RESET_COMPLETED');
        expect(AUTH_ACTIONS.PASSWORD_RESET_FAILED).toBe('AUTH_PASSWORD_RESET_FAILED');
        expect(AUTH_ACTIONS.PASSWORD_CHANGED).toBe('AUTH_PASSWORD_CHANGED');
        expect(AUTH_ACTIONS.PASSWORD_CHANGE_FAILED).toBe('AUTH_PASSWORD_CHANGE_FAILED');
    });

    it('recordPasswordResetRequested writes AUTH_PASSWORD_RESET_REQUESTED with hashed identifier', async () => {
        await recordPasswordResetRequested({
            userId: 'user-1',
            email: 'alice@example.com',
            tenantId: 'tenant-1',
            requestId: 'req-1',
        });
        const call = lastCall();
        expect(call.action).toBe('AUTH_PASSWORD_RESET_REQUESTED');
        expect(call.tenantId).toBe('tenant-1');
        expect(call.userId).toBe('user-1');
        expect(call.entity).toBe('Auth');
        expect(call.actorType).toBe('USER');
        expect(call.detailsJson.category).toBe('custom');
        expect(call.detailsJson.auth.method).toBe('credentials');
        expect(call.detailsJson.auth.identifierHash).toBe(hashEmailForLog('alice@example.com'));
        // Raw email MUST NOT appear anywhere in the payload.
        expect(JSON.stringify(call.detailsJson)).not.toContain('alice@example.com');
    });

    it('recordPasswordResetCompleted writes AUTH_PASSWORD_RESET_COMPLETED', async () => {
        await recordPasswordResetCompleted({
            userId: 'user-1',
            email: 'alice@example.com',
            tenantId: 'tenant-1',
        });
        expect(lastCall().action).toBe('AUTH_PASSWORD_RESET_COMPLETED');
    });

    it('recordPasswordResetFailed flows reason into the auth block (when user resolved)', async () => {
        await recordPasswordResetFailed({
            userId: 'user-1',
            email: 'alice@example.com',
            reason: 'breached_password',
        });
        const call = lastCall();
        expect(call.action).toBe('AUTH_PASSWORD_RESET_FAILED');
        expect(call.detailsJson.auth.reason).toBe('breached_password');
    });

    it('recordPasswordResetFailed with null user/email writes no audit row', async () => {
        // Anti-enumeration: the reset endpoint also logs failures for
        // unknown targets. Without a resolved tenant we MUST NOT write
        // the audit row (no tenantId to attribute to). pino logger
        // still picks it up for SRE visibility — that's tested by
        // observing the function does not throw.
        await recordPasswordResetFailed({
            userId: null,
            email: null,
            reason: 'invalid_token',
        });
        expect(appendAuditEntryMock).not.toHaveBeenCalled();
    });

    it('recordPasswordChanged writes AUTH_PASSWORD_CHANGED with explicit tenantId', async () => {
        await recordPasswordChanged({
            userId: 'user-1',
            email: 'alice@example.com',
            tenantId: 'tenant-2',
        });
        const call = lastCall();
        expect(call.action).toBe('AUTH_PASSWORD_CHANGED');
        expect(call.tenantId).toBe('tenant-2');
        expect(call.detailsJson.auth.method).toBe('credentials');
    });

    it('recordPasswordChangeFailed flows wrong_current reason', async () => {
        await recordPasswordChangeFailed({
            userId: 'user-1',
            email: 'alice@example.com',
            tenantId: 'tenant-1',
            reason: 'wrong_current',
        });
        const call = lastCall();
        expect(call.action).toBe('AUTH_PASSWORD_CHANGE_FAILED');
        expect(call.detailsJson.auth.reason).toBe('wrong_current');
    });
});
