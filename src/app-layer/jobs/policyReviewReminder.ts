/**
 * Policy Review Reminder Job Stub
 *
 * This module provides functions to find overdue policies and process review reminders.
 * It is designed to be called from a cron job or scheduler.
 *
 * ## How to hook into cron:
 *
 * ### Option 1: Vercel Cron (recommended for serverless)
 * Create a route at `src/app/api/cron/policy-review/route.ts`:
 * - Verify the Authorization header matches your CRON_SECRET env var
 * - Call `processOverdueReminders(getDbClient())`
 * - Add to vercel.json: `{ "crons": [{ "path": "/api/cron/policy-review", "schedule": "0 8 * * *" }] }`
 *
 * ### Option 2: node-cron (for self-hosted)
 * - Import this module and `getDbClient` from `@/lib/db-context`
 * - Schedule with: `cron.schedule('0 8 * * *', () => processOverdueReminders(getDbClient()))`
 */

import type { PrismaClient } from '@prisma/client';

export interface OverduePolicy {
    id: string;
    tenantId: string;
    title: string;
    slug: string;
    nextReviewAt: Date;
    daysOverdue: number;
    ownerUserId: string | null;
}

/**
 * Determine if a policy is overdue based on its nextReviewAt date.
 * Pure function, suitable for unit testing.
 */
export function isPolicyOverdue(nextReviewAt: Date | null | undefined, now: Date = new Date()): boolean {
    if (!nextReviewAt) return false;
    return nextReviewAt < now;
}

/**
 * Calculate days overdue. Returns 0 if not overdue.
 */
export function daysOverdue(nextReviewAt: Date | null | undefined, now: Date = new Date()): number {
    if (!nextReviewAt || nextReviewAt >= now) return 0;
    const diff = now.getTime() - nextReviewAt.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Find all policies across all tenants that are overdue for review.
 * Accepts a PrismaClient instance (dependency injection for testability).
 */
export async function findOverduePolicies(db: PrismaClient): Promise<OverduePolicy[]> {
    const now = new Date();
    const policies = await db.policy.findMany({
        where: {
            nextReviewAt: { lt: now },
            status: { not: 'ARCHIVED' },
        },
        select: {
            id: true,
            tenantId: true,
            title: true,
            slug: true,
            nextReviewAt: true,
            ownerUserId: true,
        },
    });

    return policies
        .filter(p => p.nextReviewAt !== null)
        .map(p => ({
            ...p,
            nextReviewAt: p.nextReviewAt!,
            daysOverdue: daysOverdue(p.nextReviewAt, now),
        }));
}

/**
 * Process overdue policy reminders.
 * Finds all overdue policies and emits audit events for each.
 * Accepts a PrismaClient instance (dependency injection).
 */
export async function processOverdueReminders(db: PrismaClient): Promise<{
    processed: number;
    policies: Array<{ id: string; tenantId: string; title: string; daysOverdue: number }>;
}> {
    const overdue = await findOverduePolicies(db);

    for (const policy of overdue) {
        await db.auditLog.create({
            data: {
                tenantId: policy.tenantId,
                userId: null,
                action: 'POLICY_REVIEW_OVERDUE',
                entity: 'Policy',
                entityId: policy.id,
                details: `Policy "${policy.title}" is ${policy.daysOverdue} day(s) overdue for review.`,
            },
        });
    }

    return {
        processed: overdue.length,
        policies: overdue.map(p => ({
            id: p.id,
            tenantId: p.tenantId,
            title: p.title,
            daysOverdue: p.daysOverdue,
        })),
    };
}
