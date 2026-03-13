/**
 * Unit tests for RBAC helpers (Chunk 1: unified Role enum).
 *
 * Tests the permission system with roles: ADMIN, EDITOR, READER, AUDITOR
 */

// @/env is already globally mocked via jest.config.js moduleNameMapper
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(),
    verify: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        user: { findUnique: jest.fn() },
        tenantMembership: { findUnique: jest.fn(), findFirst: jest.fn() },
        scopeMembership: { findFirst: jest.fn() },
        scope: { findUnique: jest.fn() },
    },
}));

import {
    hasMinRole,
    canRead,
    canWrite,
    canAdmin,
    canAudit,
    canExport,
    canEdit,
    requireRole,
} from '@/lib/auth';

describe('RBAC Helpers (Chunk 1)', () => {
    // ─── hasMinRole ───

    describe('hasMinRole', () => {
        it('ADMIN >= all roles', () => {
            expect(hasMinRole('ADMIN', 'ADMIN')).toBe(true);
            expect(hasMinRole('ADMIN', 'EDITOR')).toBe(true);
            expect(hasMinRole('ADMIN', 'READER')).toBe(true);
            expect(hasMinRole('ADMIN', 'AUDITOR')).toBe(true);
        });

        it('EDITOR >= EDITOR, READER, AUDITOR but not ADMIN', () => {
            expect(hasMinRole('EDITOR', 'ADMIN')).toBe(false);
            expect(hasMinRole('EDITOR', 'EDITOR')).toBe(true);
            expect(hasMinRole('EDITOR', 'READER')).toBe(true);
            expect(hasMinRole('EDITOR', 'AUDITOR')).toBe(true);
        });

        it('AUDITOR >= AUDITOR, READER but not EDITOR or ADMIN', () => {
            expect(hasMinRole('AUDITOR', 'ADMIN')).toBe(false);
            expect(hasMinRole('AUDITOR', 'EDITOR')).toBe(false);
            expect(hasMinRole('AUDITOR', 'AUDITOR')).toBe(true);
            expect(hasMinRole('AUDITOR', 'READER')).toBe(true);
        });

        it('READER >= READER only', () => {
            expect(hasMinRole('READER', 'ADMIN')).toBe(false);
            expect(hasMinRole('READER', 'EDITOR')).toBe(false);
            expect(hasMinRole('READER', 'AUDITOR')).toBe(false);
            expect(hasMinRole('READER', 'READER')).toBe(true);
        });
    });

    // ─── Permission helpers ───

    describe('canRead', () => {
        it('all roles can read', () => {
            expect(canRead('ADMIN')).toBe(true);
            expect(canRead('EDITOR')).toBe(true);
            expect(canRead('READER')).toBe(true);
            expect(canRead('AUDITOR')).toBe(true);
        });
    });

    describe('canWrite', () => {
        it('ADMIN and EDITOR can write', () => {
            expect(canWrite('ADMIN')).toBe(true);
            expect(canWrite('EDITOR')).toBe(true);
        });

        it('READER and AUDITOR cannot write', () => {
            expect(canWrite('READER')).toBe(false);
            expect(canWrite('AUDITOR')).toBe(false);
        });
    });

    describe('canAdmin', () => {
        it('only ADMIN can admin', () => {
            expect(canAdmin('ADMIN')).toBe(true);
            expect(canAdmin('EDITOR')).toBe(false);
            expect(canAdmin('READER')).toBe(false);
            expect(canAdmin('AUDITOR')).toBe(false);
        });
    });

    describe('canAudit', () => {
        it('ADMIN and AUDITOR can audit', () => {
            expect(canAudit('ADMIN')).toBe(true);
            expect(canAudit('AUDITOR')).toBe(true);
        });

        it('EDITOR and READER cannot audit', () => {
            expect(canAudit('EDITOR')).toBe(false);
            expect(canAudit('READER')).toBe(false);
        });
    });

    describe('canExport', () => {
        it('ADMIN, EDITOR, AUDITOR can export', () => {
            expect(canExport('ADMIN')).toBe(true);
            expect(canExport('EDITOR')).toBe(true);
            expect(canExport('AUDITOR')).toBe(true);
        });

        it('READER cannot export', () => {
            expect(canExport('READER')).toBe(false);
        });
    });

    describe('canEdit (backward compat alias)', () => {
        it('delegates to canWrite', () => {
            expect(canEdit('ADMIN')).toBe(true);
            expect(canEdit('EDITOR')).toBe(true);
            expect(canEdit('READER')).toBe(false);
            expect(canEdit('AUDITOR')).toBe(false);
        });
    });

    // ─── requireRole ───

    describe('requireRole', () => {
        const makeSession = (role: any) => ({
            userId: 'u1',
            tenantId: 't1',
            email: 'test@test.com',
            role,
        });

        it('does not throw when role is sufficient', () => {
            expect(() => requireRole(makeSession('ADMIN'), 'ADMIN')).not.toThrow();
            expect(() => requireRole(makeSession('ADMIN'), 'EDITOR')).not.toThrow();
            expect(() => requireRole(makeSession('EDITOR'), 'EDITOR')).not.toThrow();
            expect(() => requireRole(makeSession('EDITOR'), 'READER')).not.toThrow();
        });

        it('throws forbidden when role is insufficient', () => {
            expect(() => requireRole(makeSession('READER'), 'EDITOR')).toThrow();
            expect(() => requireRole(makeSession('READER'), 'ADMIN')).toThrow();
            expect(() => requireRole(makeSession('AUDITOR'), 'EDITOR')).toThrow();
        });
    });
});
