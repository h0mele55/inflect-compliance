/**
 * Import Snapshot — Pre-Import Tenant Data Backup for Disaster Recovery
 *
 * Creates a point-in-time snapshot of a tenant's data before a destructive
 * import operation. If the import causes data loss or corruption, the
 * snapshot can be used to restore the previous state.
 *
 * ARCHITECTURE:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Pre-Import Flow                                              │
 *   │  1. Export current tenant data via exportTenantData()        │
 *   │  2. Serialize envelope to gzip'd buffer via bundle-codec    │
 *   │  3. Write to storage under 'exports' domain with timestamp  │
 *   │  4. Return SnapshotRecord for audit logging                 │
 *   │                                                              │
 *   │ Restore Flow                                                 │
 *   │  1. Read snapshot from storage                               │
 *   │  2. Deserialize via bundle-codec (auto-detect gzip)         │
 *   │  3. Import via standard importTenantData()                  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * DESIGN PRINCIPLES:
 *   - Reuses existing export/import infrastructure (no raw DB dumps)
 *   - Snapshots stored via StorageProvider (local/S3) — same as attachments
 *   - Tenant-scoped storage keys prevent cross-tenant access
 *   - Automatic cleanup via retention policy (configurable)
 *   - Snapshot is metadata-only (file attachments are not destroyed by import)
 *
 * @module app-layer/services/import-snapshot
 */

import { logger } from '@/lib/observability/logger';
import type { StorageProvider } from '@/lib/storage/types';
import { buildTenantObjectKey } from '@/lib/storage';
import { exportTenantData } from './export-service';
import { serializeBundle, deserializeBundle } from './bundle-codec';
import type { ExportEnvelope } from './export-schemas';

// ─── Types ──────────────────────────────────────────────────────────

/** Metadata for a pre-import snapshot. */
export interface SnapshotRecord {
    /** Unique snapshot identifier. */
    snapshotId: string;
    /** Tenant this snapshot belongs to. */
    tenantId: string;
    /** Storage path key where the snapshot is stored. */
    pathKey: string;
    /** ISO 8601 timestamp of when the snapshot was created. */
    createdAt: string;
    /** Number of entities in the snapshot. */
    entityCount: number;
    /** Size of the serialized snapshot in bytes. */
    sizeBytes: number;
    /** Whether the snapshot is gzip-compressed. */
    compressed: boolean;
    /** Reason for the snapshot (e.g., 'pre-import'). */
    reason: string;
}

/** Options for creating a snapshot. */
export interface CreateSnapshotOptions {
    /** Tenant to snapshot. */
    tenantId: string;
    /** Reason for the snapshot (default: 'pre-import'). */
    reason?: string;
    /** Whether to compress the snapshot (default: true). */
    compress?: boolean;
}

/** Result of creating a snapshot. */
export interface CreateSnapshotResult {
    /** The snapshot record with metadata. */
    snapshot: SnapshotRecord;
    /** Duration of the snapshot operation in ms. */
    durationMs: number;
}

/** Options for restoring a snapshot. */
export interface RestoreSnapshotOptions {
    /** The snapshot record to restore from. */
    snapshot: SnapshotRecord;
}

