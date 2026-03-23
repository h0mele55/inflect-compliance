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

// ─── Storage Domains ───

/** Well-known storage domains for organizing tenant objects */
export type StorageDomain = 'evidence' | 'reports' | 'exports' | 'temp' | 'general';

const VALID_DOMAINS: readonly StorageDomain[] = ['evidence', 'reports', 'exports', 'temp', 'general'] as const;

// ─── Tenant Object Key Builder ───

export interface BuildKeyOptions {
    /** Storage domain (default: 'general') */
    domain?: StorageDomain;
    /** Override date for the yyyy/mm partition (default: now) */
    date?: Date;
}

/**
 * Build a tenant-scoped object key with domain partitioning.
 *
 * Format: `tenants/<tenantId>/<domain>/<yyyy>/<mm>/<uuid>_<sanitizedName>`
 *
 * Rules:
 * - tenantId is mandatory and validated
 * - original filename is sanitized (no traversal, no special chars)
 * - UUID prefix ensures uniqueness
 * - domain groups related objects (evidence, reports, exports, temp)
 *
 * @example
 *   buildTenantObjectKey('cuid123', 'evidence', 'audit-report.pdf')
 *   // → 'tenants/cuid123/evidence/2026/03/a1b2c3d4-..._audit-report.pdf'
 */
export function buildTenantObjectKey(
    tenantId: string,
    domain: StorageDomain,
    originalName: string,
    opts?: Omit<BuildKeyOptions, 'domain'>,
): string {
    if (!tenantId || typeof tenantId !== 'string') {
        throw new Error('tenantId is required for object key generation');
    }
    if (!VALID_DOMAINS.includes(domain)) {
        throw new Error(`Invalid storage domain: ${domain}. Must be one of: ${VALID_DOMAINS.join(', ')}`);
    }
    if (!originalName || typeof originalName !== 'string') {
        throw new Error('originalName is required for object key generation');
    }

    const now = opts?.date ?? new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const uuid = crypto.randomUUID();
    const safe = sanitizeFileName(originalName);

    return `tenants/${tenantId}/${domain}/${yyyy}/${mm}/${uuid}_${safe}`;
}

/**
 * Generate a tenant-partitioned pathKey (backward-compatible).
 * Uses domain 'general'. For new code, prefer buildTenantObjectKey with explicit domain.
 */
export function generatePathKey(tenantId: string, originalName: string): string {
    return buildTenantObjectKey(tenantId, 'general', originalName);
}

// ─── Key Validation & Parsing ───

const TENANT_KEY_REGEX = /^tenants\/([^/]+)\/(evidence|reports|exports|temp|general)\/\d{4}\/\d{2}\/[a-f0-9-]+_.+$/;

/**
 * Runtime guard: asserts a key belongs to the expected tenant.
 * Use this before any storage operation to prevent cross-tenant access.
 *
 * @throws Error if key doesn't match expected tenant prefix
 */
export function assertTenantKey(pathKey: string, expectedTenantId: string): void {
    if (!pathKey.startsWith(`tenants/${expectedTenantId}/`)) {
        throw new Error(`Tenant isolation violation: key "${pathKey}" does not belong to tenant "${expectedTenantId}"`);
    }
}

/**
 * Parse a tenant ID from an object key.
 * Returns null if the key doesn't match the expected format.
 */
export function parseTenantKey(pathKey: string): { tenantId: string; domain: StorageDomain } | null {
    const match = pathKey.match(TENANT_KEY_REGEX);
    if (!match) return null;
    return { tenantId: match[1], domain: match[2] as StorageDomain };
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
