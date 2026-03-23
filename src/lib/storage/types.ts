/**
 * Storage Provider Abstraction
 *
 * Provider-agnostic interface for file storage operations.
 * Implementations: LocalStorageProvider (filesystem), S3StorageProvider (S3/R2/MinIO).
 */
import { Readable } from 'stream';

// ─── Write Result ───

export interface WriteResult {
    /** SHA-256 hex digest of the written content */
    sha256: string;
    /** Size in bytes */
    sizeBytes: number;
}

// ─── Head Result ───

export interface HeadResult {
    /** Size in bytes */
    sizeBytes: number;
    /** MIME type if available */
    mimeType?: string;
    /** Last modified timestamp */
    lastModified?: Date;
}

// ─── Presigned Upload ───

export interface SignedUploadTarget {
    /** URL to upload to (PUT or POST) */
    url: string;
    /** HTTP method to use */
    method: 'PUT' | 'POST';
    /** Additional fields (for S3 POST policy) */
    fields?: Record<string, string>;
    /** URL expiry in seconds */
    expiresIn: number;
}

// ─── Write Options ───

export interface WriteOptions {
    /** MIME type of the file */
    mimeType?: string;
    /** Maximum allowed size in bytes (streaming enforcement) */
    maxSizeBytes?: number;
}

// ─── Download URL Options ───

export interface DownloadUrlOptions {
    /** Expiry in seconds (default: 3600) */
    expiresIn?: number;
    /** Force download with this filename (Content-Disposition) */
    downloadFilename?: string;
}

// ─── Upload URL Options ───

export interface UploadUrlOptions {
    /** Expiry in seconds (default: 3600) */
    expiresIn?: number;
    /** MIME type constraint */
    mimeType?: string;
    /** Max file size for upload policy */
    maxSizeBytes?: number;
}

// ─── Provider Interface ───

export interface StorageProvider {
    /** Provider identifier */
    readonly name: 'local' | 's3';

    /**
     * Write a file to storage.
     * Computes SHA-256 and enforces size limits during streaming.
     */
    write(pathKey: string, source: Readable | Buffer, opts?: WriteOptions): Promise<WriteResult>;

    /**
     * Read a file as a stream.
     * Throws if file does not exist.
     */
    readStream(pathKey: string): Readable;

    /**
     * Get a time-limited signed download URL.
     * For local provider: returns a relative file-serve path.
     * For S3: returns a presigned GET URL.
     */
    createSignedDownloadUrl(pathKey: string, opts?: DownloadUrlOptions): Promise<string>;

    /**
     * Get a presigned upload target (URL + fields).
     * Allows direct browser-to-storage uploads.
     */
    createSignedUploadUrl(pathKey: string, opts?: UploadUrlOptions): Promise<SignedUploadTarget>;

    /**
     * Get metadata about a stored object without downloading it.
     */
    head(pathKey: string): Promise<HeadResult>;

    /**
     * Delete a stored object. No-op if the object doesn't exist.
     */
    delete(pathKey: string): Promise<void>;

    /**
     * Copy an object within the same storage backend.
     */
    copy(srcKey: string, destKey: string): Promise<void>;
}

// ─── Provider Type ───

export type StorageProviderType = 'local' | 's3';
