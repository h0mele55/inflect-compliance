/**
 * Local file storage driver with streaming writes, SHA-256 hashing,
 * tenant-partitioned paths, and atomic rename.
 *
 * Legacy API (uploadFile/getFile/validateFile) preserved for backward compat.
 */
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { env } from '@/env';

// ─── Configuration ───

const FILE_STORAGE_ROOT = env.FILE_STORAGE_ROOT || env.UPLOAD_DIR;

const FILE_MAX_SIZE_BYTES = env.FILE_MAX_SIZE_BYTES || (50 * 1024 * 1024); // 50MB default

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

export { FILE_STORAGE_ROOT, FILE_MAX_SIZE_BYTES, FILE_ALLOWED_MIME };

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
 */
export function generatePathKey(tenantId: string, originalName: string): string {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const uuid = crypto.randomUUID();
    const safe = sanitizeFileName(originalName);
    return `tenants/${tenantId}/${yyyy}/${mm}/${uuid}_${safe}`;
}

/**
 * Resolve absolute path safely under FILE_STORAGE_ROOT. Throws on traversal.
 */
export function resolveStoragePath(pathKey: string): string {
    const root = path.resolve(FILE_STORAGE_ROOT);
    const target = path.resolve(root, pathKey);
    if (!target.startsWith(root + path.sep) && target !== root) {
        throw new Error('Path traversal detected');
    }
    return target;
}

// ─── Streaming Write ───

interface StreamWriteResult {
    sha256: string;
    sizeBytes: number;
    finalPath: string;
}

/**
 * Stream-write a file to disk: pipes to temp file, computes SHA-256 incrementally,
 * then atomic-renames to final location.
 */
export async function streamWriteFile(
    pathKey: string,
    source: Readable | Buffer,
): Promise<StreamWriteResult> {
    const finalPath = resolveStoragePath(pathKey);
    const dir = path.dirname(finalPath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = finalPath + '.tmp.' + crypto.randomUUID().slice(0, 8);
    const hash = crypto.createHash('sha256');
    let sizeBytes = 0;

    try {
        if (Buffer.isBuffer(source)) {
            // Buffer path (legacy compat)
            hash.update(source);
            sizeBytes = source.length;
            await fs.writeFile(tmpPath, source);
        } else {
            // Streaming path (preferred)
            const writeStream = createWriteStream(tmpPath);
            const readable = source;

            await pipeline(
                readable,
                async function* (src) {
                    for await (const chunk of src) {
                        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                        hash.update(buf);
                        sizeBytes += buf.length;
                        if (sizeBytes > FILE_MAX_SIZE_BYTES) {
                            throw new Error(`File size exceeds maximum allowed (${FILE_MAX_SIZE_BYTES} bytes)`);
                        }
                        yield buf;
                    }
                },
                writeStream,
            );
        }

        // Atomic rename
        await fs.rename(tmpPath, finalPath);

        return {
            sha256: hash.digest('hex'),
            sizeBytes,
            finalPath,
        };
    } catch (err) {
        // Clean up temp file on failure
        try { await fs.unlink(tmpPath); } catch { /* ignore */ }
        throw err;
    }
}

// ─── Streaming Read ───

/**
 * Returns a readable stream for a stored file.
 */
export function streamReadFile(pathKey: string): ReturnType<typeof createReadStream> {
    const absPath = resolveStoragePath(pathKey);
    return createReadStream(absPath);
}

/**
 * Delete a file from storage (used during cleanup / purge).
 */
export async function deleteStoredFile(pathKey: string): Promise<void> {
    const absPath = resolveStoragePath(pathKey);
    try {
        await fs.unlink(absPath);
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
}

// ─── Validation ───

/**
 * Validate mime type against allowlist.
 */
export function isAllowedMime(mimeType: string): boolean {
    return FILE_ALLOWED_MIME.includes(mimeType);
}

/**
 * Validate file size.
 */
export function isAllowedSize(sizeBytes: number): boolean {
    return sizeBytes > 0 && sizeBytes <= FILE_MAX_SIZE_BYTES;
}

// ─── Legacy API (backward compat) ───

/**
 * Validates a file's size and mime type.
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

/**
 * Legacy upload: reads entire file into memory. Use streamWriteFile for new code.
 */
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

/**
 * Legacy read: loads entire file into memory. Use streamReadFile for new code.
 */
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
