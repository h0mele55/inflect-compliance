/**
 * Retention Purge Job
 *
 * Permanently removes soft-deleted records that are older than a specified
 * number of days. Runs as a system/admin job — hookable via cron.
 *
 * Usage:
 *   npx ts-node -e "import { purgeSoftDeletedOlderThan } from './src/lib/retention-purge'; purgeSoftDeletedOlderThan(90).then(console.log)"
 *
 * Or from a cron handler:
 *   import { purgeSoftDeletedOlderThan } from '@/lib/retention-purge';
 *   const result = await purgeSoftDeletedOlderThan(90);
 */
import { prisma } from './prisma';
import { SOFT_DELETE_MODELS } from './soft-delete';

export interface PurgeResult {
    totalPurged: number;
    perModel: Record<string, number>;
    cutoffDate: Date;
    durationMs: number;
}

/**
 * Purge all soft-deleted records older than `days` days.
 *
 * @param days - Number of days after which soft-deleted records are purged
 * @returns Summary of purged records per model
 */
export async function purgeSoftDeletedOlderThan(days: number): Promise<PurgeResult> {
    if (days < 1) throw new Error('Retention days must be at least 1');

    const start = Date.now();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const perModel: Record<string, number> = {};
    let totalPurged = 0;

    for (const model of SOFT_DELETE_MODELS) {
        // Use raw SQL to bypass soft-delete middleware
        const result = await prisma.$executeRawUnsafe(
            `DELETE FROM "${model}" WHERE "deletedAt" IS NOT NULL AND "deletedAt" < $1`,
            cutoff,
        );
        perModel[model] = result;
        totalPurged += result;
    }

    // Log the purge event to AuditLog (system-level, no tenantId)
    if (totalPurged > 0) {
        try {
            const id = require('crypto').randomUUID().replace(/-/g, '').substring(0, 25);
            await prisma.$executeRawUnsafe(
                `INSERT INTO "AuditLog" ("id", "tenantId", "userId", "entity", "entityId", "action", "details", "metadataJson", "createdAt")
                 SELECT $1, t."id", NULL, 'System', 'retention-purge', 'PURGE_EXECUTED', $2, $3::jsonb, NOW()
                 FROM "Tenant" t LIMIT 1`,
                'c' + id,
                `Retention purge: ${totalPurged} records older than ${days} days`,
                JSON.stringify({ totalPurged, perModel, cutoffDate: cutoff.toISOString(), days }),
            );
        } catch {
            // Best effort — don't fail the purge if audit log fails
            console.warn('[retention-purge] Failed to write audit log');
        }
    }

    const durationMs = Date.now() - start;

    console.log(`[retention-purge] Purged ${totalPurged} records (cutoff: ${cutoff.toISOString()}, took ${durationMs}ms)`);
    for (const [model, count] of Object.entries(perModel)) {
        if (count > 0) console.log(`  ${model}: ${count}`);
    }

    return { totalPurged, perModel, cutoffDate: cutoff, durationMs };
}
