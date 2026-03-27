/**
 * Audit Trail — Structured Event Schema (Zod Validation)
 *
 * Zod schemas for validating the canonical `detailsJson` payloads.
 * These schemas enforce the structured event contract and strip
 * unknown keys to ensure deterministic hashing.
 *
 * IMPORTANT: These schemas define the CANONICAL shape of audit payloads.
 * Any change to field names or required fields is a BREAKING CHANGE
 * that invalidates existing hash chains. Bump the `version` field
 * in AuditEntryInput when making breaking changes.
 *
 * @module audit/event-schema
 */
import { z } from 'zod';

// ─── Entity Lifecycle ───────────────────────────────────────────────

export const EntityLifecycleSchema = z.object({
    category: z.literal('entity_lifecycle'),
    entityName: z.string().min(1),
    operation: z.enum(['created', 'updated', 'deleted', 'restored', 'purged']),
    changedFields: z.array(z.string()).optional(),
    before: z.record(z.unknown()).optional(),
    after: z.record(z.unknown()).optional(),
    summary: z.string().optional(),
}).strict();

// ─── Status Change ──────────────────────────────────────────────────

export const StatusChangeSchema = z.object({
    category: z.literal('status_change'),
    entityName: z.string().min(1),
    fromStatus: z.string().nullable(),
    toStatus: z.string().min(1),
    reason: z.string().optional(),
}).strict();

// ─── Relationship ───────────────────────────────────────────────────

export const RelationshipSchema = z.object({
    category: z.literal('relationship'),
    operation: z.enum(['linked', 'unlinked']),
    sourceEntity: z.string().min(1),
    sourceId: z.string().min(1),
    targetEntity: z.string().min(1),
    targetId: z.string().min(1),
    relation: z.string().optional(),
}).strict();

// ─── Access ─────────────────────────────────────────────────────────

export const AccessSchema = z.object({
    category: z.literal('access'),
    operation: z.enum(['login', 'logout', 'session_revoked', 'permission_changed']),
    targetUserId: z.string().optional(),
    ipAddress: z.string().optional(),
    detail: z.string().optional(),
}).strict();

// ─── Data Lifecycle ─────────────────────────────────────────────────

export const DataLifecycleSchema = z.object({
    category: z.literal('data_lifecycle'),
    operation: z.enum(['purged', 'archived', 'retention_expired', 'exported']),
    recordCount: z.number().int().nonnegative().optional(),
    model: z.string().optional(),
    reason: z.string().optional(),
    graceDays: z.number().int().positive().optional(),
}).strict();

// ─── Custom ─────────────────────────────────────────────────────────
// For domain events that don't fit other categories.
// Allows arbitrary keys but MUST have `category: 'custom'`.

export const CustomSchema = z.object({
    category: z.literal('custom'),
}).passthrough();

// ─── Discriminated Union ────────────────────────────────────────────

/**
 * Canonical audit details schema — a discriminated union on `category`.
 *
 * Usage:
 *   const result = AuditDetailsSchema.safeParse(payload);
 *   if (result.success) { ... }
 */
export const AuditDetailsSchema = z.discriminatedUnion('category', [
    EntityLifecycleSchema,
    StatusChangeSchema,
    RelationshipSchema,
    AccessSchema,
    DataLifecycleSchema,
    CustomSchema,
]);

export type AuditDetailsPayload = z.infer<typeof AuditDetailsSchema>;
