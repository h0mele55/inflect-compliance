/**
 * Storage Provider Factory
 *
 * Central entry point for all file storage operations.
 * Selects local or S3 provider based on STORAGE_PROVIDER env var.
 *
 * Usage:
 *   import { getStorageProvider, generatePathKey } from '@/lib/storage';
 *   const storage = getStorageProvider();
 *   const key = generatePathKey(tenantId, 'report.pdf');
 *   const result = await storage.write(key, buffer, { mimeType: 'application/pdf' });
 */
import crypto from 'crypto';
import path from 'path';
import { env } from '@/env';
import type { StorageProvider, StorageProviderType } from './types';

// Re-export types for consumers
export type {
    StorageProvider,
    StorageProviderType,
    WriteResult,
    WriteOptions,
    HeadResult,
    DownloadUrlOptions,
    UploadUrlOptions,
    SignedUploadTarget,
} from './types';

// ─── Provider Singleton ───

let _provider: StorageProvider | null = null;

/**
 * Get the configured storage provider (singleton).
 * Default: 'local' if STORAGE_PROVIDER is not set.
 */
export function getStorageProvider(): StorageProvider {
    if (_provider) return _provider;

    const providerType = (env.STORAGE_PROVIDER || 'local') as StorageProviderType;

    switch (providerType) {
        case 's3': {
            // Lazy import to avoid loading AWS SDK when not needed
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { S3StorageProvider } = require('./s3-provider');
            _provider = new S3StorageProvider();
            break;
        }
        case 'local':
        default: {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { LocalStorageProvider } = require('./local-provider');
            _provider = new LocalStorageProvider();
            break;
        }
    }

    return _provider!;
}

/**
 * Reset the provider singleton (for testing).
 */
export function resetStorageProvider(): void {
    _provider = null;
}

// ─── Path Generation ───

/**
 * Sanitize a filename: strip directory separators, control chars, limit length.
 */
export function sanitizeFileName(name: string): string {
    return path.basename(name)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\.{2,}/g, '.')
        .slice(0, 200);
}

/**
 * Generate a tenant-partitioned pathKey: tenants/<tenantId>/<yyyy>/<mm>/<uuid>_<sanitized>
 * This key works as both a local path segment and an S3 object key.
 */
export function generatePathKey(tenantId: string, originalName: string): string {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const uuid = crypto.randomUUID();
    const safe = sanitizeFileName(originalName);
    return `tenants/${tenantId}/${yyyy}/${mm}/${uuid}_${safe}`;
}

// ─── Validation ───

const FILE_MAX_SIZE_BYTES = env.FILE_MAX_SIZE_BYTES || (50 * 1024 * 1024);

const FILE_ALLOWED_MIME = (env.FILE_ALLOWED_MIME || [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/csv',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/json',
    'application/zip',
].join(','))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export { FILE_MAX_SIZE_BYTES, FILE_ALLOWED_MIME };

export function isAllowedMime(mimeType: string): boolean {
    return FILE_ALLOWED_MIME.includes(mimeType);
}

export function isAllowedSize(sizeBytes: number): boolean {
    return sizeBytes > 0 && sizeBytes <= FILE_MAX_SIZE_BYTES;
}

/**
 * Validates a file's size and mime type (legacy API).
 */
export function validateFile(file: File, options?: { maxSizeMB?: number; allowedMimeTypes?: string[] }) {
    const maxSize = (options?.maxSizeMB || 10) * 1024 * 1024;
    const allowedTypes = options?.allowedMimeTypes || FILE_ALLOWED_MIME;

    if (file.size > maxSize) {
        throw new Error(`File size validation failed: max size is ${options?.maxSizeMB || 10}MB`);
    }

    if (!allowedTypes.includes(file.type)) {
        throw new Error(`File type validation failed: ${file.type} is not allowed`);
    }

    return true;
}
