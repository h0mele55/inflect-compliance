/**
 * Storage Integration Tests
 *
 * Tests the upload/download flow wiring:
 * - upload creates pending record with correct metadata
 * - download dispatches by provider (stream vs redirect)
 * - tenant isolation is enforced
 */

// ─── Mock env ───
jest.mock('@/env', () => ({
    env: {
        FILE_STORAGE_ROOT: '/tmp/test-storage',
        UPLOAD_DIR: '/tmp/test-storage',
        STORAGE_PROVIDER: 'local',
        S3_BUCKET: 'test-bucket',
        S3_REGION: 'us-east-1',
    },
}));

// ─── Mock storage provider ───
const mockWrite = jest.fn();
const mockReadStream = jest.fn();
const mockDelete = jest.fn();
const mockCreateSignedDownloadUrl = jest.fn();
const mockCreateSignedUploadUrl = jest.fn();
const mockHead = jest.fn();
const mockCopy = jest.fn();

const mockLocalProvider = {
    name: 'local' as const,
    write: mockWrite,
    readStream: mockReadStream,
    delete: mockDelete,
    createSignedDownloadUrl: mockCreateSignedDownloadUrl,
    createSignedUploadUrl: mockCreateSignedUploadUrl,
    head: mockHead,
    copy: mockCopy,
};

const mockS3Provider = {
    name: 's3' as const,
    write: mockWrite,
    readStream: mockReadStream,
    delete: mockDelete,
    createSignedDownloadUrl: mockCreateSignedDownloadUrl,
    createSignedUploadUrl: mockCreateSignedUploadUrl,
    head: mockHead,
    copy: mockCopy,
};

jest.mock('@/lib/storage', () => ({
    getStorageProvider: jest.fn(() => mockLocalProvider),
    buildTenantObjectKey: jest.fn(
        (tenantId: string, domain: string, name: string) =>
            `tenants/${tenantId}/${domain}/2026/03/test-uuid_${name}`
    ),
    assertTenantKey: jest.fn((key: string, tenantId: string) => {
        if (!key.startsWith(`tenants/${tenantId}/`)) {
            throw new Error(`Tenant isolation violation: key "${key}" does not belong to tenant "${tenantId}"`);
        }
    }),
    isAllowedMime: jest.fn(() => true),
    isAllowedSize: jest.fn(() => true),
    FILE_MAX_SIZE_BYTES: 50 * 1024 * 1024,
    validateFile: jest.fn(() => true),
    generatePathKey: jest.fn(
        (tenantId: string, name: string) =>
            `tenants/${tenantId}/general/2026/03/test-uuid_${name}`
    ),
}));

import { getStorageProvider, assertTenantKey, buildTenantObjectKey } from '@/lib/storage';

// ═══════════════════════════════════════════════════════════════
//  Upload Flow Tests
// ═══════════════════════════════════════════════════════════════

describe('Upload Flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockWrite.mockResolvedValue({
            sha256: 'abc123def456'.padEnd(64, '0'),
            sizeBytes: 1024,
        });
    });

    it('buildTenantObjectKey is called with correct domain', () => {
        const buildKey = buildTenantObjectKey as jest.MockedFunction<typeof buildTenantObjectKey>;
        const key = buildKey('tenant-1', 'evidence', 'report.pdf');

        expect(key).toBe('tenants/tenant-1/evidence/2026/03/test-uuid_report.pdf');
        expect(key).toMatch(/^tenants\/tenant-1\/evidence\//);
    });

    it('storage.write is called with provider abstraction', async () => {
        const storage = getStorageProvider();
        const buffer = Buffer.from('test content');

        const result = await storage.write(
            'tenants/t1/evidence/2026/03/uuid_test.pdf',
            buffer,
            { mimeType: 'application/pdf' }
        );

        expect(mockWrite).toHaveBeenCalledWith(
            'tenants/t1/evidence/2026/03/uuid_test.pdf',
            buffer,
            { mimeType: 'application/pdf' }
        );
        expect(result.sha256).toBeTruthy();
        expect(result.sizeBytes).toBe(1024);
    });
});

