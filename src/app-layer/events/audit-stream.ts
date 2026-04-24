/**
 * Epic C.4 — outbound audit-event streaming.
 *
 * Forwards every committed audit entry to a tenant-configured stream
 * endpoint (typically a SIEM ingest endpoint — Splunk HEC, Datadog Logs,
 * an S3-backed Lambda, etc.). Three things make this safe to put in front
 * of the audit writer:
 *
 *   1. **Out-of-band.** `streamAuditEvent` enqueues the event into a
 *      per-tenant in-memory buffer and returns immediately. The
 *      audit-insert path never awaits HTTP. A thrown error inside the
 *      streamer is caught at the call site so the audit row stays
 *      committed even if streaming is broken.
 *
 *   2. **Batched + bounded.** Per-tenant buffers flush on whichever
 *      comes first: 100 events OR 5 seconds. A flush that's already in
 *      flight blocks new flushes for the same tenant — eliminates
 *      thundering-herd POSTs during burst traffic.
 *
 *   3. **HMAC-signed.** Each batch carries an `X-Inflect-Signature:
 *      sha256=<hex>` header computed over the JSON body using the
 *      tenant's HMAC secret (which the schema stores encrypted via the
 *      Epic B field-encryption manifest). The same shape the existing
 *      `verifyHmacSha256` helper expects — tenants can plug it into a
 *      receiver they wrote against any other Inflect webhook.
 *
 * Privacy + payload shape
 * -----------------------
 *   - Free-text `details` is dropped from the payload — that field
 *     occasionally carries PII for human-readable audit-log rendering;
 *     SIEMs should consume the structured `detailsJson`.
 *   - Actor email is NEVER included; only the opaque `userId` and the
 *     `actorType`.
 *   - IP address is included when available (from the audit row's
 *     metadata), since it's already part of the existing audit shape.
 *
 * Process model
 * -------------
 *   The buffer is per-process. In a multi-process deployment, each Node
 *   process has its own buffer, which is fine for at-least-once-per-
 *   process semantics. A future hardening pass can move the buffer to
 *   Redis if cross-process coalescing becomes necessary.
 */

import { computeHmacSha256 } from '@/app-layer/integrations/webhook-crypto';
import { logger } from '@/lib/observability/logger';
import { buildOutboundHeaders, computeBatchId } from '@/app-layer/events/webhook-headers';

// ─── Public payload shape ──────────────────────────────────────────

export interface StreamedAuditEvent {
    /** Audit row id (cuid). Stable across replays. */
    id: string;
    /** Hash-chain hash for the row — receiver can verify chain integrity. */
    entryHash: string;
    /** Previous row's entryHash; null for the first row in the chain. */
    previousHash: string | null;
    /** Tenant the event belongs to. */
    tenantId: string;
    /** Acting principal — opaque id. Email is intentionally omitted. */
    userId: string | null;
    /** "USER" | "API_KEY" | "SYSTEM" — narrow string union, not enforced here. */
    actorType: string;
    /** e.g. "Control", "Permission", "UserSession". */
    entity: string;
    /** Identifier of the entity acted upon. */
    entityId: string;
    /** Action verb (CONTROL_CREATED, AUTHZ_DENIED, …). */
    action: string;
    /** Structured event payload — the SIEM-friendly source of truth. */
    detailsJson: unknown;
    /** Free-form metadata bag (request id, target user id, …). */
    metadataJson: unknown;
    /** Request id for correlation with logs / traces. */
    requestId: string | null;
    /** ISO timestamp when the row was committed. */
    occurredAt: string;
}

export interface AuditStreamPayload {
    /** Schema version — increment on breaking shape changes. */
    schemaVersion: 1;
    /** Tenant the entire batch belongs to (per-tenant batches). */
    tenantId: string;
    /** ISO timestamp when this batch was sent. */
    sentAt: string;
    /** Number of events in the batch. */
    count: number;
    events: StreamedAuditEvent[];
}

// ─── Configuration ─────────────────────────────────────────────────

