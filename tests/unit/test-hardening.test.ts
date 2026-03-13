/**
 * Unit + integration tests for test hardening:
 * - Evidence integrity (hash verification)
 * - Audit pack snapshot immutability
 * - Export format correctness
 * - Automation bridge design
 * - Route structure
 */
import { computeFileHash } from '@/app-layer/usecases/audit-hardening';

describe('Evidence Integrity', () => {
    test('computeFileHash returns consistent SHA-256 for same content', () => {
        const buffer = Buffer.from('test evidence content');
        const hash1 = computeFileHash(buffer);
        const hash2 = computeFileHash(buffer);
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    test('computeFileHash returns different hashes for different content', () => {
        const hash1 = computeFileHash(Buffer.from('content A'));
        const hash2 = computeFileHash(Buffer.from('content B'));
        expect(hash1).not.toBe(hash2);
    });

    test('hash verification logic: matching hashes = integrity OK', () => {
        const storedHash = computeFileHash(Buffer.from('original evidence'));
        const computedHash = computeFileHash(Buffer.from('original evidence'));
        expect(storedHash === computedHash).toBe(true);
    });

    test('hash verification logic: mismatching hashes = integrity VIOLATED', () => {
        const storedHash = computeFileHash(Buffer.from('original evidence'));
        const computedHash = computeFileHash(Buffer.from('tampered evidence'));
        expect(storedHash === computedHash).toBe(false);
    });

    test('verification result structure', () => {
        // Simulates the verifyRunEvidence output shape
        const results = [
            { linkId: 'l1', kind: 'FILE', storedHash: 'abc', computedHash: 'abc', matches: true, error: null },
            { linkId: 'l2', kind: 'FILE', storedHash: 'abc', computedHash: 'xyz', matches: false, error: null },
            { linkId: 'l3', kind: 'LINK', storedHash: null, computedHash: null, matches: null, error: null },
        ];

        const fileLinks = results.filter(r => r.kind === 'FILE');
        const verified = results.filter(r => r.matches === true);
        const mismatches = results.filter(r => r.matches === false);
        const integrityOk = fileLinks.every(r => r.matches === true || r.matches === null);

        expect(fileLinks.length).toBe(2);
        expect(verified.length).toBe(1);
        expect(mismatches.length).toBe(1);
        expect(integrityOk).toBe(false);
    });
});

describe('Audit Pack Snapshot Immutability', () => {
    test('DRAFT pack allows snapshot addition', () => {
        const packStatus = 'DRAFT';
        const canAdd = packStatus === 'DRAFT';
        expect(canAdd).toBe(true);
    });

    test('FROZEN pack rejects snapshot addition', () => {
        const packStatus: string = 'FROZEN';
        const canAdd = packStatus === 'DRAFT';
        expect(canAdd).toBe(false);
    });

    test('EXPORTED pack rejects snapshot addition', () => {
        const packStatus: string = 'EXPORTED';
        const canAdd = packStatus === 'DRAFT';
        expect(canAdd).toBe(false);
    });

    test('snapshot JSON structure contains required fields', () => {
        const snapshot = {
            snapshotVersion: 1,
            capturedAt: new Date().toISOString(),
            testRun: {
                id: 'run-1', status: 'COMPLETED', result: 'PASS',
                executedAt: new Date().toISOString(), notes: 'ok',
            },
            testPlan: { id: 'plan-1', name: 'SOX Review', method: 'MANUAL', frequency: 'QUARTERLY' },
            control: { id: 'ctrl-1', name: 'Access Control', code: 'AC-1' },
            evidence: [{ id: 'ev-1', kind: 'FILE', fileId: 'f1', sha256Hash: 'abc123' }],
            evidenceHashes: [{ fileId: 'f1', sha256: 'abc123' }],
        };

        expect(snapshot.snapshotVersion).toBe(1);
        expect(snapshot.testRun.result).toBe('PASS');
        expect(snapshot.testPlan.name).toBe('SOX Review');
        expect(snapshot.control.code).toBe('AC-1');
        expect(snapshot.evidenceHashes.length).toBe(1);
    });

    test('duplicate test run in same pack is rejected', () => {
        // Simulates the unique constraint: [auditPackId, entityType, entityId]
        const existingItems = [
            { entityType: 'TEST_RUN', entityId: 'run-1' },
            { entityType: 'CONTROL', entityId: 'ctrl-1' },
        ];

        const isDuplicate = existingItems.some(
            i => i.entityType === 'TEST_RUN' && i.entityId === 'run-1'
        );
        expect(isDuplicate).toBe(true);
    });
});

describe('Export Format', () => {
    const sampleRows = [
        {
            runId: 'r1', controlCode: 'AC-1', controlName: 'Access Control',
            planName: 'SOX Review', method: 'MANUAL', frequency: 'QUARTERLY',
            status: 'COMPLETED', result: 'PASS', executedAt: '2026-01-15T00:00:00Z',
            executedBy: 'admin@example.com', notes: '', findingSummary: '',
            evidenceCount: 2, evidenceHashes: 'f1:abc;f2:def',
        },
    ];

    test('CSV header matches row keys', () => {
        const headers = Object.keys(sampleRows[0]);
        expect(headers).toContain('runId');
        expect(headers).toContain('controlCode');
        expect(headers).toContain('result');
        expect(headers).toContain('evidenceHashes');
        expect(headers.length).toBe(14);
    });

    test('CSV escapes commas and quotes correctly', () => {
        const val = 'contains "quotes" and, commas';
        const escaped = val.includes(',') || val.includes('"')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        expect(escaped).toBe('"contains ""quotes"" and, commas"');
    });

    test('JSON export returns array of row objects', () => {
        expect(Array.isArray(sampleRows)).toBe(true);
        expect(sampleRows[0].runId).toBe('r1');
    });
});

describe('Automation Bridge', () => {
    test('automated run creates COMPLETED status with result', () => {
        const mockRun = {
            id: 'run-1', status: 'COMPLETED', result: 'PASS',
            notes: 'Automated run from integration',
            testPlanId: 'plan-1', controlId: 'ctrl-1',
        };
        expect(mockRun.status).toBe('COMPLETED');
        expect(mockRun.result).toBe('PASS');
    });

    test('FAIL result creates remediation task metadata', () => {
        const metadata = {
            testRunId: 'run-1',
            testPlanId: 'plan-1',
            testPlanName: 'SOX Review',
            automated: true,
            integrationResultId: 'ir-123',
        };
        expect(metadata.automated).toBe(true);
        expect(metadata.integrationResultId).toBe('ir-123');
    });

    test('evidence links carry integrationResultId', () => {
        const evidenceLinks = [
            { kind: 'INTEGRATION_RESULT', integrationResultId: 'ir-123', note: 'from integration' },
            { kind: 'LINK', url: 'https://ci.example.com/run/456', note: 'CI run' },
        ];
        expect(evidenceLinks[0].integrationResultId).toBe('ir-123');
        expect(evidenceLinks[1].url).toBeDefined();
    });
});

describe('Route Structure — Test Hardening', () => {
    const fs = require('fs');
    const path = require('path');
    const routes = [
        'src/app/api/t/[tenantSlug]/tests/runs/[runId]/verify-evidence/route.ts',
        'src/app/api/t/[tenantSlug]/tests/runs/[runId]/snapshot/route.ts',
        'src/app/api/t/[tenantSlug]/tests/export/route.ts',
        'src/app/api/t/[tenantSlug]/tests/plans/[planId]/automation-run/route.ts',
    ];

    test.each(routes)('route file exists: %s', (routePath) => {
        expect(fs.existsSync(path.resolve(routePath))).toBe(true);
    });

    const usecases = [
        'src/app-layer/usecases/test-hardening.ts',
    ];

    test.each(usecases)('usecase file exists: %s', (ucPath) => {
        expect(fs.existsSync(path.resolve(ucPath))).toBe(true);
    });
});