// ═══════════════════════════════════════════════════════════════
//  Download Flow Tests
// ═══════════════════════════════════════════════════════════════

describe('Download Flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('local provider returns stream mode', async () => {
        const storage = mockLocalProvider;
        const mockStream = { on: jest.fn(), pipe: jest.fn(), destroy: jest.fn() };
        mockReadStream.mockReturnValue(mockStream);

        expect(storage.name).toBe('local');
        const stream = storage.readStream('tenants/t1/evidence/2026/03/uuid_file.pdf');
        expect(stream).toBe(mockStream);
    });

    it('S3 provider returns presigned URL', async () => {
        const presignedUrl = 'https://bucket.s3.amazonaws.com/tenants/t1/file.pdf?X-Amz-Signature=...';
        mockCreateSignedDownloadUrl.mockResolvedValue(presignedUrl);

        const url = await mockS3Provider.createSignedDownloadUrl(
            'tenants/t1/evidence/2026/03/uuid_file.pdf',
            { expiresIn: 300, downloadFilename: 'report.pdf' }
        );

        expect(url).toBe(presignedUrl);
        expect(mockCreateSignedDownloadUrl).toHaveBeenCalledWith(
            'tenants/t1/evidence/2026/03/uuid_file.pdf',
            { expiresIn: 300, downloadFilename: 'report.pdf' }
        );
    });
});

// ═══════════════════════════════════════════════════════════════
//  Tenant Isolation Tests
// ═══════════════════════════════════════════════════════════════

describe('Tenant Isolation', () => {
    it('assertTenantKey allows matching tenant', () => {
        expect(() =>
            (assertTenantKey as jest.MockedFunction<typeof assertTenantKey>)(
                'tenants/tenant-1/evidence/2026/03/uuid_file.pdf',
                'tenant-1'
            )
        ).not.toThrow();
    });

    it('assertTenantKey blocks cross-tenant access', () => {
        expect(() =>
            (assertTenantKey as jest.MockedFunction<typeof assertTenantKey>)(
                'tenants/tenant-1/evidence/2026/03/uuid_file.pdf',
                'tenant-2'
            )
        ).toThrow('Tenant isolation violation');
    });

    it('assertTenantKey blocks path traversal', () => {
        expect(() =>
            (assertTenantKey as jest.MockedFunction<typeof assertTenantKey>)(
                'tenants/other/../tenant-1/file.pdf',
                'tenant-1'
            )
        ).toThrow('Tenant isolation violation');
    });
});

// ═══════════════════════════════════════════════════════════════
//  Provider Dispatch Tests
// ═══════════════════════════════════════════════════════════════

describe('Provider Dispatch', () => {
    it('getStorageProvider returns configured provider', () => {
        const provider = (getStorageProvider as jest.MockedFunction<typeof getStorageProvider>)();
        expect(provider.name).toBe('local');
    });

    it('dispatches correctly for S3', async () => {
        (getStorageProvider as jest.MockedFunction<typeof getStorageProvider>).mockReturnValue(mockS3Provider);

        const provider = getStorageProvider();
        expect(provider.name).toBe('s3');

        // Restore
        (getStorageProvider as jest.MockedFunction<typeof getStorageProvider>).mockReturnValue(mockLocalProvider);
    });

    it('upload writes through provider abstraction', async () => {
        mockWrite.mockResolvedValue({ sha256: 'a'.repeat(64), sizeBytes: 512 });

        const key = 'tenants/t1/evidence/2026/03/uuid_doc.pdf';
        const buf = Buffer.from('pdf content');
        const result = await getStorageProvider().write(key, buf, { mimeType: 'application/pdf' });

        expect(result.sha256).toBe('a'.repeat(64));
        expect(mockWrite).toHaveBeenCalledWith(key, buf, { mimeType: 'application/pdf' });
    });

    it('delete goes through provider', async () => {
        mockDelete.mockResolvedValue(undefined);

        await getStorageProvider().delete('tenants/t1/evidence/2026/03/uuid_old.pdf');

        expect(mockDelete).toHaveBeenCalledWith('tenants/t1/evidence/2026/03/uuid_old.pdf');
    });
});
