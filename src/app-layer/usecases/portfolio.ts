/**
 * Epic O-3 — portfolio aggregation usecases.
 *
 * Three pure functions that turn snapshot reads into the typed
 * DTOs the org dashboard renders:
 *
 *   - `getPortfolioSummary(ctx)`           org-wide totals + RAG bucket counts
 *   - `getPortfolioTenantHealth(ctx)`      per-tenant rows for the portfolio table
 *   - `getPortfolioTrends(ctx, days)`      org-wide time-series for charting
 *
 * All three are read-only, side-effect-free, and consume the
 * `PortfolioRepository` for data access. RLS posture: the repository
 * runs every query against the global Prisma client (postgres role)
 * because the rows it touches — `Tenant` (metadata only) and
 * `ComplianceSnapshot` (org-wide aggregates) — are read at the
 * org-management layer, not the per-tenant data plane. Drill-down
 * INTO any tenant goes through standard `runInTenantContext` with
 * the CISO's auto-provisioned AUDITOR membership; that's a separate
 * Epic O-3 follow-up.
 *
 * Authorization: callers must pass an `OrgContext` (i.e. they came
 * through `getOrgCtx` and were verified as an OrgMembership holder).
 * The usecases additionally check `canViewPortfolio` so an
 * un-permitted org role can't sneak in via direct usecase
 * invocation.
 */

import type { ComplianceSnapshot } from '@prisma/client';

import type { OrgContext } from '@/app-layer/types';
import { forbidden } from '@/lib/errors/types';
import {
    PortfolioRepository,
    type OrgTenantMeta,
    type SnapshotTrendRow,
} from '@/app-layer/repositories/PortfolioRepository';
import {
    type PortfolioSummary,
    type TenantHealthRow,
    type PortfolioTrend,
    type PortfolioTrendDataPoint,
    type NonPerformingControlRow,
    type CriticalRiskRow,
    type OverdueEvidenceRow,
    computeRag,
} from '@/app-layer/schemas/portfolio';
import { withTenantDb } from '@/lib/db-context';

// ── Internal helpers ──────────────────────────────────────────────────

function bpsToPercent(bps: number): number {
    return bps / 10;
}

/** Avoid divide-by-zero for the org-wide coverage. Returns 0 when the
 *  org has no applicable controls anywhere. */
function safeCoveragePercent(implemented: number, applicable: number): number {
    if (applicable <= 0) return 0;
    return Math.min(100, Math.max(0, (implemented / applicable) * 100));
}

function toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function trendRowToDataPoint(row: SnapshotTrendRow): PortfolioTrendDataPoint {
    return {
        date: toIsoDate(row.snapshotDate),
        controlCoveragePercent: safeCoveragePercent(
            row.controlsImplemented,
            row.controlsApplicable,
        ),
        controlsImplemented: row.controlsImplemented,
        controlsApplicable: row.controlsApplicable,
        risksTotal: row.risksTotal,
        risksOpen: row.risksOpen,
        risksCritical: row.risksCritical,
        risksHigh: row.risksHigh,
        evidenceOverdue: row.evidenceOverdue,
        evidenceDueSoon7d: row.evidenceDueSoon7d,
        evidenceCurrent: row.evidenceCurrent,
        policiesTotal: row.policiesTotal,
        policiesOverdueReview: row.policiesOverdueReview,
        tasksOpen: row.tasksOpen,
        tasksOverdue: row.tasksOverdue,
        findingsOpen: row.findingsOpen,
    };
}

function assertCanViewPortfolio(ctx: OrgContext): void {
    if (!ctx.permissions.canViewPortfolio) {
        throw forbidden('Portfolio view requires an active org membership');
    }
}