/** Flush whenever this many events accumulate for a single tenant. */
const FLUSH_AT_COUNT = 100;
/** Flush every N ms even if FLUSH_AT_COUNT hasn't been hit. */
const FLUSH_INTERVAL_MS = 5_000;
/** HTTP timeout for an individual POST. */
const POST_TIMEOUT_MS = 10_000;
/** Hard cap on buffered events per tenant — drops oldest above this. */
const BUFFER_HARD_CAP = 1_000;

const USER_AGENT = 'Inflect-Audit-Stream/1';
const SCHEMA_VERSION = 1;

// ─── Tenant config resolver (overridable for tests) ────────────────

export interface TenantStreamConfig {
    url: string;
    secret: string;
}

/**
 * Resolve a tenant's audit-stream config. Returns null when streaming
 * is disabled for this tenant. Lazy-imports prisma + the tenant
 * key-manager so a unit test can stub the resolver without dragging
 * the whole DB layer in.
 */
async function defaultResolveTenantStreamConfig(
    tenantId: string,
): Promise<TenantStreamConfig | null> {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.tenantSecuritySettings.findUnique({
        where: { tenantId },
        select: {
            auditStreamUrl: true,
            auditStreamSecretEncrypted: true,
        },
    });
    if (!settings?.auditStreamUrl || !settings.auditStreamSecretEncrypted) {
        return null;
    }
    // Field-encryption middleware decrypts on read, so the value here
    // is already plaintext. (See `encrypted-fields.ts` manifest.)
    return {
        url: settings.auditStreamUrl,
        secret: settings.auditStreamSecretEncrypted,
    };
}

let resolveTenantStreamConfig:
    (tenantId: string) => Promise<TenantStreamConfig | null> =
    defaultResolveTenantStreamConfig;

/**
 * Test-only seam — swap in a deterministic resolver. Production code
 * should never call this (and there's no public re-export from a
 * barrel file, so app-layer code can't reach it accidentally).
 */
export function __setTenantStreamConfigResolver(
    fn: ((tenantId: string) => Promise<TenantStreamConfig | null>) | null,
): void {
    resolveTenantStreamConfig = fn ?? defaultResolveTenantStreamConfig;
}

// ─── HTTP transport (overridable for tests) ────────────────────────

export type StreamPostFn = (
    url: string,
    body: string,
    headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; statusText?: string }>;

const defaultPost: StreamPostFn = async (url, body, headers) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'POST',
            body,
            headers,
            signal: controller.signal,
        });
        return { ok: res.ok, status: res.status, statusText: res.statusText };
    } finally {
        clearTimeout(timer);
    }
};

let postFn: StreamPostFn = defaultPost;

export function __setStreamPost(fn: StreamPostFn | null): void {
    postFn = fn ?? defaultPost;
}

// ─── Per-tenant buffer ─────────────────────────────────────────────

interface TenantBuffer {
    events: StreamedAuditEvent[];
    timer: NodeJS.Timeout | null;
    flushInFlight: Promise<void> | null;
}

const buffers = new Map<string, TenantBuffer>();

