/**
 * Outbound-webhook header conventions.
 *
 * Every outbound webhook this repo emits (audit-stream today; future
 * SCIM push, billing fanout, SIEM pluralisation) goes through this
 * module. Two invariants worth protecting:
 *
 *   1. Header names are defined once, in one place. Callers never
 *      spell `X-Inflect-Batch-Id` inline — they read the const.
 *   2. The Batch-Id IS the Idempotency-Key. A retry carries the same
 *      id, so SIEM consumers dedupe without knowing anything about
 *      our retry policy. Determinism of `computeBatchId` is the
 *      load-bearing property — never switch to a random id.
 */

import { createHash } from 'node:crypto';

export const OUTBOUND_WEBHOOK_HEADERS = {
    CONTENT_TYPE: 'Content-Type',
    USER_AGENT: 'User-Agent',
    BATCH_ID: 'X-Inflect-Batch-Id',
    SIGNATURE: 'X-Inflect-Signature',
    IDEMPOTENCY_KEY: 'X-Inflect-Idempotency-Key',
    SCHEMA_VERSION: 'X-Inflect-Schema-Version',
} as const;

export const SIGNATURE_PREFIX = 'sha256=';

interface BuildOutboundHeadersArgs {
    /** Deterministic batch id from `computeBatchId`. Also used as the Idempotency-Key. */
    batchId: string;
    /** Raw hex HMAC-SHA256 of the request body. The builder adds the 'sha256=' prefix. */
    signatureHex: string;
    /** Caller User-Agent string (e.g. 'Inflect-Audit-Stream/1'). */
    userAgent: string;
    /** Payload schema version. Matches `payload.schemaVersion` for consumer routing. */
    schemaVersion: number;
}

export function buildOutboundHeaders(args: BuildOutboundHeadersArgs): Record<string, string> {
    return {
        [OUTBOUND_WEBHOOK_HEADERS.CONTENT_TYPE]: 'application/json',
        [OUTBOUND_WEBHOOK_HEADERS.USER_AGENT]: args.userAgent,
        [OUTBOUND_WEBHOOK_HEADERS.BATCH_ID]: args.batchId,
        [OUTBOUND_WEBHOOK_HEADERS.SIGNATURE]: `${SIGNATURE_PREFIX}${args.signatureHex}`,
        [OUTBOUND_WEBHOOK_HEADERS.IDEMPOTENCY_KEY]: args.batchId,
        [OUTBOUND_WEBHOOK_HEADERS.SCHEMA_VERSION]: String(args.schemaVersion),
    };
}

/**
 * Deterministic batch id. Same (tenant, schema, eventIds) → same id.
 * A PR-4 retry of a failed delivery carries an identical Batch-Id,
 * letting consumers dedupe without any retry-aware code on our side.
 *
 * Hashes inputs stable across payload-body tweaks (only ids are hashed,
 * not event bodies) so re-formatting the payload doesn't change the id.
 *
 * Output is 128 bits (32 hex chars) — sufficient collision space for
 * per-tenant dedup windows (SIEMs typically retain ids for hours-days).
 */
export function computeBatchId(args: {
    tenantId: string;
    schemaVersion: number;
    eventIds: readonly string[];
}): string {
    const h = createHash('sha256');
    h.update(args.tenantId);
    h.update('|');
    h.update(String(args.schemaVersion));
    h.update('|');
    h.update(String(args.eventIds.length));
    for (const id of args.eventIds) {
        h.update('|');
        h.update(id);
    }
    return h.digest('hex').slice(0, 32);
}