// ═════════════════════════════════════════════════════════════════════
// Shared base-data loader + pure projections
// ═════════════════════════════════════════════════════════════════════
//
// `getPortfolioSummary` and `getPortfolioTenantHealth` both rely on
// the same two upstream reads:
//
//   1. PortfolioRepository.getOrgTenantIds(orgId)
//   2. PortfolioRepository.getLatestSnapshots(tenantIds)
//
// When the overview page calls them in parallel via `Promise.all`,
// each does its own pair of fetches — 4 identical queries instead of
// 2. As org size grows that overhead scales linearly with the number
// of widgets sharing the same upstream.
//
// The fix splits each downstream usecase into:
//
//   - a pure projection function (snapshots → DTO) that takes the
//     base data as input
//   - a thin public usecase that loads the base data once and calls
//     the projection
//
// A new orchestrator `getPortfolioOverview(ctx)` calls the loader
// ONCE and projects all three DTOs (summary + tenant-health + trends)
// from the shared upstream. The overview page consumes the
// orchestrator instead of three independent usecases — net 3 DB
// queries (tenants + snapshots + trends) regardless of how many
// downstream DTOs reuse the same base.
//
// The standalone usecases stay supported for the API route's
// per-view dispatch (`view=summary` / `view=health` / `view=trends`)
// where each request only needs one DTO. Both paths share the same
// projection logic — projection bugs are a single-source fix.

interface PortfolioBaseData {
    /** Every tenant linked to the org, ordered by creation. */
    tenants: OrgTenantMeta[];
    /** Latest snapshot per tenant within the 14-day staleness window.
     *  Tenants with no recent snapshot are omitted — callers detect
     *  "snapshot pending" by diffing against `tenants`. */
    snapshots: ComplianceSnapshot[];
    /** Pre-built tenantId → snapshot map for O(1) lookup downstream. */
    snapshotsByTenant: Map<string, ComplianceSnapshot>;
}

async function loadPortfolioBaseData(orgId: string): Promise<PortfolioBaseData> {
    const tenants = await PortfolioRepository.getOrgTenantIds(orgId);
    const tenantIds = tenants.map((t) => t.id);
    const snapshots = await PortfolioRepository.getLatestSnapshots(tenantIds);
    const snapshotsByTenant = new Map(snapshots.map((s) => [s.tenantId, s]));
    return { tenants, snapshots, snapshotsByTenant };
}

function projectPortfolioSummary(
    ctx: OrgContext,
    base: PortfolioBaseData,
): PortfolioSummary {
    const { tenants, snapshots, snapshotsByTenant } = base;

    let controlsApplicable = 0;
    let controlsImplemented = 0;
    let risksTotal = 0;
    let risksOpen = 0;
    let risksCritical = 0;
    let risksHigh = 0;
    let evidenceTotal = 0;
    let evidenceOverdue = 0;
    let evidenceDueSoon7d = 0;
    let policiesTotal = 0;
    let policiesOverdueReview = 0;
    let tasksOpen = 0;
    let tasksOverdue = 0;
    let findingsOpen = 0;

    let green = 0;
    let amber = 0;
    let red = 0;
    let pending = 0;

    for (const t of tenants) {
        const s = snapshotsByTenant.get(t.id);
        if (!s) {
            pending++;
            continue;
        }
        controlsApplicable += s.controlsApplicable;
        controlsImplemented += s.controlsImplemented;
        risksTotal += s.risksTotal;
        risksOpen += s.risksOpen;
        risksCritical += s.risksCritical;
        risksHigh += s.risksHigh;
        evidenceTotal += s.evidenceTotal;
        evidenceOverdue += s.evidenceOverdue;
        evidenceDueSoon7d += s.evidenceDueSoon7d;
        policiesTotal += s.policiesTotal;
        policiesOverdueReview += s.policiesOverdueReview;
        tasksOpen += s.tasksOpen;
        tasksOverdue += s.tasksOverdue;
        findingsOpen += s.findingsOpen;

        const rag = computeRag({
            coveragePercent: bpsToPercent(s.controlCoverageBps),
            criticalRisks: s.risksCritical,
            overdueEvidence: s.evidenceOverdue,
        });
        if (rag === 'GREEN') green++;
        else if (rag === 'AMBER') amber++;
        else red++;
    }

    return {
        organizationId: ctx.organizationId,
        organizationSlug: ctx.orgSlug,
        generatedAt: new Date().toISOString(),
        tenants: {
            total: tenants.length,
            snapshotted: snapshots.length,
            pending,
        },
        controls: {
            applicable: controlsApplicable,
            implemented: controlsImplemented,
            coveragePercent: safeCoveragePercent(
                controlsImplemented,
                controlsApplicable,
            ),
        },
        risks: {
            total: risksTotal,
            open: risksOpen,
            critical: risksCritical,
            high: risksHigh,
        },
        evidence: {
            total: evidenceTotal,
            overdue: evidenceOverdue,
            dueSoon7d: evidenceDueSoon7d,
        },
        policies: {
            total: policiesTotal,
            overdueReview: policiesOverdueReview,
        },
        tasks: {
            open: tasksOpen,
            overdue: tasksOverdue,
        },
        findings: {
            open: findingsOpen,
        },
        rag: { green, amber, red, pending },
    };
}

