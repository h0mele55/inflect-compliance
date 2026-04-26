/**
 * Epic O-3 — portfolio dashboard read API.
 *
 *   GET /api/org/[orgSlug]/portfolio?view=<name>
 *
 *   view = summary  | health   | trends      ← snapshot aggregation
 *        = controls | risks    | evidence    ← cross-tenant drill-down
 *
 * Permission model:
 *   - All views require `canViewPortfolio` (any org member with that
 *     flag — ORG_ADMIN + ORG_READER).
 *   - Drill-down views additionally require `canDrillDown`. ORG_READERs
 *     don't have auto-provisioned AUDITOR membership in the child
 *     tenants, so the drill-down would return zero rows anyway under
 *     RLS. Failing fast at 403 makes the UX deterministic.
 *
 * Read-only. Wrapped with `withApiErrorHandling` for the standard
 * x-request-id / observability / error-shape handling. No
 * `withValidatedBody` because GET routes don't carry a body.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { badRequest, forbidden } from '@/lib/errors/types';
import {
    getPortfolioSummary,
    getPortfolioTenantHealth,
    getPortfolioTrends,
    getNonPerformingControls,
    getCriticalRisksAcrossOrg,
    getOverdueEvidenceAcrossOrg,
} from '@/app-layer/usecases/portfolio';

const SUPPORTED_VIEWS = [
    'summary',
    'health',
    'trends',
    'controls',
    'risks',
    'evidence',
] as const;
type View = (typeof SUPPORTED_VIEWS)[number];

const DRILL_DOWN_VIEWS: ReadonlySet<View> = new Set(['controls', 'risks', 'evidence']);

interface RouteContext {
    params: { orgSlug: string };
}

export const GET = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx(routeCtx.params, req);

        const rawView = req.nextUrl.searchParams.get('view');
        if (!rawView) {
            throw badRequest('Missing required query parameter: view');
        }
        if (!(SUPPORTED_VIEWS as readonly string[]).includes(rawView)) {
            throw badRequest(
                `Unsupported view '${rawView}'. Supported: ${SUPPORTED_VIEWS.join(', ')}`,
            );
        }
        const view = rawView as View;

        // Drill-down views need both canViewPortfolio (covered by usecase
        // assert) AND canDrillDown (route-level fail-fast). The usecases
        // themselves only check canViewPortfolio because the cross-
        // tenant safety property is enforced by the AUDITOR-membership
        // RLS at the data plane — but failing at the route layer gives
        // ORG_READERs a clean 403 rather than an empty array.
        if (DRILL_DOWN_VIEWS.has(view) && !ctx.permissions.canDrillDown) {
            throw forbidden(
                'Drill-down access is restricted to org admins with auto-provisioned tenant access',
            );
        }

        switch (view) {
            case 'summary':
                return NextResponse.json(await getPortfolioSummary(ctx));

            case 'health':
                return NextResponse.json({
                    rows: await getPortfolioTenantHealth(ctx),
                });

            case 'trends': {
                const daysParam = req.nextUrl.searchParams.get('days');
                const days = daysParam ? Number.parseInt(daysParam, 10) : 90;
                if (!Number.isFinite(days) || days < 1) {
                    throw badRequest('Invalid days parameter; must be a positive integer');
                }
                return NextResponse.json(await getPortfolioTrends(ctx, days));
            }

            case 'controls':
                return NextResponse.json({
                    rows: await getNonPerformingControls(ctx),
                });

            case 'risks':
                return NextResponse.json({
                    rows: await getCriticalRisksAcrossOrg(ctx),
                });

            case 'evidence':
                return NextResponse.json({
                    rows: await getOverdueEvidenceAcrossOrg(ctx),
                });
        }
    },
);
