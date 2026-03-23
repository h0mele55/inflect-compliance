/**
 * Storage backward-compatibility layer.
 *
 * This file re-exports everything from the new storage abstraction at @/lib/storage/index.
 * Existing imports of '@/lib/storage' continue to work unchanged.
 *
 * For new code, prefer:
 *   import { getStorageProvider, generatePathKey } from '@/lib/storage';
 *
 * Legacy functions (uploadFile, getFile, streamWriteFile, streamReadFile, deleteStoredFile)
 * are preserved below and delegate to the local provider for backward compat.
 */

// ─── Re-export new abstraction ───
export {
    // Factory
    getStorageProvider,
    resetStorageProvider,
    // Path utils
    generatePathKey,
    sanitizeFileName,
    // Validation
    FILE_MAX_SIZE_BYTES,
    FILE_ALLOWED_MIME,
    isAllowedMime,
    isAllowedSize,
    validateFile,
} from './storage/index';

export type {
    StorageProvider,
    StorageProviderType,
    WriteResult,
    WriteOptions,
    HeadResult,
    DownloadUrlOptions,
    UploadUrlOptions,
    SignedUploadTarget,
} from './storage/types';

// ─── Legacy re-exports (delegate to local provider) ───

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { env } from '@/env';

const FILE_STORAGE_ROOT = env.FILE_STORAGE_ROOT || env.UPLOAD_DIR;
export { FILE_STORAGE_ROOT };

/** @deprecated Use getStorageProvider().readStream(pathKey) */
export function resolveStoragePath(pathKey: string): string {
    const root = path.resolve(FILE_STORAGE_ROOT);
    const target = path.resolve(root, pathKey);
    if (!target.startsWith(root + path.sep) && target !== root) {
        throw new Error('Path traversal detected');
    }
    return target;
}

/** @deprecated Use getStorageProvider().write(pathKey, source) */
export async function streamWriteFile(
    pathKey: string,
    source: Readable | Buffer,
): Promise<{ sha256: string; sizeBytes: number; finalPath: string }> {
    const { LocalStorageProvider } = await import('./storage/local-provider');
    const local = new LocalStorageProvider();
    const result = await local.write(pathKey, source);
    return { ...result, finalPath: resolveStoragePath(pathKey) };
}

/** @deprecated Use getStorageProvider().readStream(pathKey) */
export function streamReadFile(pathKey: string): ReturnType<typeof createReadStream> {
    const absPath = resolveStoragePath(pathKey);
    return createReadStream(absPath);
}

/** @deprecated Use getStorageProvider().delete(pathKey) */
export async function deleteStoredFile(pathKey: string): Promise<void> {
    const absPath = resolveStoragePath(pathKey);
    try {
        await fs.unlink(absPath);
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
}

/** @deprecated Use getStorageProvider().write() with generatePathKey() */
export async function uploadFile(file: File): Promise<{ fileName: string; filePath: string; originalName: string; size: number }> {
    const originalName = path.basename(file.name);
    const ext = path.extname(originalName);
    const uniqueId = crypto.randomUUID();
    const safeFileName = `${uniqueId}${ext}`;

    const root = path.resolve(FILE_STORAGE_ROOT);
    await fs.mkdir(root, { recursive: true });
    const destination = path.join(root, safeFileName);

    if (!destination.startsWith(root)) {
        throw new Error('Path traversal detected');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(destination, buffer);

    return { fileName: safeFileName, filePath: destination, originalName, size: buffer.length };
}

/** @deprecated Use getStorageProvider().readStream() */
export async function getFile(fileName: string): Promise<{ buffer: Buffer; mimeType: string; name: string } | null> {
    const safeName = path.basename(fileName);
    const root = path.resolve(FILE_STORAGE_ROOT);
    const targetPath = path.join(root, safeName);

    if (!targetPath.startsWith(root)) {
        return null;
    }

    try {
        const buffer = await fs.readFile(targetPath);
        const ext = path.extname(safeName).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === '.pdf') mimeType = 'application/pdf';
        if (ext === '.png') mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        if (ext === '.csv') mimeType = 'text/csv';
        if (ext === '.doc') mimeType = 'application/msword';
        if (ext === '.docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        return { buffer, mimeType, name: safeName };
    } catch {
        return null;
    }
}