function getBuffer(tenantId: string): TenantBuffer {
    let buf = buffers.get(tenantId);
    if (!buf) {
        buf = { events: [], timer: null, flushInFlight: null };
        buffers.set(tenantId, buf);
    }
    return buf;
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Enqueue an event for streaming. Returns synchronously after the
 * event is buffered. Never throws — the call site wraps this anyway,
 * but defence-in-depth so a future caller refactor can't accidentally
 * break the audit writer.
 *
 * Tenants with no webhook URL still buffer (cheap) — the flush short-
 * circuits when the resolver returns null. This matters because the
 * settings can be enabled without a process restart.
 */
export function streamAuditEvent(event: StreamedAuditEvent): void {
    if (!event.tenantId) return;
    try {
        const buf = getBuffer(event.tenantId);

        // Hard-cap defence: drop the oldest event when over cap. The
        // alternative (block / throw) would propagate back into the
        // audit writer.
        if (buf.events.length >= BUFFER_HARD_CAP) {
            buf.events.shift();
            logger.warn('audit-stream buffer overflow — dropped oldest event', {
                component: 'audit-stream',
                tenantId: event.tenantId,
            });
        }
        buf.events.push(event);

        // Schedule the periodic flush on first event.
        if (!buf.timer) {
            buf.timer = setTimeout(
                () => void flushTenant(event.tenantId),
                FLUSH_INTERVAL_MS,
            );
            // Don't keep the Node event loop alive just for the flush —
            // graceful shutdown should still happen on SIGTERM.
            buf.timer.unref?.();
        }

        if (buf.events.length >= FLUSH_AT_COUNT) {
            void flushTenant(event.tenantId);
        }
    } catch (err) {
        logger.warn('audit-stream enqueue failed', {
            component: 'audit-stream',
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Flush every tenant immediately. Awaits the in-flight POSTs.
 *
 * Used by:
 *   - Tests, to deterministically push a buffer without waiting 5s.
 *   - The future graceful-shutdown hook, to drain on SIGTERM.
 */
export async function flushAllAuditStreams(): Promise<void> {
    await Promise.all(
        Array.from(buffers.keys()).map((tenantId) => flushTenant(tenantId)),
    );
}

/**
 * Drop all buffered events without sending. Test convenience — never
 * call from app code.
 */
export function __resetAuditStreamForTests(): void {
    for (const buf of buffers.values()) {
        if (buf.timer) clearTimeout(buf.timer);
    }
    buffers.clear();
}

// ─── Flush ─────────────────────────────────────────────────────────

async function flushTenant(tenantId: string): Promise<void> {
    const buf = buffers.get(tenantId);
    if (!buf) return;

    // Coalesce concurrent flushes so a 5s timer + a 100-event trigger
    // don't both POST the same batch.
    if (buf.flushInFlight) {
        return buf.flushInFlight;
    }

    buf.flushInFlight = (async () => {
        try {
            // Snapshot + clear the buffer atomically (single-threaded JS).
            // Future events accumulate against the empty buffer.
            if (buf.timer) {
                clearTimeout(buf.timer);
                buf.timer = null;
            }
            const batch = buf.events;
            buf.events = [];
            if (batch.length === 0) return;

            const config = await resolveTenantStreamConfig(tenantId);
            if (!config) {
                // Streaming disabled for this tenant — events are
                // silently dropped (still in the audit table; not lost).
                return;
            }

            await deliverBatch(tenantId, config, batch);
        } catch (err) {
            logger.warn('audit-stream flush failed', {
                component: 'audit-stream',
                tenantId,
                error: err instanceof Error ? err.message : String(err),
            });
        } finally {
            buf.flushInFlight = null;
        }
    })();

    return buf.flushInFlight;
}

async function deliverBatch(
    tenantId: string,
    config: TenantStreamConfig,
    batch: StreamedAuditEvent[],
): Promise<void> {
    const payload: AuditStreamPayload = {
        schemaVersion: SCHEMA_VERSION,
        tenantId,
        sentAt: new Date().toISOString(),
        count: batch.length,
        events: batch,
    };
    const body = JSON.stringify(payload);
    const signatureHex = computeHmacSha256(body, config.secret, 'hex');
    const batchId = computeBatchId({
        tenantId,
        schemaVersion: SCHEMA_VERSION,
        eventIds: batch.map((e) => e.id),
    });

    const headers = buildOutboundHeaders({
        batchId,
        signatureHex,
        userAgent: USER_AGENT,
        schemaVersion: SCHEMA_VERSION,
    });

    const result = await postFn(config.url, body, headers);

    if (!result.ok) {
        logger.warn('audit-stream POST returned non-2xx', {
            component: 'audit-stream',
            tenantId,
            batchId,
            status: result.status,
            statusText: result.statusText,
            count: batch.length,
        });
    } else {
        logger.info('audit-stream batch delivered', {
            component: 'audit-stream',
            tenantId,
            batchId,
            status: result.status,
            count: batch.length,
        });
    }
}
