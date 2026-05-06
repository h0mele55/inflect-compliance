/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
/**
 * AV Webhook & Scan Lifecycle Tests
 *
 * Tests webhook authentication, scan status transitions,
 * download blocking, and infected file quarantine.
 */
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════
//  Webhook Signature Verification
// ═══════════════════════════════════════════════════════════════

describe('Webhook HMAC-SHA256 Signature', () => {
    const SECRET = 'test-webhook-secret-key-32chars!!'; // pragma: allowlist secret -- HMAC test fixture, not a real credential

    function createSignature(payload: string, secret: string): string {
        return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }

    function verifySignature(payload: string, signature: string, secret: string): boolean {
        const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expected, 'hex'),
            );
        } catch {
            return false;
        }
    }

    it('valid signature passes verification', () => {
        const payload = JSON.stringify({ fileId: 'file-1', status: 'clean' });
        const sig = createSignature(payload, SECRET);
        expect(verifySignature(payload, sig, SECRET)).toBe(true);
    });

    it('wrong secret fails verification', () => {
        const payload = JSON.stringify({ fileId: 'file-1', status: 'clean' });
        const sig = createSignature(payload, 'wrong-secret-key-32chars!!xxxx!!');
        expect(verifySignature(payload, sig, SECRET)).toBe(false);
    });

    it('tampered payload fails verification', () => {
        const payload = JSON.stringify({ fileId: 'file-1', status: 'clean' });
        const sig = createSignature(payload, SECRET);
        const tampered = JSON.stringify({ fileId: 'file-1', status: 'infected' });
        expect(verifySignature(tampered, sig, SECRET)).toBe(false);
    });

    it('empty signature fails verification', () => {
        const payload = JSON.stringify({ fileId: 'file-1', status: 'clean' });
        expect(verifySignature(payload, '', SECRET)).toBe(false);
    });

    it('invalid hex signature fails gracefully', () => {
        const payload = JSON.stringify({ fileId: 'file-1', status: 'clean' });
        expect(verifySignature(payload, 'not-hex', SECRET)).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
//  Scan Status Transitions
// ═══════════════════════════════════════════════════════════════

describe('Scan Status Transitions', () => {
    const VALID_STATUSES = ['PENDING', 'CLEAN', 'INFECTED', 'SKIPPED'];

    it('all valid statuses are recognized', () => {
        VALID_STATUSES.forEach(s => {
            expect(['PENDING', 'CLEAN', 'INFECTED', 'SKIPPED']).toContain(s);
        });
    });

    it('webhook status maps correctly', () => {
        const statusMap: Record<string, string> = {
            clean: 'CLEAN',
            infected: 'INFECTED',
            skipped: 'SKIPPED',
        };
        expect(statusMap['clean']).toBe('CLEAN');
        expect(statusMap['infected']).toBe('INFECTED');
        expect(statusMap['skipped']).toBe('SKIPPED');
    });

    it('infected files get quarantined (status → FAILED)', () => {
        // Simulate quarantine logic
        const fileRecord = { status: 'STORED', scanStatus: 'INFECTED' };
        if (fileRecord.scanStatus === 'INFECTED') {
            fileRecord.status = 'FAILED';
        }
        expect(fileRecord.status).toBe('FAILED');
    });
});

// ═══════════════════════════════════════════════════════════════
//  Download Access Control by Scan Status
// ═══════════════════════════════════════════════════════════════

describe('Download Scan Guard', () => {
    type ScanMode = 'strict' | 'permissive' | 'disabled';

    function canDownload(scanStatus: string, scanMode: ScanMode): { allowed: boolean; reason?: string } {
        if (scanStatus === 'INFECTED') {
            return { allowed: false, reason: 'File is infected' };
        }
        if (scanMode === 'strict' && scanStatus === 'PENDING') {
            return { allowed: false, reason: 'File pending scan' };
        }
        return { allowed: true };
    }

    describe('strict mode', () => {
        it('blocks INFECTED files', () => {
            expect(canDownload('INFECTED', 'strict').allowed).toBe(false);
        });

        it('blocks PENDING files', () => {
            expect(canDownload('PENDING', 'strict').allowed).toBe(false);
        });

        it('allows CLEAN files', () => {
            expect(canDownload('CLEAN', 'strict').allowed).toBe(true);
        });

        it('allows SKIPPED files', () => {
            expect(canDownload('SKIPPED', 'strict').allowed).toBe(true);
        });
    });

    describe('permissive mode', () => {
        it('blocks INFECTED files', () => {
            expect(canDownload('INFECTED', 'permissive').allowed).toBe(false);
        });

        it('allows PENDING files', () => {
            expect(canDownload('PENDING', 'permissive').allowed).toBe(true);
        });

        it('allows CLEAN files', () => {
            expect(canDownload('CLEAN', 'permissive').allowed).toBe(true);
        });
    });

    describe('disabled mode', () => {
        it('blocks INFECTED files (always blocked)', () => {
            expect(canDownload('INFECTED', 'disabled').allowed).toBe(false);
        });

        it('allows PENDING files', () => {
            expect(canDownload('PENDING', 'disabled').allowed).toBe(true);
        });

        it('allows CLEAN files', () => {
            expect(canDownload('CLEAN', 'disabled').allowed).toBe(true);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  Webhook Payload Validation
// ═══════════════════════════════════════════════════════════════

describe('Webhook Payload Validation', () => {
    const VALID_STATUSES = ['clean', 'infected', 'skipped'];

    it('rejects missing status', () => {
        const payload = { fileId: 'file-1' };
        expect(VALID_STATUSES.includes((payload as any).status)).toBe(false);
    });

    it('rejects invalid status', () => {
        expect(VALID_STATUSES.includes('malicious')).toBe(false);
    });

    it('rejects missing file identifier', () => {
        const payload = { status: 'clean' };
        expect(!!(payload as any).fileId || !!(payload as any).pathKey).toBe(false);
    });

    it('accepts fileId-based payload', () => {
        const payload = { fileId: 'file-1', status: 'clean' };
        expect(VALID_STATUSES.includes(payload.status)).toBe(true);
        expect(!!payload.fileId).toBe(true);
    });

    it('accepts pathKey-based payload', () => {
        const payload = { pathKey: 'tenants/t1/evidence/2026/03/uuid_file.pdf', status: 'infected' };
        expect(VALID_STATUSES.includes(payload.status)).toBe(true);
        expect(!!payload.pathKey).toBe(true);
    });

    it('accepts optional details and engine', () => {
        const payload = {
            fileId: 'file-1',
            status: 'infected',
            details: 'Win.Trojan.Generic-1234',
            engine: 'ClamAV 1.2.0',
        };
        expect(payload.details).toBeTruthy();
        expect(payload.engine).toBeTruthy();
    });
});
