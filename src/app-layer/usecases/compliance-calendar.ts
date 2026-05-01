/**
 * Epic 49 — `getComplianceCalendarEvents` usecase.
 *
 * Single aggregation that fans out across the date-bearing entities and
 * normalises every result into the unified `CalendarEvent` shape:
 *
 *   - Evidence       (nextReviewDate, expiredAt)
 *   - Policy         (nextReviewAt)
 *   - Vendor         (nextReviewAt, contractRenewalAt)
 *   - VendorDocument (validTo)
 *   - AuditCycle     (periodStartAt → periodEndAt — the only duration source today)
 *   - Control        (nextDueAt)
 *   - ControlTestPlan(nextDueAt)
 *   - Task           (dueAt)
 *   - Risk           (nextReviewAt, targetDate)
 *   - Finding        (dueDate)
 *
 * Tenant isolation: every Prisma query starts with `tenantId: ctx.tenantId`.
 *
 * Range bounding: the schema guarantees `from <= to <= from + 2y`. Inside
 * the usecase we issue parallel point queries with date predicates so the
 * DB can use the per-entity indexes on the date columns + `(tenantId, …)`.
 *
 * Status mapping: each source maps its lifecycle status into one of
 * `scheduled | due_soon | overdue | done | unknown`. The map is local
 * to the source (one place to look when a new entity is added).
 */

import { prisma } from '@/lib/prisma';
import { assertCanRead } from '../policies/common';
import type { RequestContext } from '../types';
import {
    type CalendarEvent,
    type CalendarEventCategory,
    type CalendarEventStatus,
    type CalendarEventType,
    type CalendarResponse,
    CALENDAR_EVENT_CATEGORIES,
    CALENDAR_EVENT_STATUSES,
} from '../schemas/calendar.schemas';

// ─── Public entry point ──────────────────────────────────────────────

export interface GetCalendarEventsInput {
    from: Date;
    to: Date;
    /** Optional filter — when set, only these types are returned. */
    types?: ReadonlyArray<CalendarEventType>;
    /** Optional filter — when set, only these categories are returned. */
    categories?: ReadonlyArray<CalendarEventCategory>;
    /** Override "now" for tests. Default: new Date(). */
    now?: Date;
    /**
     * Per-source result cap. Default: 500. Stops a runaway entity (one
     * tenant with 50k overdue tasks) from overwhelming the response.
     */
    perSourceLimit?: number;
}

