/**
 * Org Audit Trail — Canonical Hashing
 *
 * Mirror of `canonical-hash.ts` for the org-scoped audit chain. Same
 * deterministic SHA-256 + canonical-JSON discipline; the field set is
 * different because org events are not tenant-scoped and carry a
 * targetUserId (the user being added/removed/role-changed) rather
 * than the tenant entity/entityId pair.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CANONICAL SERIALIZATION RULES (identical to AuditLog's)
 * ═══════════════════════════════════════════════════════════════════
 *
 * entryHash = SHA-256(canonicalJSON(hashPayload))
 *
 * hashPayload includes EXACTLY these fields (lexicographically sorted):
 *   - action          : OrgAuditAction enum value (string)
 *   - actorType       : string ("USER" | "SYSTEM")
 *   - actorUserId     : string | null
 *   - detailsJson     : object | null (canonical JSON, keys sorted recursively)
 *   - occurredAt      : string (ISO-8601 UTC, ms precision)
 *   - organizationId  : string
 *   - previousHash    : string | null (null for first entry per org)
 *   - targetUserId    : string | null
 *   - version         : number
 *
 * EXCLUDED (non-deterministic / metadata-only):
 *   - id              : auto-generated
 *   - requestId       : operational correlation, not audit content
 *
 * Reuses `canonicalJsonStringify` from `canonical-hash.ts` so the
 * serialization rules stay in one place.
 *
 * @module audit/org-canonical-hash
 */
import { createHash } from 'crypto';
import { canonicalJsonStringify } from './canonical-hash';

/**
 * Set of fields included in org-audit hash computation.
 * The order is lexicographic — this constant documents the contract.
 */
export const ORG_HASH_FIELDS = [
    'action',
    'actorType',
    'actorUserId',
    'detailsJson',
    'occurredAt',
    'organizationId',
    'previousHash',
    'targetUserId',
    'version',
] as const;

export interface OrgHashInput {
    organizationId: string;
    actorType: string;
    actorUserId: string | null;
    action: string; // OrgAuditAction enum value
    targetUserId: string | null;
    occurredAt: string; // ISO-8601 UTC
    detailsJson: unknown;
    previousHash: string | null;
    version: number;
}

export function buildOrgHashPayload(input: OrgHashInput): Record<string, unknown> {
    return {
        action: input.action,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        detailsJson: input.detailsJson ?? null,
        occurredAt: input.occurredAt,
        organizationId: input.organizationId,
        previousHash: input.previousHash,
        targetUserId: input.targetUserId,
        version: input.version,
    };
}

/**
 * Compute the SHA-256 hash for an org-audit entry.
 *
 * Returns lowercase hex (64 chars).
 */
export function computeOrgEntryHash(input: OrgHashInput): string {
    const payload = buildOrgHashPayload(input);
    const canonical = canonicalJsonStringify(payload);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
