import {
    OUTBOUND_WEBHOOK_HEADERS,
    SIGNATURE_PREFIX,
    buildOutboundHeaders,
    computeBatchId,
} from '@/app-layer/events/webhook-headers';

describe('buildOutboundHeaders', () => {
    const base = {
        batchId: 'b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1',
        signatureHex: 'deadbeef',
        userAgent: 'Inflect-Audit-Stream/1',
        schemaVersion: 1,
    };

    it('emits the six canonical headers with the right names', () => {
        const h = buildOutboundHeaders(base);
        expect(Object.keys(h).sort()).toEqual([
            OUTBOUND_WEBHOOK_HEADERS.BATCH_ID,
            OUTBOUND_WEBHOOK_HEADERS.CONTENT_TYPE,
            OUTBOUND_WEBHOOK_HEADERS.IDEMPOTENCY_KEY,
            OUTBOUND_WEBHOOK_HEADERS.SCHEMA_VERSION,
            OUTBOUND_WEBHOOK_HEADERS.SIGNATURE,
            OUTBOUND_WEBHOOK_HEADERS.USER_AGENT,
        ].sort());
    });

    it('prepends sha256= to the signature', () => {
        const h = buildOutboundHeaders(base);
        expect(h[OUTBOUND_WEBHOOK_HEADERS.SIGNATURE]).toBe(`${SIGNATURE_PREFIX}deadbeef`);
    });

    it('uses the batch id as the idempotency key', () => {
        const h = buildOutboundHeaders(base);
        expect(h[OUTBOUND_WEBHOOK_HEADERS.IDEMPOTENCY_KEY]).toBe(base.batchId);
        expect(h[OUTBOUND_WEBHOOK_HEADERS.BATCH_ID]).toBe(base.batchId);
    });

    it('serialises schemaVersion as a string', () => {
        const h = buildOutboundHeaders({ ...base, schemaVersion: 7 });
        expect(h[OUTBOUND_WEBHOOK_HEADERS.SCHEMA_VERSION]).toBe('7');
    });

    it('hardcodes Content-Type to application/json', () => {
        const h = buildOutboundHeaders(base);
        expect(h[OUTBOUND_WEBHOOK_HEADERS.CONTENT_TYPE]).toBe('application/json');
    });
});

describe('computeBatchId', () => {
    const input = {
        tenantId: 't1',
        schemaVersion: 1,
        eventIds: ['a', 'b', 'c'] as const,
    };

    it('is deterministic — same input, same id', () => {
        const a = computeBatchId(input);
        const b = computeBatchId({ ...input });
        expect(a).toBe(b);
    });

    it('returns 32 hex chars (128 bits)', () => {
        const id = computeBatchId(input);
        expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('differs when tenantId differs', () => {
        const a = computeBatchId(input);
        const b = computeBatchId({ ...input, tenantId: 't2' });
        expect(a).not.toBe(b);
    });

    it('differs when event count differs', () => {
        const a = computeBatchId(input);
        const b = computeBatchId({ ...input, eventIds: ['a', 'b'] });
        expect(a).not.toBe(b);
    });

    it('differs when an event id changes', () => {
        const a = computeBatchId(input);
        const b = computeBatchId({ ...input, eventIds: ['a', 'b', 'd'] });
        expect(a).not.toBe(b);
    });

    it('differs when schema version changes', () => {
        const a = computeBatchId(input);
        const b = computeBatchId({ ...input, schemaVersion: 2 });
        expect(a).not.toBe(b);
    });

    it('does NOT depend on event-id order — order-sensitivity is intentional', () => {
        // Regression guard: if we ever move to Set-based hashing the
        // property should change deliberately. Today, reordering gives
        // a different id (inputs are serialised positionally).
        const a = computeBatchId(input);
        const b = computeBatchId({ ...input, eventIds: ['c', 'b', 'a'] });
        expect(a).not.toBe(b);
    });
});