export async function getComplianceCalendarEvents(
    ctx: RequestContext,
    input: GetCalendarEventsInput,
): Promise<CalendarResponse> {
    assertCanRead(ctx);

    const now = input.now ?? new Date();
    const limit = input.perSourceLimit ?? 500;
    const range = { from: input.from, to: input.to };

    // Fan-out to every source in parallel. Each source returns a flat
    // CalendarEvent[] and is responsible for its own status mapping.
    const [
        evidenceEvents,
        policyEvents,
        vendorEvents,
        vendorDocEvents,
        auditCycleEvents,
        controlEvents,
        testPlanEvents,
        taskEvents,
        riskEvents,
        findingEvents,
    ] = await Promise.all([
        loadEvidenceEvents(ctx, range, now, limit),
        loadPolicyEvents(ctx, range, now, limit),
        loadVendorEvents(ctx, range, now, limit),
        loadVendorDocumentEvents(ctx, range, now, limit),
        loadAuditCycleEvents(ctx, range, now, limit),
        loadControlEvents(ctx, range, now, limit),
        loadTestPlanEvents(ctx, range, now, limit),
        loadTaskEvents(ctx, range, now, limit),
        loadRiskEvents(ctx, range, now, limit),
        loadFindingEvents(ctx, range, now, limit),
    ]);

    let all: CalendarEvent[] = [
        ...evidenceEvents,
        ...policyEvents,
        ...vendorEvents,
        ...vendorDocEvents,
        ...auditCycleEvents,
        ...controlEvents,
        ...testPlanEvents,
        ...taskEvents,
        ...riskEvents,
        ...findingEvents,
    ];

    // Apply the type / category filter post-aggregation. The per-source
    // queries don't filter by type because most sources contribute one
    // type only; pushing the predicate up keeps the loaders simple.
    if (input.types && input.types.length > 0) {
        const allowed = new Set<string>(input.types);
        all = all.filter((e) => allowed.has(e.type));
    }
    if (input.categories && input.categories.length > 0) {
        const allowed = new Set<string>(input.categories);
        all = all.filter((e) => allowed.has(e.category));
    }

    // Stable order: ascending by date — heatmap + month rendering
    // consumes events in chronological order.
    all.sort((a, b) => a.date.localeCompare(b.date));

    return {
        events: all,
        counts: countSummaries(all),
        range: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
        },
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────

interface DateRange {
    from: Date;
    to: Date;
}

/**
 * Map a date+status into a calendar status. `now` is the comparison
 * anchor; `due_soon` window is 7 days. `done`/`scheduled` are decided
 * by the caller's domain logic and pass through verbatim.
 */
function classifyStatus(
    eventDate: Date,
    now: Date,
    isDone: boolean,
): CalendarEventStatus {
    if (isDone) return 'done';
    const diffMs = eventDate.getTime() - now.getTime();
    if (diffMs < 0) return 'overdue';
    if (diffMs <= 7 * 86_400_000) return 'due_soon';
    return 'scheduled';
}

function tenantHrefFromCtx(ctx: RequestContext, path: string): string {
    // Usecases don't know the slug, only the tenantId. The route handler
    // resolves slug; we leave a `/t/{slug}` placeholder that the route
    // handler rewrites. Keeping it server-side stops every UI from
    // re-implementing the same prefix.
    if (!ctx.tenantSlug) return path;
    return `/t/${ctx.tenantSlug}${path.startsWith('/') ? path : `/${path}`}`;
}

function countSummaries(events: CalendarEvent[]) {
    const byCategory: Record<CalendarEventCategory, number> = Object.fromEntries(
        CALENDAR_EVENT_CATEGORIES.map((c) => [c, 0]),
    ) as Record<CalendarEventCategory, number>;
    const byStatus: Record<CalendarEventStatus, number> = Object.fromEntries(
        CALENDAR_EVENT_STATUSES.map((s) => [s, 0]),
    ) as Record<CalendarEventStatus, number>;
    for (const e of events) {
        byCategory[e.category]++;
        byStatus[e.status]++;
    }
    return { total: events.length, byCategory, byStatus };
}

// ─── Per-source loaders ──────────────────────────────────────────────

async function loadEvidenceEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.evidence.findMany({
        where: {
            tenantId: ctx.tenantId,
            nextReviewDate: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            nextReviewDate: true,
            status: true,
            ownerUserId: true,
        },
        take: limit,
    });
    return rows
        .filter((r) => r.nextReviewDate)
        .map((r): CalendarEvent => {
            const date = r.nextReviewDate as Date;
            const isDone = r.status === 'APPROVED' && date > now;
            return {
                id: `EVIDENCE:${r.id}:evidence-review`,
                type: 'evidence-review',
                category: 'evidence',
                title: `Evidence review: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'EVIDENCE',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/evidence/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            };
        });
}

async function loadPolicyEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.policy.findMany({
        where: {
            tenantId: ctx.tenantId,
            nextReviewAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            nextReviewAt: true,
            status: true,
        },
        take: limit,
    });
    return rows
        .filter((r) => r.nextReviewAt)
        .map((r): CalendarEvent => {
            const date = r.nextReviewAt as Date;
            const isDone = r.status === 'ARCHIVED';
            return {
                id: `POLICY:${r.id}:policy-review`,
                type: 'policy-review',
                category: 'policy',
                title: `Policy review: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'POLICY',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/policies/${r.id}`),
            };
        });
}

async function loadVendorEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.vendor.findMany({
        where: {
            tenantId: ctx.tenantId,
            OR: [
                { nextReviewAt: { not: null, gte: range.from, lte: range.to } },
                {
                    contractRenewalAt: {
                        not: null,
                        gte: range.from,
                        lte: range.to,
                    },
                },
            ],
        },
        select: {
            id: true,
            name: true,
            nextReviewAt: true,
            contractRenewalAt: true,
            status: true,
            ownerUserId: true,
        },
        take: limit,
    });
    const events: CalendarEvent[] = [];
    for (const r of rows) {
        const isOffboarded = r.status === 'OFFBOARDED';
        if (
            r.nextReviewAt &&
            r.nextReviewAt >= range.from &&
            r.nextReviewAt <= range.to
        ) {
            events.push({
                id: `VENDOR:${r.id}:vendor-review`,
                type: 'vendor-review',
                category: 'vendor',
                title: `Vendor review: ${r.name}`,
                date: r.nextReviewAt.toISOString(),
                status: classifyStatus(r.nextReviewAt, now, isOffboarded),
                entityType: 'VENDOR',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/vendors/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            });
        }
        if (
            r.contractRenewalAt &&
            r.contractRenewalAt >= range.from &&
            r.contractRenewalAt <= range.to
        ) {
            events.push({
                id: `VENDOR:${r.id}:vendor-renewal`,
                type: 'vendor-renewal',
                category: 'vendor',
                title: `Contract renewal: ${r.name}`,
                date: r.contractRenewalAt.toISOString(),
                status: classifyStatus(
                    r.contractRenewalAt,
                    now,
                    isOffboarded,
                ),
                entityType: 'VENDOR',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/vendors/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            });
        }
    }
    return events;
}

async function loadVendorDocumentEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.vendorDocument.findMany({
        where: {
            tenantId: ctx.tenantId,
            validTo: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            type: true,
            validTo: true,
            vendorId: true,
            vendor: { select: { name: true } },
        },
        take: limit,
    });
    return rows
        .filter((r) => r.validTo)
        .map((r): CalendarEvent => {
            const date = r.validTo as Date;
            return {
                id: `VENDOR_DOCUMENT:${r.id}:vendor-document-expiry`,
                type: 'vendor-document-expiry',
                category: 'vendor',
                title: `${r.type} expires: ${r.vendor.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, false),
                entityType: 'VENDOR_DOCUMENT',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/vendors/${r.vendorId}`),
            };
        });
}

async function loadAuditCycleEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    // AuditCycle is the only duration source today: emits an event with
    // `start` (periodStartAt) and `end` (periodEndAt). Either bound
    // intersecting the queried range surfaces the cycle.
    const rows = await prisma.auditCycle.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            OR: [
                { periodStartAt: { gte: range.from, lte: range.to } },
                { periodEndAt: { gte: range.from, lte: range.to } },
                {
                    AND: [
                        { periodStartAt: { lte: range.from } },
                        { periodEndAt: { gte: range.to } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            name: true,
            frameworkKey: true,
            periodStartAt: true,
            periodEndAt: true,
            status: true,
        },
        take: limit,
    });
    return rows
        .filter((r) => r.periodStartAt || r.periodEndAt)
        .map((r): CalendarEvent => {
            const start = r.periodStartAt ?? r.periodEndAt!;
            const end =
                r.periodEndAt && r.periodStartAt && r.periodEndAt !== r.periodStartAt
                    ? r.periodEndAt
                    : undefined;
            const isDone = r.status === 'COMPLETE';
            return {
                id: `AUDIT_CYCLE:${r.id}:audit-cycle`,
                type: 'audit-cycle',
                category: 'audit',
                title: `Audit cycle: ${r.name}`,
                date: start.toISOString(),
                end: end?.toISOString(),
                status: classifyStatus(end ?? start, now, isDone),
                entityType: 'AUDIT_CYCLE',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/audits/cycles/${r.id}`),
                detail: r.frameworkKey,
            };
        });
}

