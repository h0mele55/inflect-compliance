/**
 * Audit Trail — Event Builder
 *
 * Single construction path for creating audit entries with hash chaining.
 * All audit events authored through the structured pipeline should use
 * this builder to ensure consistent validation, serialization, and hashing.
 *
 * Usage:
 *   const entry = buildAuditEntry({
 *       tenantId: ctx.tenantId,
 *       actorUserId: ctx.userId,
 *       actorType: 'USER',
 *       eventType: 'VENDOR_CREATED',
 *       entityType: 'Vendor',
 *       entityId: vendor.id,
 *       occurredAt: toCanonicalTimestamp(new Date()),
 *       detailsJson: {
 *           category: 'entity_lifecycle',
 *           entityName: 'Vendor',
 *           operation: 'created',
 *       },
 *       previousHash: lastHash,
 *   });
 *
 *   await db.auditLog.create({ data: entry.data });
 *
 * @module audit/event-builder
 */
import type { AuditEntryInput, AuditEntryOutput } from './types';
import { AuditDetailsSchema } from './event-schema';
import { computeEntryHash, toCanonicalTimestamp } from './canonical-hash';
import { badRequest } from '@/lib/errors/types';

/**
 * Build a validated, hash-chained audit entry ready for database insertion.
 *
 * This function:
 *   1. Validates `detailsJson` against the canonical Zod schema
 *   2. Normalizes the occurredAt timestamp to canonical form
 *   3. Computes the SHA-256 entryHash from canonical field serialization
 *   4. Returns Prisma-ready data + the computed hash
 *
 * @param input - The audit entry input (all fields required for hashing)
 * @returns Object with `data` (Prisma-ready) and `entryHash` (SHA-256 hex)
 * @throws AppError (BAD_REQUEST) if detailsJson fails schema validation
 */
export function buildAuditEntry(input: AuditEntryInput): AuditEntryOutput {
    // 1. Validate detailsJson against canonical schema
    const parseResult = AuditDetailsSchema.safeParse(input.detailsJson);
    if (!parseResult.success) {
        throw badRequest(
            `Invalid audit detailsJson: ${parseResult.error.issues.map(i => i.message).join(', ')}`,
            { zodErrors: parseResult.error.issues },
        );
    }

    // Use the parsed (stripped) version for deterministic hashing
    const validatedDetails = parseResult.data;

    // 2. Normalize timestamp
    const occurredAt = toCanonicalTimestamp(input.occurredAt);

    // 3. Determine version
    const version = input.version ?? 1;

    // 4. Compute entry hash
    const entryHash = computeEntryHash({
        tenantId: input.tenantId,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt,
        detailsJson: validatedDetails,
        previousHash: input.previousHash,
        version,
    });

    // 5. Build Prisma-ready data
    const data: AuditEntryOutput['data'] = {
        tenantId: input.tenantId,
        userId: input.actorUserId,
        actorType: input.actorType,
        entity: input.entityType,
        entityId: input.entityId ?? 'unknown',
        action: input.eventType,
        details: null,                 // legacy field — null for structured entries
        detailsJson: validatedDetails, // canonical structured payload
        requestId: input.requestId ?? null,
        previousHash: input.previousHash,
        entryHash,
        version,
    };

    return { data, entryHash };
}
