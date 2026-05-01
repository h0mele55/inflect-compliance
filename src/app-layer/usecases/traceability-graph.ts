/**
 * Epic 47.1 — `getTraceabilityGraph` usecase.
 *
 * Pulls every Control / Risk / Asset for the calling tenant plus
 * the three relationship link tables (`RiskControl`,
 * `ControlAsset`, `AssetRiskLink`) and assembles them into a
 * typed, capped, category-tagged graph payload via
 * `buildTraceabilityGraph`.
 *
 * Authz: any authenticated tenant member (read-only). Mirrors the
 * existing `getControlTraceability` etc. usecases — those are also
 * unconditionally readable per `assertCanRead` in
 * `traceability.ts`.
 *
 * Tenant scoping: every read happens inside `runInTenantContext`
 * so the `app.tenant_id` setting is bound + the role drops to
 * `app_user`. RLS makes cross-tenant reads architecturally
 * impossible at the DB layer; the explicit `tenantId` filter is
 * defence-in-depth.
 */

import { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { forbidden } from '@/lib/errors/types';
import {
    buildTraceabilityGraph,
    type RawAsset,
    type RawControl,
    type RawLink,
    type RawRisk,
} from '@/lib/traceability-graph/build';
import {
    DEFAULT_NODE_CAP,
    type TraceabilityGraph,
    type TraceabilityGraphFilters,
    type TraceabilityNodeKind,
} from '@/lib/traceability-graph/types';

export interface GetTraceabilityGraphOptions {
    filters?: TraceabilityGraphFilters;
    /** Override the soft node cap. Useful in tests. */
    nodeCap?: number;
}

export async function getTraceabilityGraph(
    ctx: RequestContext,
    options: GetTraceabilityGraphOptions = {},
): Promise<TraceabilityGraph> {
    if (!ctx.role) {
        throw forbidden('Authentication required');
    }

    const filters = options.filters ?? {};
    const wantKinds = filters.kinds && filters.kinds.length > 0
        ? new Set<TraceabilityNodeKind>(filters.kinds)
        : null;

    return runInTenantContext(ctx, async (db) => {
        // Run the 6 reads in parallel — the bottleneck is the link
        // table joins, not the entity fetches. Each respects RLS
        // independently; explicit `tenantId` filter is defence-in-
        // depth, matching every other usecase in this layer.
        const [
            controls,
            risks,
            assets,
            riskControls,
            controlAssets,
            assetRisks,
        ] = await Promise.all([
            wantKinds && !wantKinds.has('control')
                ? Promise.resolve([] as RawControl[])
                : db.control.findMany({
                      where: { tenantId: ctx.tenantId },
                      select: { id: true, code: true, name: true, status: true },
                  }),
            wantKinds && !wantKinds.has('risk')
                ? Promise.resolve([] as RawRisk[])
                : db.risk.findMany({
                      where: { tenantId: ctx.tenantId },
                      select: {
                          id: true,
                          title: true,
                          score: true,
                          status: true,
                          category: true,
                      },
                  }),
            wantKinds && !wantKinds.has('asset')
                ? Promise.resolve([] as RawAsset[])
                : db.asset.findMany({
                      where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
                      select: {
                          id: true,
                          name: true,
                          type: true,
                          criticality: true,
                          status: true,
                      },
                  }),
            db.riskControl.findMany({
                where: { tenantId: ctx.tenantId },
                select: { id: true, riskId: true, controlId: true },
            }),
            db.controlAsset.findMany({
                where: { tenantId: ctx.tenantId },
                select: {
                    id: true,
                    controlId: true,
                    assetId: true,
                    coverageType: true,
                },
            }),
            db.assetRiskLink.findMany({
                where: { tenantId: ctx.tenantId },
                select: {
                    id: true,
                    assetId: true,
                    riskId: true,
                    exposureLevel: true,
                },
            }),
        ]);

        // Tag each link with its semantic relation. The graph
        // builder sees these as one homogeneous list and just
        // filters by surviving endpoint set.
        const links: RawLink[] = [
            ...riskControls.map((l) => ({
                id: `rc:${l.id}`,
                a: l.controlId,
                b: l.riskId,
                relation: 'mitigates' as const,
                qualifier: null,
            })),
            ...controlAssets.map((l) => ({
                id: `ca:${l.id}`,
                a: l.controlId,
                b: l.assetId,
                relation: 'protects' as const,
                qualifier: l.coverageType,
            })),
            ...assetRisks.map((l) => ({
                id: `ar:${l.id}`,
                a: l.assetId,
                b: l.riskId,
                relation: 'exposes' as const,
                qualifier: l.exposureLevel,
            })),
        ];

        return buildTraceabilityGraph({
            // ctx.tenantSlug is optional on the type; the route
            // path always includes it, so a missing value here is
            // a programmer error. Fall back to '' so href generation
            // produces a clearly-broken link rather than crashing.
            tenantSlug: ctx.tenantSlug ?? '',
            controls,
            risks,
            assets,
            links,
            filters,
            nodeCap: options.nodeCap ?? DEFAULT_NODE_CAP,
        });
    });
}