async function loadControlEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.control.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            applicability: 'APPLICABLE',
            nextDueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            name: true,
            nextDueAt: true,
            status: true,
            ownerUserId: true,
        },
        take: limit,
    });
    return rows
        .filter((r) => r.nextDueAt)
        .map((r): CalendarEvent => {
            const date = r.nextDueAt as Date;
            const isDone = r.status === 'IMPLEMENTED';
            return {
                id: `CONTROL:${r.id}:control-review`,
                type: 'control-review',
                category: 'control',
                title: `Control review: ${r.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'CONTROL',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/controls/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            };
        });
}

async function loadTestPlanEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.controlTestPlan.findMany({
        where: {
            tenantId: ctx.tenantId,
            status: 'ACTIVE',
            nextDueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            name: true,
            nextDueAt: true,
            controlId: true,
            control: { select: { name: true } },
        },
        take: limit,
    });
    return rows
        .filter((r) => r.nextDueAt)
        .map((r): CalendarEvent => {
            const date = r.nextDueAt as Date;
            return {
                id: `CONTROL_TEST_PLAN:${r.id}:control-test-due`,
                type: 'control-test-due',
                category: 'control',
                title: `Test due: ${r.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, false),
                entityType: 'CONTROL_TEST_PLAN',
                entityId: r.id,
                href: tenantHrefFromCtx(
                    ctx,
                    `/controls/${r.controlId}/tests/${r.id}`,
                ),
                detail: r.control.name,
            };
        });
}

async function loadTaskEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.task.findMany({
        where: {
            tenantId: ctx.tenantId,
            dueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            dueAt: true,
            status: true,
            assigneeUserId: true,
        },
        take: limit,
    });
    return rows
        .filter((r) => r.dueAt)
        .map((r): CalendarEvent => {
            const date = r.dueAt as Date;
            const isDone =
                r.status === 'RESOLVED' ||
                r.status === 'CLOSED' ||
                r.status === 'CANCELED';
            return {
                id: `TASK:${r.id}:task-due`,
                type: 'task-due',
                category: 'task',
                title: `Task due: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'TASK',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/tasks/${r.id}`),
                ownerUserId: r.assigneeUserId ?? undefined,
            };
        });
}

