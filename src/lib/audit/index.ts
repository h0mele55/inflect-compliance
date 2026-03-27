/**
 * Audit Trail — Barrel Export
 *
 * Re-exports all audit trail modules for clean imports:
 *   import { buildAuditEntry, AuditDetailsSchema, computeEntryHash } from '@/lib/audit';
 */

// Types & enums
export type {
    ActorType,
    AuditDetailCategory,
    AuditDetails,
    AuditEntryInput,
    AuditEntryOutput,
    EntityLifecycleDetails,
    StatusChangeDetails,
    RelationshipDetails,
    AccessDetails,
    DataLifecycleDetails,
    CustomDetails,
} from './types';

// Zod schemas for validation
export {
    AuditDetailsSchema,
    EntityLifecycleSchema,
    StatusChangeSchema,
    RelationshipSchema,
    AccessSchema,
    DataLifecycleSchema,
    CustomSchema,
} from './event-schema';
export type { AuditDetailsPayload } from './event-schema';

// Canonical hashing
export {
    computeEntryHash,
    canonicalJsonStringify,
    buildHashPayload,
    toCanonicalTimestamp,
    HASH_FIELDS,
} from './canonical-hash';
export type { HashInput } from './canonical-hash';

// Event builder
export { buildAuditEntry } from './event-builder';

// Hash-chained writer
export { appendAuditEntry, verifyAuditChain } from './audit-writer';
export type { AppendAuditInput, AppendAuditResult, ChainVerificationResult } from './audit-writer';
