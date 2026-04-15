/**
 * Library Sync Usecase — Controlled execution paths for library import/update.
 *
 * Provides high-level orchestration functions that can be called by:
 * - Scripts/CLI commands
 * - Admin API routes
 * - Seed processes
 *
 * All paths use the library-importer under the hood and follow
 * the project's job-runner pattern for structured observability.
 */
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/observability/logger';
import { runJob } from '@/lib/observability/job-runner';
import { notFound } from '@/lib/errors/types';
import {
    importLibrary,
    importAllFromDirectory,
    type ImportResult,
    type ImportOptions,
} from '../services/library-importer';
import {
    scanLibraryDirectory,
    parseLibraryFile,
    loadLibrary,
    loadAllFromDirectory,
} from '../libraries';

// ─── Path Constants ──────────────────────────────────────────────────

/** Default path to the YAML library directory. */
export const LIBRARIES_DIR = path.resolve(__dirname, '../../data/libraries');

// ─── Sync Results ────────────────────────────────────────────────────

export interface SyncResult {
    /** Total libraries found on disk */
    totalFound: number;
    /** Results per library */
    results: ImportResult[];
    /** Summary counts */
    summary: {
        created: number;
        updated: number;
        skipped: number;
        failed: number;
    };
    /** Total duration in ms */
    totalDurationMs: number;
}

// ─── Sync All Libraries ──────────────────────────────────────────────

/**
 * Synchronize all YAML libraries from the default directory into Prisma.
 *
 * This is the primary entry point for library management. It:
 * 1. Scans the libraries directory for YAML files
 * 2. Parses and validates each file
 * 3. Compares against DB state (hash-based deduplication)
 * 4. Upserts changed/new libraries
 * 5. Skips unchanged libraries
 *
 * Wrapped in `runJob` for structured observability.
 */
export async function syncAllLibraries(
    db: PrismaClient,
    options?: ImportOptions,
): Promise<SyncResult> {
    return runJob('library-sync-all', async () => {
        const start = performance.now();
        const component = 'library-sync';

        logger.info('Sync started', { component, dir: LIBRARIES_DIR });

        const results = await importAllFromDirectory(db, LIBRARIES_DIR, options);

        const summary = {
            created: results.filter(r => r.action === 'created').length,
            updated: results.filter(r => r.action === 'updated').length,
            skipped: results.filter(r => r.action === 'skipped').length,
            failed: 0, // Failures throw, so this is 0 if we reach here
        };

        const totalDurationMs = Math.round(performance.now() - start);

        logger.info('Sync completed', {
            component,
            totalFound: results.length,
            ...summary,
            totalDurationMs,
        });

        return {
            totalFound: results.length,
            results,
            summary,
            totalDurationMs,
        };
    });
}

/**
 * Synchronize a single library by its file path.
 *
 * Use this when you want to import/update a specific framework
 * without scanning the entire directory.
 */
export async function syncLibraryByFile(
    db: PrismaClient,
    filePath: string,
    options?: ImportOptions,
): Promise<ImportResult> {
    return runJob('library-sync-one', async () => {
        const stored = parseLibraryFile(filePath);
        const loaded = loadLibrary(stored, filePath);
        return importLibrary(db, loaded, options);
    });
}

/**
 * Synchronize a single library by its URN.
 * Scans the library directory to find the file matching the URN.
 */
export async function syncLibraryByUrn(
    db: PrismaClient,
    urn: string,
    options?: ImportOptions,
): Promise<ImportResult> {
    return runJob('library-sync-urn', async () => {
        const entries = scanLibraryDirectory(LIBRARIES_DIR);
        const entry = entries.find(e => e.urn === urn);
        if (!entry) {
            throw notFound(`Library with URN "${urn}" not found in ${LIBRARIES_DIR}`);
        }
        const stored = parseLibraryFile(entry.filePath);
        const loaded = loadLibrary(stored, entry.filePath);
        return importLibrary(db, loaded, options);
    });
}

// ─── Preview/Dry-Run ─────────────────────────────────────────────────

/**
 * Preview what would happen if libraries were synced.
 * Returns diff information without performing any writes.
 */
export async function previewSync(
    db: PrismaClient,
): Promise<Array<{
    urn: string;
    name: string;
    key: string;
    version: number;
    action: 'would-create' | 'would-update' | 'up-to-date';
    currentHash?: string;
    newHash: string;
}>> {
    const loaded = loadAllFromDirectory(LIBRARIES_DIR);
    const previews: Array<{
        urn: string;
        name: string;
        key: string;
        version: number;
        action: 'would-create' | 'would-update' | 'up-to-date';
        currentHash?: string;
        newHash: string;
    }> = [];

    for (const [, lib] of loaded) {
        const existing = await db.framework.findFirst({
            where: { key: lib.refId },
        });

        let action: 'would-create' | 'would-update' | 'up-to-date';
        if (!existing) {
            action = 'would-create';
        } else if (existing.contentHash !== lib.contentHash) {
            action = 'would-update';
        } else {
            action = 'up-to-date';
        }

        previews.push({
            urn: lib.urn,
            name: lib.name,
            key: lib.refId,
            version: lib.version,
            action,
            currentHash: existing?.contentHash ?? undefined,
            newHash: lib.contentHash,
        });
    }

    return previews;
}