async function loadRiskEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.risk.findMany({
        where: {
            tenantId: ctx.tenantId,
            OR: [
                { nextReviewAt: { not: null, gte: range.from, lte: range.to } },
                { targetDate: { not: null, gte: range.from, lte: range.to } },
            ],
        },
        select: {
            id: true,
            title: true,
            nextReviewAt: true,
            targetDate: true,
            status: true,
        },
        take: limit,
    });
    const events: CalendarEvent[] = [];
    for (const r of rows) {
        const isClosed = r.status === 'CLOSED' || r.status === 'ACCEPTED';
        if (
            r.nextReviewAt &&
            r.nextReviewAt >= range.from &&
            r.nextReviewAt <= range.to
        ) {
            events.push({
                id: `RISK:${r.id}:risk-review`,
                type: 'risk-review',
                category: 'risk',
                title: `Risk review: ${r.title}`,
                date: r.nextReviewAt.toISOString(),
                status: classifyStatus(r.nextReviewAt, now, isClosed),
                entityType: 'RISK',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/risks/${r.id}`),
            });
        }
        if (
            r.targetDate &&
            r.targetDate >= range.from &&
            r.targetDate <= range.to
        ) {
            events.push({
                id: `RISK:${r.id}:risk-target`,
                type: 'risk-target',
                category: 'risk',
                title: `Risk mitigation target: ${r.title}`,
                date: r.targetDate.toISOString(),
                status: classifyStatus(r.targetDate, now, isClosed),
                entityType: 'RISK',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/risks/${r.id}`),
            });
        }
    }
    return events;
}

async function loadFindingEvents(
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarEvent[]> {
    const rows = await prisma.finding.findMany({
        where: {
            tenantId: ctx.tenantId,
            dueDate: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            dueDate: true,
            status: true,
            owner: true,
        },
        take: limit,
    });
    return rows
        .filter((r) => r.dueDate)
        .map((r): CalendarEvent => {
            const date = r.dueDate as Date;
            const isDone = r.status === 'CLOSED';
            return {
                id: `FINDING:${r.id}:finding-due`,
                type: 'finding-due',
                category: 'finding',
                title: `Finding due: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'FINDING',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/findings/${r.id}`),
                ownerUserId: r.owner ?? undefined,
            };
        });
}

// ─── Lightweight badge query ─────────────────────────────────────────

/**
 * Cheap count of upcoming + overdue deadlines used by the sidebar
 * Calendar nav badge. Bounded to a 7-day forward window + everything
 * already overdue that hasn't been resolved. Caps at `MAX_BADGE_COUNT`
 * so the badge never renders a huge number that's effectively noise
 * (we render `99+` past the cap on the UI side).
 */
const MAX_BADGE_COUNT = 99;

export async function getUpcomingDeadlineCount(
    ctx: RequestContext,
    options: { now?: Date; horizonDays?: number } = {},
): Promise<number> {
    assertCanRead(ctx);
    const now = options.now ?? new Date();
    const horizon = new Date(
        now.getTime() + (options.horizonDays ?? 7) * 86_400_000,
    );

    // Count, don't fetch — we only need a number for the badge. The
    // `take: MAX_BADGE_COUNT + 1` pattern lets us know if the real
    // number exceeds the cap without doing a full COUNT.
    const [tasks, controls, evidence, policies, vendors] = await Promise.all([
        prisma.task.count({
            where: {
                tenantId: ctx.tenantId,
                dueAt: { not: null, lte: horizon },
                status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELED'] },
            },
            take: MAX_BADGE_COUNT + 1,
        }),
        prisma.control.count({
            where: {
                tenantId: ctx.tenantId,
                deletedAt: null,
                applicability: 'APPLICABLE',
                nextDueAt: { not: null, lte: horizon },
                status: { notIn: ['IMPLEMENTED', 'NOT_APPLICABLE'] },
            },
            take: MAX_BADGE_COUNT + 1,
        }),
        prisma.evidence.count({
            where: {
                tenantId: ctx.tenantId,
                nextReviewDate: { not: null, lte: horizon },
                status: { not: 'APPROVED' },
            },
            take: MAX_BADGE_COUNT + 1,
        }),
        prisma.policy.count({
            where: {
                tenantId: ctx.tenantId,
                nextReviewAt: { not: null, lte: horizon },
                status: { not: 'ARCHIVED' },
            },
            take: MAX_BADGE_COUNT + 1,
        }),
        prisma.vendor.count({
            where: {
                tenantId: ctx.tenantId,
                status: { not: 'OFFBOARDED' },
                OR: [
                    { nextReviewAt: { not: null, lte: horizon } },
                    { contractRenewalAt: { not: null, lte: horizon } },
                ],
            },
            take: MAX_BADGE_COUNT + 1,
        }),
    ]);

    return Math.min(
        MAX_BADGE_COUNT + 1,
        tasks + controls + evidence + policies + vendors,
    );
}