function projectPortfolioTenantHealth(base: PortfolioBaseData): TenantHealthRow[] {
    const { tenants, snapshotsByTenant } = base;
    return tenants.map((t): TenantHealthRow => {
        const s = snapshotsByTenant.get(t.id);
        if (!s) {
            return {
                tenantId: t.id,
                slug: t.slug,
                name: t.name,
                drillDownUrl: `/t/${t.slug}/dashboard`,
                hasSnapshot: false,
                snapshotDate: null,
                coveragePercent: null,
                openRisks: null,
                criticalRisks: null,
                overdueEvidence: null,
                rag: null,
            };
        }
        const coveragePercent = bpsToPercent(s.controlCoverageBps);
        return {
            tenantId: t.id,
            slug: t.slug,
            name: t.name,
            drillDownUrl: `/t/${t.slug}/dashboard`,
            hasSnapshot: true,
            snapshotDate: toIsoDate(s.snapshotDate),
            coveragePercent,
            openRisks: s.risksOpen,
            criticalRisks: s.risksCritical,
            overdueEvidence: s.evidenceOverdue,
            rag: computeRag({
                coveragePercent,
                criticalRisks: s.risksCritical,
                overdueEvidence: s.evidenceOverdue,
            }),
        };
    });
}

function clampTrendDays(days: number): number {
    return Math.min(Math.max(days, 1), 365);
}

function projectPortfolioTrends(
    organizationId: string,
    effectiveDays: number,
    rows: SnapshotTrendRow[],
): PortfolioTrend {
    const rangeEnd = new Date();
    rangeEnd.setUTCHours(23, 59, 59, 999);
    const rangeStart = new Date(
        rangeEnd.getTime() - effectiveDays * 86400 * 1000,
    );
    rangeStart.setUTCHours(0, 0, 0, 0);

    const dataPoints = rows.map(trendRowToDataPoint);
    const tenantsAggregated =
        rows.length > 0 ? Math.max(...rows.map((r) => r.tenantsContributing)) : 0;

    return {
        organizationId,
        daysRequested: effectiveDays,
        daysAvailable: dataPoints.length,
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
        tenantsAggregated,
        dataPoints,
    };
}

// ── getPortfolioSummary ───────────────────────────────────────────────

export async function getPortfolioSummary(
    ctx: OrgContext,
): Promise<PortfolioSummary> {
    assertCanViewPortfolio(ctx);
    const base = await loadPortfolioBaseData(ctx.organizationId);
    return projectPortfolioSummary(ctx, base);
}

// ── getPortfolioTenantHealth ──────────────────────────────────────────

export async function getPortfolioTenantHealth(
    ctx: OrgContext,
): Promise<TenantHealthRow[]> {
    assertCanViewPortfolio(ctx);
    const base = await loadPortfolioBaseData(ctx.organizationId);
    return projectPortfolioTenantHealth(base);
}

// ── getPortfolioTrends ────────────────────────────────────────────────