/** Result of listing snapshots. */
export interface ListSnapshotsOptions {
    /** Tenant to list snapshots for. */
    tenantId: string;
    /** Maximum number of snapshots to return. */
    limit?: number;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Maximum number of snapshots to retain per tenant (oldest auto-pruned). */
export const MAX_SNAPSHOTS_PER_TENANT = 10;

/** Default snapshot retention in days. */
export const DEFAULT_RETENTION_DAYS = 30;

// ─── Create Snapshot ────────────────────────────────────────────────

/**
 * Create a pre-import snapshot of a tenant's current data.
 *
 * Exports all tenant data, serializes it (optionally gzip'd), and writes
 * the bundle to the storage provider under the 'exports' domain.
 *
 * @param options  - Snapshot options (tenantId, reason, compress)
 * @param storage  - Storage provider to write the snapshot to
 * @returns Snapshot record and timing info
 */
export async function createPreImportSnapshot(
    options: CreateSnapshotOptions,
    storage: StorageProvider,
): Promise<CreateSnapshotResult> {
    const startMs = performance.now();
    const { tenantId, reason = 'pre-import', compress = true } = options;

    const log = logger.child({
        component: 'import-snapshot',
        operation: 'create',
        tenantId,
    });

    log.info('creating pre-import snapshot', { reason });

    // Step 1: Export current tenant data
    const exportResult = await exportTenantData({
        tenantId,
        domains: ['FULL_TENANT'],
    });

    // Step 2: Serialize the envelope
    const serialized = serializeBundle(exportResult.envelope, { compress });

    // Step 3: Write to storage
    const snapshotId = generateSnapshotId();
    const pathKey = buildTenantObjectKey(tenantId, 'exports', `snapshot-${snapshotId}.json${compress ? '.gz' : ''}`);

    await storage.write(pathKey, serialized.data, {
        mimeType: compress ? 'application/gzip' : 'application/json',
    });

    const durationMs = Math.round(performance.now() - startMs);

    const snapshot: SnapshotRecord = {
        snapshotId,
        tenantId,
        pathKey,
        createdAt: new Date().toISOString(),
        entityCount: exportResult.stats.entityCount,
        sizeBytes: serialized.outputSize,
        compressed: serialized.compressed,
        reason,
    };

    log.info('pre-import snapshot created', {
        snapshotId,
        entityCount: snapshot.entityCount,
        sizeBytes: snapshot.sizeBytes,
        compressed: snapshot.compressed,
        durationMs,
    });

    return { snapshot, durationMs };
}

// ─── Read Snapshot ──────────────────────────────────────────────────

/**
 * Read a snapshot from storage and deserialize it into an ExportEnvelope.
 *
 * Auto-detects gzip via magic number (handled by deserializeBundle).
 *
 * @param snapshot - The snapshot record to read
 * @param storage  - Storage provider to read from
 * @returns The deserialized ExportEnvelope
 */
export async function readSnapshot(
    snapshot: SnapshotRecord,
    storage: StorageProvider,
): Promise<ExportEnvelope> {
    const stream = storage.readStream(snapshot.pathKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks);
    return deserializeBundle(data);
}

// ─── Delete Snapshot ────────────────────────────────────────────────

/**
 * Delete a snapshot from storage.
 *
 * @param snapshot - The snapshot record to delete
 * @param storage  - Storage provider to delete from
 */
export async function deleteSnapshot(
    snapshot: SnapshotRecord,
    storage: StorageProvider,
): Promise<void> {
    await storage.delete(snapshot.pathKey);
    logger.info('snapshot deleted', {
        component: 'import-snapshot',
        snapshotId: snapshot.snapshotId,
        pathKey: snapshot.pathKey,
    });
}

// ─── Pruning ────────────────────────────────────────────────────────

/**
 * Prune old snapshots beyond the retention limit.
 *
 * Keeps the newest `maxToKeep` snapshots and deletes the rest.
 * Snapshots must be sorted by createdAt (newest first).
 *
 * @param snapshots - All snapshot records for a tenant (sorted newest first)
 * @param storage   - Storage provider to delete from
 * @param maxToKeep - Maximum snapshots to retain (default: MAX_SNAPSHOTS_PER_TENANT)
 * @returns Number of snapshots pruned
 */
export async function pruneSnapshots(
    snapshots: SnapshotRecord[],
    storage: StorageProvider,
    maxToKeep: number = MAX_SNAPSHOTS_PER_TENANT,
): Promise<number> {
    if (snapshots.length <= maxToKeep) return 0;

    const toDelete = snapshots.slice(maxToKeep);
    let pruned = 0;

    for (const snapshot of toDelete) {
        try {
            await deleteSnapshot(snapshot, storage);
            pruned++;
        } catch (err) {
            logger.warn('failed to prune snapshot', {
                component: 'import-snapshot',
                snapshotId: snapshot.snapshotId,
                error: (err as Error).message,
            });
        }
    }

    logger.info('snapshot pruning completed', {
        component: 'import-snapshot',
        total: snapshots.length,
        pruned,
        retained: snapshots.length - pruned,
    });

    return pruned;
}

// ─── Utilities ──────────────────────────────────────────────────────

/**
 * Generate a timestamp-based snapshot ID for ordering and uniqueness.
 * Format: `snap-<timestamp>-<random>` (e.g., `snap-1713355200000-a1b2`)
 */
export function generateSnapshotId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `snap-${timestamp}-${random}`;
}
