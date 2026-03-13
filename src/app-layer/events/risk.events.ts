import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { logEvent } from './audit';

/**
 * Typed risk event emitters.
 * Thin wrappers over the centralized audit-log writer.
 */

export async function emitRiskCreated(
    db: PrismaTx,
    ctx: RequestContext,
    risk: { id: string; title: string; score: number }
): Promise<void> {
    await logEvent(db, ctx, {
        action: 'RISK_CREATED',
        entityType: 'Risk',
        entityId: risk.id,
        details: `Created risk: ${risk.title} (score: ${risk.score})`,
    });
}

export async function emitRiskUpdated(
    db: PrismaTx,
    ctx: RequestContext,
    riskId: string,
    changes: Record<string, unknown>
): Promise<void> {
    await logEvent(db, ctx, {
        action: 'RISK_UPDATED',
        entityType: 'Risk',
        entityId: riskId,
        details: `Updated risk fields: ${Object.keys(changes).join(', ')}`,
    });
}

export async function emitRiskStatusChanged(
    db: PrismaTx,
    ctx: RequestContext,
    riskId: string,
    oldStatus: string,
    newStatus: string
): Promise<void> {
    await logEvent(db, ctx, {
        action: 'RISK_STATUS_CHANGED',
        entityType: 'Risk',
        entityId: riskId,
        details: `Status changed from ${oldStatus} to ${newStatus}`,
    });
}

export async function emitRiskControlsMapped(
    db: PrismaTx,
    ctx: RequestContext,
    riskId: string,
    controlId: string,
    action: 'LINKED' | 'UNLINKED'
): Promise<void> {
    await logEvent(db, ctx, {
        action: 'RISK_CONTROLS_MAPPED',
        entityType: 'RiskControl',
        entityId: riskId,
        details: `Control ${controlId} ${action.toLowerCase()} ${action === 'LINKED' ? 'to' : 'from'} risk`,
    });
}
