/**
 * Vendor Renewals & Reminders Job Stubs
 *
 * These functions would be called by a cron job / worker.
 * For now they emit events; no email provider required.
 */

import prisma from '@/lib/prisma';
import { logEvent } from '../events/audit';
import { logger } from '@/lib/observability/logger';

export interface DueVendor {
    id: string;
    tenantId: string;
    name: string;
    type: 'REVIEW_DUE' | 'REVIEW_OVERDUE' | 'RENEWAL_DUE' | 'RENEWAL_OVERDUE';
    dueDate: Date;
}

/**
 * Find vendors with upcoming or overdue reviews/renewals and emit events.
 */
export async function findDueVendorsAndEmitEvents(): Promise<DueVendor[]> {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const in60 = new Date(now.getTime() + 60 * 86400000);

    const results: DueVendor[] = [];

    // Overdue reviews
    const overdueReviews = await prisma.vendor.findMany({
        where: { nextReviewAt: { lt: now }, status: { not: 'OFFBOARDED' } },
        select: { id: true, tenantId: true, name: true, nextReviewAt: true },
    });
    for (const v of overdueReviews) {
        results.push({ id: v.id, tenantId: v.tenantId, name: v.name, type: 'REVIEW_OVERDUE', dueDate: v.nextReviewAt! });
    }

    // Reviews due in 30 days
    const dueReviews = await prisma.vendor.findMany({
        where: { nextReviewAt: { gte: now, lte: in30 }, status: { not: 'OFFBOARDED' } },
        select: { id: true, tenantId: true, name: true, nextReviewAt: true },
    });
    for (const v of dueReviews) {
        results.push({ id: v.id, tenantId: v.tenantId, name: v.name, type: 'REVIEW_DUE', dueDate: v.nextReviewAt! });
    }

    // Overdue renewals
    const overdueRenewals = await prisma.vendor.findMany({
        where: { contractRenewalAt: { lt: now }, status: { not: 'OFFBOARDED' } },
        select: { id: true, tenantId: true, name: true, contractRenewalAt: true },
    });
    for (const v of overdueRenewals) {
        results.push({ id: v.id, tenantId: v.tenantId, name: v.name, type: 'RENEWAL_OVERDUE', dueDate: v.contractRenewalAt! });
    }

    // Renewals due in 30 days
    const dueRenewals = await prisma.vendor.findMany({
        where: { contractRenewalAt: { gte: now, lte: in30 }, status: { not: 'OFFBOARDED' } },
        select: { id: true, tenantId: true, name: true, contractRenewalAt: true },
    });
    for (const v of dueRenewals) {
        results.push({ id: v.id, tenantId: v.tenantId, name: v.name, type: 'RENEWAL_DUE', dueDate: v.contractRenewalAt! });
    }

    // Log events (using a system context since this is a job)
    for (const item of results) {
        const action = item.type === 'REVIEW_OVERDUE' ? 'VENDOR_REVIEW_OVERDUE'
            : item.type === 'REVIEW_DUE' ? 'VENDOR_REVIEW_DUE'
                : item.type === 'RENEWAL_OVERDUE' ? 'VENDOR_RENEWAL_OVERDUE'
                    : 'VENDOR_RENEWAL_DUE';

        logger.info('vendor due event', { component: 'job', action, vendorName: item.name, dueDate: item.dueDate.toISOString() });
    }

    return results;
}

/**
 * Pure helper: classify a date as overdue / due-soon / ok.
 */
export function classifyDueDate(date: Date | string | null, daysThreshold = 30): 'overdue' | 'due-soon' | 'ok' | 'none' {
    if (!date) return 'none';
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    if (d < now) return 'overdue';
    const diff = (d.getTime() - now.getTime()) / 86400000;
    if (diff <= daysThreshold) return 'due-soon';
    return 'ok';
}