// ── Cross-tenant drill-downs (RLS-enforced) ──────────────────────────
//
// CRITICAL SECURITY INVARIANT: these usecases iterate the org's
// tenants and run each per-tenant query INSIDE `withTenantDb(tid)`.
// That helper:
//   1. Enters a Prisma transaction
//   2. SET LOCAL ROLE app_user                  ← drops privilege
//   3. SELECT set_config('app.tenant_id', $1)    ← binds tenant ctx
//
// Inside the callback, every read against tenant-scoped tables runs
// under FORCE ROW LEVEL SECURITY. The CISO is granted read access
// only because the Epic O-2 auto-provisioning service created an
// AUDITOR `TenantMembership` for them in each child tenant. Without
// that membership, the per-tenant query returns ZERO rows — the
// portfolio drill-down never crosses tenant boundaries via a
// privilege bypass; it just walks N legitimate per-tenant queries.
//
// Reasoning about why this is correct:
//   - We do NOT call `runInGlobalContext` for per-row business data.
//   - We do NOT issue a single cross-tenant query against the
//     business tables — every query targets exactly one tenantId.
//   - If the CISO is removed as ORG_ADMIN, the deprovision usecase
//     deletes their AUDITOR rows, and the same drill-down loop
//     starts returning zero rows per tenant (empty results, no
//     errors) — the security envelope shrinks automatically.
//
// Performance posture:
//   100 tenants × ~5ms indexed query per tenant ≈ ~500ms total
//   sequential. Acceptable for a dashboard load. For 200+ tenants
//   the architecture doc proposes chunked Promise.all(10) or a
//   materialised cross-tenant view; both are out of scope here.
//
// Per-tenant `take` is 20 — bounds the worst-case row count to
// 100 × 20 = 2000 candidates. The final result list is capped at 50
// after global sort (so the UI stays snappy and the worst-case
// payload is a few KB).

const PER_TENANT_LIMIT = 20;
const PORTFOLIO_DRILLDOWN_LIMIT = 50;

/**
 * Generic per-tenant fan-out helper. Runs `query` once per tenant
 * inside its own RLS-enforced transaction, then flattens + applies
 * `sortAndLimit` to the merged result.
 *
 * Each per-tenant call is awaited sequentially. Sequential is the
 * safe default — `withTenantDb` opens a transaction per call, and a
 * burst of 100 parallel transactions could exhaust the connection
 * pool. The work is small enough (~5ms each) that the total stays
 * inside dashboard-load budgets.
 */
async function fanOutPerTenant<TRow>(
    tenants: OrgTenantMeta[],
    query: (db: import('@/lib/db-context').PrismaTx, tenant: OrgTenantMeta) => Promise<TRow[]>,
    sortAndLimit: (rows: TRow[]) => TRow[],
): Promise<TRow[]> {
    if (tenants.length === 0) return [];
    const merged: TRow[] = [];
    for (const t of tenants) {
        const rows = await withTenantDb(t.id, (db) => query(db, t));
        merged.push(...rows);
    }
    return sortAndLimit(merged);
}

// Status priority for the non-performing controls sort. Higher number
// = more urgent. Locks the visual ordering: NEEDS_REVIEW first
// (something acted-on but not finished), then NOT_STARTED (forgotten),
// then in-flight states.
const CONTROL_STATUS_PRIORITY: Record<string, number> = {
    NEEDS_REVIEW: 5,
    NOT_STARTED: 4,
    PLANNED: 3,
    IN_PROGRESS: 2,
    IMPLEMENTING: 1,
};

