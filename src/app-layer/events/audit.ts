import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export interface AuditEventPayload {
    action: string;
    entityType: string;
    entityId: string;
    details?: string;
    metadata?: Record<string, any>; // Must be safe/non-secret
}

/**
 * Centralized audit event writer.
 * Writes to the database natively and ensures standard context (requestId, tenantId) is attached.
 */
export async function logEvent(db: PrismaTx, ctx: RequestContext, payload: AuditEventPayload): Promise<void> {
    // Sanitize metadata to avoid accidental secret leak
    const safeMetadata = payload.metadata ? JSON.parse(JSON.stringify(payload.metadata)) : undefined;

    // Append standard context to details since Prisma AuditLog model lacks 'metadata'/'requestId' columns natively
    const standardContext = { requestId: ctx.requestId, ...safeMetadata };

    let combinedDetails = payload.details ? payload.details + '\n\n' : '';
    combinedDetails += `Context: ${JSON.stringify(standardContext)}`;

    await db.auditLog.create({
        data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            action: payload.action,
            entity: payload.entityType,
            entityId: payload.entityId,
            details: combinedDetails,
        }
    });
}
