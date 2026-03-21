/**
 * Enqueue an email into the NotificationOutbox.
 *
 * - Builds email content from templates.
 * - Computes dedupeKey to prevent duplicate sends for the same event.
 * - Uses Prisma's unique constraint to skip silently on duplicates.
 * - Logs with requestId for correlation.
 */

import type { PrismaTx } from '@/lib/db-context';
import type { EmailNotificationType } from '@prisma/client';
import { isNotificationsEnabled } from './settings';
import {
    buildTaskAssignedEmail,
    buildEvidenceExpiringEmail,
    buildPolicyApprovalRequestedEmail,
    buildPolicyDecisionEmail,
    type TaskAssignedPayload,
    type EvidenceExpiringPayload,
    type PolicyApprovalRequestedPayload,
    type PolicyDecisionPayload,
} from './templates';

export interface EnqueueEmailInput {
    tenantId: string;
    type: EmailNotificationType;
    toEmail: string;
    entityId: string;
    payload: TaskAssignedPayload | EvidenceExpiringPayload | PolicyApprovalRequestedPayload | PolicyDecisionPayload;
    sendAfter?: Date;
    requestId?: string;
}

/**
 * Build a dedupe key for idempotent email sending.
 * Format: {tenantId}:{type}:{email}:{entityId}:{YYYY-MM-DD}
 */
export function buildDedupeKey(
    tenantId: string,
    type: string,
    email: string,
    entityId: string,
    date: Date = new Date(),
): string {
    const day = date.toISOString().slice(0, 10); // YYYY-MM-DD
    return `${tenantId}:${type}:${email}:${entityId}:${day}`;
}

/**
 * Enqueue an email notification into the outbox.
 * Silently skips if dedupeKey already exists (idempotent).
 * Silently skips if tenant notifications are disabled.
 *
 * @returns The created record, or null if duplicate/disabled.
 */
export async function enqueueEmail(
    db: PrismaTx,
    input: EnqueueEmailInput,
): Promise<{ id: string; dedupeKey: string } | null> {
    const { tenantId, type, toEmail, entityId, payload, sendAfter, requestId } = input;

    // Check tenant settings — skip if disabled
    const enabled = await isNotificationsEnabled(db, tenantId);
    if (!enabled) {
        if (requestId) {
            console.log(`[notifications] Skipped — disabled for tenant ${tenantId} (requestId=${requestId})`);
        }
        return null;
    }

    // Build email content from template
    const { subject, bodyText, bodyHtml } = buildEmailContent(type, payload);

    // Compute dedupe key
    const dedupeKey = buildDedupeKey(tenantId, type, toEmail, entityId);

    try {
        const record = await (db as any).notificationOutbox.create({  // eslint-disable-line @typescript-eslint/no-explicit-any
            data: {
                tenantId,
                type,
                toEmail,
                subject,
                bodyText,
                bodyHtml,
                dedupeKey,
                ...(sendAfter ? { sendAfter } : {}),
            },
        });

        if (requestId) {
            console.log(`[notifications] Enqueued ${type} email to ${toEmail} (requestId=${requestId}, dedupeKey=${dedupeKey})`);
        }

        return { id: record.id, dedupeKey };
    } catch (error: unknown) {
        // Prisma P2002 = unique constraint violation → duplicate, skip silently
        if (isPrismaUniqueConstraintError(error)) {
            if (requestId) {
                console.log(`[notifications] Skipped duplicate ${type} email to ${toEmail} (requestId=${requestId}, dedupeKey=${dedupeKey})`);
            }
            return null;
        }
        throw error;
    }
}

/**
 * Build email content based on notification type.
 */
function buildEmailContent(
    type: EmailNotificationType,
    payload: TaskAssignedPayload | EvidenceExpiringPayload | PolicyApprovalRequestedPayload | PolicyDecisionPayload,
): { subject: string; bodyText: string; bodyHtml: string } {
    switch (type) {
        case 'TASK_ASSIGNED':
            return buildTaskAssignedEmail(payload as TaskAssignedPayload);
        case 'EVIDENCE_EXPIRING':
            return buildEvidenceExpiringEmail(payload as EvidenceExpiringPayload);
        case 'POLICY_APPROVAL_REQUESTED':
            return buildPolicyApprovalRequestedEmail(payload as PolicyApprovalRequestedPayload);
        case 'POLICY_APPROVED':
            return buildPolicyDecisionEmail({ ...(payload as PolicyDecisionPayload), decision: 'APPROVED' });
        case 'POLICY_REJECTED':
            return buildPolicyDecisionEmail({ ...(payload as PolicyDecisionPayload), decision: 'REJECTED' });
        default:
            throw new Error(`Unknown notification type: ${type}`);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPrismaUniqueConstraintError(error: any): boolean {
    return error?.code === 'P2002' || error?.message?.includes('Unique constraint');
}
