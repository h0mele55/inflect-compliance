/**
 * Bundle Codec — Serialization & Compression for Export/Import Bundles
 *
 * Handles the wire-format conversion between typed ExportEnvelope objects
 * and raw byte buffers. Supports optional gzip compression with automatic
 * format detection on deserialization.
 *
 * ARCHITECTURE:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Export Flow                                                  │
 *   │  ExportEnvelope → JSON string → (optional gzip) → Buffer   │
 *   │                                                              │
 *   │ Import Flow                                                  │
 *   │  Buffer → (auto-detect gzip magic) → decompress → parse → │
 *   │  ExportEnvelope                                              │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * DESIGN PRINCIPLES:
 *   - Compression is a transport concern, NOT a domain concern
 *   - Export/import services deal with typed objects; codec handles bytes
 *   - Auto-detection makes the import path accept both compressed and raw
 *   - Magic number detection mirrors CISO Assistant's gzip approach
 *
 * FORMAT:
 *   - Raw:  UTF-8 encoded JSON string
 *   - Gzip: Standard gzip (RFC 1952) with 0x1F 0x8B magic header
 *
 * @module app-layer/services/bundle-codec
 */

import { gzipSync, gunzipSync } from 'node:zlib';
import type { ExportEnvelope } from './export-schemas';

// ─── Constants ──────────────────────────────────────────────────────

/** Gzip magic number — first 2 bytes of any gzip stream. */
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

// ─── Serialization Options ─────────────────────────────────────────

export interface SerializeOptions {
    /** Whether to gzip-compress the output. Default: true. */
    compress?: boolean;
    /** JSON indentation for readability. Default: 0 (minified). */
    indent?: number;
}

export interface SerializeResult {
    /** The serialized bundle as a Buffer. */
    data: Buffer;
    /** Whether the output is gzip-compressed. */
    compressed: boolean;
    /** Size of the raw JSON before compression (bytes). */
    rawSize: number;
    /** Size of the final output (bytes). */
    outputSize: number;
    /** Compression ratio (0-1). Only meaningful when compressed. */
    compressionRatio: number;
}

// ─── Serialize ──────────────────────────────────────────────────────

/**
 * Serialize an ExportEnvelope to a binary buffer.
 *
 * When compression is enabled (default), the JSON is gzip'd.
 * The output buffer starts with the gzip magic number (0x1F 0x8B),
 * which allows `deserializeBundle` to auto-detect the format.
 *
 * @param envelope - The typed export envelope to serialize
 * @param options  - Serialization options (compression, indentation)
 * @returns SerializeResult with the buffer and stats
 */
export function serializeBundle(
    envelope: ExportEnvelope,
    options: SerializeOptions = {},
): SerializeResult {
    const { compress = true, indent = 0 } = options;

    // Step 1: JSON encode
    const json = JSON.stringify(envelope, null, indent);
    const rawBuffer = Buffer.from(json, 'utf-8');
    const rawSize = rawBuffer.length;

    // Step 2: Optionally compress
    if (compress) {
        const compressed = gzipSync(rawBuffer);
        return {
            data: compressed,
            compressed: true,
            rawSize,
            outputSize: compressed.length,
            compressionRatio: rawSize > 0
                ? Number((1 - compressed.length / rawSize).toFixed(3))
                : 0,
        };
    }

    return {
        data: rawBuffer,
        compressed: false,
        rawSize,
        outputSize: rawSize,
        compressionRatio: 0,
    };
}

// ─── Deserialize ────────────────────────────────────────────────────

/**
 * Deserialize a binary buffer into an ExportEnvelope.
 *
 * Auto-detects gzip by checking for the magic number (0x1F 0x8B).
 * Accepts both compressed and raw JSON input transparently.
 *
 * @param data - Raw buffer (gzip'd or plain JSON)
 * @returns The parsed ExportEnvelope
 * @throws Error if the buffer cannot be decompressed or parsed
 */
export function deserializeBundle(data: Buffer): ExportEnvelope {
    let jsonString: string;

    if (isGzipped(data)) {
        // Decompress gzip
        const decompressed = gunzipSync(data);
        jsonString = decompressed.toString('utf-8');
    } else {
        // Assume raw UTF-8 JSON
        jsonString = data.toString('utf-8');
    }

    // Parse JSON
    try {
        return JSON.parse(jsonString) as ExportEnvelope;
    } catch (error) {
        throw new Error(
            `Failed to parse bundle JSON: ${(error as Error).message}`,
        );
    }
}

// ─── Detection ──────────────────────────────────────────────────────

/**
 * Check if a buffer starts with the gzip magic number.
 * Uses the standard RFC 1952 magic bytes: 0x1F 0x8B.
 */
export function isGzipped(data: Buffer): boolean {
    return data.length >= 2
        && data[0] === GZIP_MAGIC[0]
        && data[1] === GZIP_MAGIC[1];
}