export async function getNonPerformingControls(
    ctx: OrgContext,
): Promise<NonPerformingControlRow[]> {
    assertCanViewPortfolio(ctx);
    const tenants = await PortfolioRepository.getOrgTenantIds(ctx.organizationId);

    return fanOutPerTenant<NonPerformingControlRow>(
        tenants,
        async (db, tenant) => {
            const rows = await db.control.findMany({
                where: {
                    tenantId: tenant.id,
                    status: { notIn: ['IMPLEMENTED', 'NOT_APPLICABLE'] },
                    applicability: 'APPLICABLE',
                    deletedAt: null,
                },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    status: true,
                    updatedAt: true,
                },
                orderBy: { updatedAt: 'desc' },
                take: PER_TENANT_LIMIT,
            });
            return rows.map((c): NonPerformingControlRow => ({
                controlId: c.id,
                tenantId: tenant.id,
                tenantSlug: tenant.slug,
                tenantName: tenant.name,
                name: c.name,
                code: c.code ?? null,
                // The Prisma enum is a TS string union by codegen; the DTO
                // narrows to the non-performing subset via Zod at the API
                // boundary. The runtime invariant matches because the
                // findMany WHERE clause excludes the two terminal states.
                status: c.status as NonPerformingControlRow['status'],
                updatedAt: c.updatedAt.toISOString(),
                drillDownUrl: `/t/${tenant.slug}/controls/${c.id}`,
            }));
        },
        (rows) =>
            rows
                .sort((a, b) => {
                    const pa = CONTROL_STATUS_PRIORITY[a.status] ?? 0;
                    const pb = CONTROL_STATUS_PRIORITY[b.status] ?? 0;
                    if (pa !== pb) return pb - pa;
                    return b.updatedAt.localeCompare(a.updatedAt);
                })
                .slice(0, PORTFOLIO_DRILLDOWN_LIMIT),
    );
}

export async function getCriticalRisksAcrossOrg(
    ctx: OrgContext,
): Promise<CriticalRiskRow[]> {
    assertCanViewPortfolio(ctx);
    const tenants = await PortfolioRepository.getOrgTenantIds(ctx.organizationId);

    return fanOutPerTenant<CriticalRiskRow>(
        tenants,
        async (db, tenant) => {
            // "Critical" = inherentScore >= 15 (5×5 matrix top tier) AND
            // still actionable (status != CLOSED). The architecture doc's
            // hint of `inherentScore >= 15 OR status = 'OPEN'` would also
            // surface every low-severity OPEN risk and clutter the
            // portfolio view; the AND interpretation is what a CISO
            // monitoring critical risk actually wants.
            const rows = await db.risk.findMany({
                where: {
                    tenantId: tenant.id,
                    inherentScore: { gte: 15 },
                    status: { not: 'CLOSED' },
                    deletedAt: null,
                },
                select: {
                    id: true,
                    title: true,
                    inherentScore: true,
                    status: true,
                    updatedAt: true,
                },
                orderBy: [{ inherentScore: 'desc' }, { updatedAt: 'desc' }],
                take: PER_TENANT_LIMIT,
            });
            return rows.map((r): CriticalRiskRow => ({
                riskId: r.id,
                tenantId: tenant.id,
                tenantSlug: tenant.slug,
                tenantName: tenant.name,
                title: r.title,
                inherentScore: r.inherentScore,
                status: r.status as CriticalRiskRow['status'],
                updatedAt: r.updatedAt.toISOString(),
                drillDownUrl: `/t/${tenant.slug}/risks/${r.id}`,
            }));
        },
        (rows) =>
            rows
                .sort((a, b) => {
                    if (a.inherentScore !== b.inherentScore) {
                        return b.inherentScore - a.inherentScore;
                    }
                    return b.updatedAt.localeCompare(a.updatedAt);
                })
                .slice(0, PORTFOLIO_DRILLDOWN_LIMIT),
    );
}

