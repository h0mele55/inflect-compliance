/**
 * Epic O-2 — organization members.
 *
 *   POST /api/org/[orgSlug]/members
 *     add an ORG_ADMIN or ORG_READER. ORG_ADMIN add triggers fan-out
 *     of AUDITOR memberships into every existing org tenant.
 *
 *   DELETE /api/org/[orgSlug]/members?userId=...
 *     remove a member. ORG_ADMIN remove triggers fan-in of the
 *     auto-provisioned AUDITOR memberships (only those tagged with
 *     this org's id; manual memberships are preserved). Last-
 *     ORG_ADMIN guard refuses to orphan the org.
 *
 * Both gated by `canManageMembers` (ORG_ADMIN only).
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { AddOrgMemberInput } from '@/app-layer/schemas/organization.schemas';
import { addOrgMember, removeOrgMember } from '@/app-layer/usecases/org-members';
import { badRequest, forbidden } from '@/lib/errors/types';

interface RouteContext {
    params: { orgSlug: string };
}

export const POST = withApiErrorHandling(
    withValidatedBody(
        AddOrgMemberInput,
        async (req: NextRequest, routeCtx: RouteContext, body) => {
            const ctx = await getOrgCtx(routeCtx.params, req);
            if (!ctx.permissions.canManageMembers) {
                throw forbidden('You do not have permission to manage members of this organization');
            }

            const result = await addOrgMember(ctx, {
                userEmail: body.userEmail,
                role: body.role,
            });

            return NextResponse.json(
                {
                    membership: result.membership,
                    user: result.user,
                    provisioned: result.provision
                        ? {
                              created: result.provision.created,
                              skipped: result.provision.skipped,
                              totalConsidered: result.provision.totalConsidered,
                          }
                        : null,
                },
                { status: 201 },
            );
        },
    ),
);

export const DELETE = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx(routeCtx.params, req);
        if (!ctx.permissions.canManageMembers) {
            throw forbidden('You do not have permission to manage members of this organization');
        }

        const userId = req.nextUrl.searchParams.get('userId');
        if (!userId) {
            throw badRequest('Missing userId query parameter');
        }

        const result = await removeOrgMember(ctx, { userId });

        return NextResponse.json({
            deleted: true,
            wasOrgAdmin: result.wasOrgAdmin,
            deprovisioned: result.deprovision
                ? {
                      deleted: result.deprovision.deleted,
                      tenantIds: result.deprovision.tenantIds,
                  }
                : null,
        });
    },
);