export async function getOverdueEvidenceAcrossOrg(
    ctx: OrgContext,
): Promise<OverdueEvidenceRow[]> {
    assertCanViewPortfolio(ctx);
    const tenants = await PortfolioRepository.getOrgTenantIds(ctx.organizationId);
    const now = new Date();
    const dayMs = 86400 * 1000;

    return fanOutPerTenant<OverdueEvidenceRow>(
        tenants,
        async (db, tenant) => {
            const rows = await db.evidence.findMany({
                where: {
                    tenantId: tenant.id,
                    nextReviewDate: { lt: now },
                    status: { not: 'APPROVED' },
                    deletedAt: null,
                },
                select: {
                    id: true,
                    title: true,
                    nextReviewDate: true,
                    status: true,
                },
                // Oldest overdue first — most urgent at the top of the
                // per-tenant slice. The merged sort below applies the
                // same ordering globally.
                orderBy: { nextReviewDate: 'asc' },
                take: PER_TENANT_LIMIT,
            });
            return rows
                // findMany WHERE has nextReviewDate < now, but Prisma
                // narrows the field to `Date | null`. Filter the type.
                .filter(
                    (e): e is typeof e & { nextReviewDate: Date } =>
                        e.nextReviewDate !== null,
                )
                .map((e): OverdueEvidenceRow => {
                    const ms = now.getTime() - e.nextReviewDate.getTime();
                    return {
                        evidenceId: e.id,
                        tenantId: tenant.id,
                        tenantSlug: tenant.slug,
                        tenantName: tenant.name,
                        title: e.title,
                        nextReviewDate: e.nextReviewDate.toISOString().slice(0, 10),
                        daysOverdue: Math.max(1, Math.floor(ms / dayMs)),
                        status: e.status as OverdueEvidenceRow['status'],
                        drillDownUrl: `/t/${tenant.slug}/evidence/${e.id}`,
                    };
                });
        },
        (rows) =>
            rows
                .sort((a, b) => b.daysOverdue - a.daysOverdue)
                .slice(0, PORTFOLIO_DRILLDOWN_LIMIT),
    );
}

export async function getPortfolioTrends(
    ctx: OrgContext,
    days: number = 90,
): Promise<PortfolioTrend> {
    assertCanViewPortfolio(ctx);
    const effectiveDays = clampTrendDays(days);
    const tenants = await PortfolioRepository.getOrgTenantIds(ctx.organizationId);
    const tenantIds = tenants.map((t) => t.id);
    const rows = await PortfolioRepository.getSnapshotTrends(tenantIds, effectiveDays);
    return projectPortfolioTrends(ctx.organizationId, effectiveDays, rows);
}

// ── getPortfolioOverview ──────────────────────────────────────────────

export interface PortfolioOverview {
    summary: PortfolioSummary;
    tenantHealth: TenantHealthRow[];
    trends: PortfolioTrend;
}

export interface GetPortfolioOverviewOptions {
    /** Trend window in days. Clamped to [1, 365]. Default 90. */
    trendDays?: number;
}

/**
 * Single-fetch orchestrator for the org overview page.
 *
 * Loads the base data (tenant list + latest snapshots) ONCE and runs
 * the trend query in parallel against the same tenant list, then
 * projects all three DTOs. Replaces the previous `Promise.all([
 * getPortfolioSummary, getPortfolioTenantHealth, getPortfolioTrends ])`
 * pattern which fired three independent `getOrgTenantIds` and two
 * independent `getLatestSnapshots` queries.
 *
 * Net DB calls: 3 (tenants × 1, latestSnapshots × 1, trends × 1)
 * regardless of how many downstream DTOs reuse the same base.
 *
 * The standalone `getPortfolioSummary`, `getPortfolioTenantHealth`,
 * and `getPortfolioTrends` continue to support per-view API
 * dispatch (`view=summary` / `view=health` / `view=trends`) where
 * each request only needs one DTO and the shared-fetch saving
 * doesn't apply.
 */
export async function getPortfolioOverview(
    ctx: OrgContext,
    options: GetPortfolioOverviewOptions = {},
): Promise<PortfolioOverview> {
    assertCanViewPortfolio(ctx);
    const effectiveDays = clampTrendDays(options.trendDays ?? 90);

    const tenants = await PortfolioRepository.getOrgTenantIds(ctx.organizationId);
    const tenantIds = tenants.map((t) => t.id);

    const [snapshots, trendRows] = await Promise.all([
        PortfolioRepository.getLatestSnapshots(tenantIds),
        PortfolioRepository.getSnapshotTrends(tenantIds, effectiveDays),
    ]);

    const base: PortfolioBaseData = {
        tenants,
        snapshots,
        snapshotsByTenant: new Map(snapshots.map((s) => [s.tenantId, s])),
    };

    return {
        summary: projectPortfolioSummary(ctx, base),
        tenantHealth: projectPortfolioTenantHealth(base),
        trends: projectPortfolioTrends(ctx.organizationId, effectiveDays, trendRows),
    };
}
